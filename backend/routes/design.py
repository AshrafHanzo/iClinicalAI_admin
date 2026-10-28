"""
DESIGN Workspace Routes
Studies, protocol versions and Protocol Intelligence (Feature 01). Analysis capabilities
(Features 06, 07, 10, 11, 12) live in routes/design_analysis.py and share these helpers.
"""

import io
import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

import services.db_service as db_service
from config import MAX_FILE_SIZE_MB, UPLOAD_DIR
from database import DocumentDB, ProtocolVersionDB, SessionLocal, StudyDB, StudyMemberDB, UserDB, get_db
from routes.auth import get_current_user
from services import design_store as store
from services import protocol_intelligence as pi_engine
from services.design_exports import XLSX_MIME, pi_to_xlsx
from services.protocol_processing import (ProtocolValidationError, process_protocol, sha256_bytes,
                                          validate_protocol_file)

router = APIRouter(prefix="/api/design", tags=["DESIGN Workspace"])

SUPPORTING_KINDS = {"amendment", "synopsis", "schedule_of_assessments", "statistical_analysis_plan", "other"}


# ─── Serialisers ─────────────────────────────────────────────────────

def version_name(v: ProtocolVersionDB) -> str:
    return v.version_label or f"v{v.sequence}"


def version_dict(db: Session, v: ProtocolVersionDB) -> dict:
    doc = db.query(DocumentDB).filter(DocumentDB.id == v.document_id).first()
    return {
        "id": v.id, "study_id": v.study_id, "document_id": v.document_id, "sequence": v.sequence,
        "label": version_name(v), "version_label": v.version_label, "amendment_number": v.amendment_number,
        "effective_date": v.effective_date, "amendment_reason": v.amendment_reason, "language": v.language,
        "preferences": json.loads(v.preferences_json or "{}"), "supporting": json.loads(v.supporting_json or "[]"),
        "file_sha256": v.file_sha256, "filename": doc.filename if doc else None, "file_type": doc.file_type if doc else None,
        "file_size": doc.file_size if doc else None,
        "processing_status": v.processing_status, "processing_progress": v.processing_progress,
        "processing_message": v.processing_message, "review_status": v.review_status,
        "created_by": v.created_by, "created_at": v.created_at,
    }


def study_dict(db: Session, s: StudyDB, role: str, with_versions: bool = True) -> dict:
    out = {"id": s.id, "study_code": s.study_code, "title": s.title, "sponsor": s.sponsor,
           "therapeutic_area": s.therapeutic_area, "owner_id": s.owner_id, "created_at": s.created_at, "role": role}
    if with_versions:
        versions = db.query(ProtocolVersionDB).filter(ProtocolVersionDB.study_id == s.id).order_by(ProtocolVersionDB.sequence).all()
        out["versions"] = [version_dict(db, v) for v in versions]
    return out


def study_ctx(s: StudyDB) -> dict:
    return {"study_code": s.study_code, "title": s.title}


# ─── Blocks (processed structure) ────────────────────────────────────

def _doc_row(db: Session, document_id: str) -> DocumentDB:
    doc = db.query(DocumentDB).filter(DocumentDB.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Protocol document not found")
    return doc


def load_blocks(db: Session, v: ProtocolVersionDB, include_supporting: bool = False, kinds: set | None = None) -> list[dict]:
    path = Path(_doc_row(db, v.document_id).file_path + ".blocks.json")
    if not path.exists():
        raise HTTPException(status_code=409, detail="This protocol version has not been processed yet")
    blocks = json.loads(path.read_text(encoding="utf-8"))
    if include_supporting:
        for n, s in enumerate(json.loads(v.supporting_json or "[]"), start=1):
            if kinds and s.get("kind") not in kinds:
                continue
            sp = db.query(DocumentDB).filter(DocumentDB.id == s["document_id"]).first()
            if sp and Path(sp.file_path + ".blocks.json").exists():
                for b in json.loads(Path(sp.file_path + ".blocks.json").read_text(encoding="utf-8")):
                    blocks.append({**b, "id": f"s{n}-{b['id']}", "section": f"[{s.get('kind')}: {s.get('filename')}] {b.get('section') or ''}"})
    return blocks


def doc_analyses(db: Session, v: ProtocolVersionDB) -> dict:
    """Saved outputs of the existing DESIGN analyses (features 02–05, 08, 09) for this version's document."""
    doc = db_service.get_document(db, v.document_id)
    return (doc or {}).get("analysis_results") or {}


# ─── Background processing ───────────────────────────────────────────

def _set_status(db: Session, v: ProtocolVersionDB, status: str, progress: int, message: str | None = None):
    v.processing_status, v.processing_progress = status, progress
    if message is not None:
        v.processing_message = message
    db.commit()


def _store_extracted(db: Session, doc: DocumentDB, processed, user_id: str):
    data = db_service.get_document(db, doc.id) or {}
    data.update({
        "id": doc.id, "filename": doc.filename, "safe_filename": doc.safe_filename, "file_path": doc.file_path,
        "file_type": doc.file_type, "file_size": doc.file_size, "upload_time": doc.upload_time,
        "extracted_text": processed.text,
        "stats": {**(data.get("stats") or {}), "word_count": len(processed.text.split()), "page_count": processed.page_count},
        "word_count": len(processed.text.split()), "status": "processed",
        "analysis_results": data.get("analysis_results") or {},
    })
    db_service.save_document(db, data, user_id=user_id)
    Path(doc.file_path + ".blocks.json").write_text(json.dumps(processed.blocks), encoding="utf-8")


async def process_version(version_id: str, user_id: str):
    """Validate → extract structure → extract fields → save. Status is visible to the user throughout."""
    db = SessionLocal()
    try:
        v = db.query(ProtocolVersionDB).filter(ProtocolVersionDB.id == version_id).first()
        if not v:
            return
        prefs = json.loads(v.preferences_json or "{}")
        doc = _doc_row(db, v.document_id)
        try:
            _set_status(db, v, "extracting", 20, "Extracting text, headings, tables and footnotes")
            content = Path(doc.file_path).read_bytes()
            if sha256_bytes(content) != v.file_sha256:
                raise ProtocolValidationError("Stored original does not match its registered checksum.")
            processed = process_protocol(doc.filename, content)
            _store_extracted(db, doc, processed, doc.user_id or user_id)

            prefs = pi_engine.normalize_preferences(prefs)
            supporting = json.loads(v.supporting_json or "[]")
            extraction_blocks = list(processed.blocks)
            for n, s in enumerate(supporting, start=1):
                sdoc = db.query(DocumentDB).filter(DocumentDB.id == s["document_id"]).first()
                try:
                    sp = process_protocol(sdoc.filename, Path(sdoc.file_path).read_bytes())
                    _store_extracted(db, sdoc, sp, None)
                    s["status"] = "processed"
                    if prefs["include_supporting"]:
                        # Same id scheme as load_blocks so evidence from supporting documents stays traceable
                        extraction_blocks += [{**b, "id": f"s{n}-{b['id']}",
                                               "section": f"[{s.get('kind')}: {s.get('filename')}] {b.get('section') or ''}"}
                                              for b in sp.blocks]
                except Exception as e:
                    s["status"], s["error"] = "failed", str(e)[:300]
            v.supporting_json = json.dumps(supporting)

            use_ai = prefs["use_ai"]
            _set_status(db, v, "structuring", 55, "Classifying protocol content" + (" (rule-based and AI)" if use_ai else " (rule-based)"))
            data = await pi_engine.extract_fields(extraction_blocks, v.language, use_ai=use_ai, preferences=prefs)
            data["document"] = {"page_count": processed.page_count, "block_count": len(processed.blocks),
                                "warnings": processed.warnings, "filename": doc.filename, "sha256": v.file_sha256}
            _set_status(db, v, "saving", 90, "Saving extraction")
            store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="protocol_intelligence", data=data,
                                user_id=user_id, method_version=pi_engine.METHOD_VERSION, note="Automatic extraction")
            msgs = list(processed.warnings)
            ex = data["extraction"]
            if ex["ai_error"]:
                msgs.append("AI extraction failed; rule-based extraction only: " + ex["ai_error"])
            elif not ex["ai_used"]:
                msgs.append("AI extraction not used; values come from rule-based extraction.")
            if ex["ai_truncated"]:
                msgs.append("Document exceeded the AI reading limit; later sections were covered by rule-based extraction only.")
            failed_support = [s["filename"] for s in supporting if s.get("status") == "failed"]
            if failed_support:
                msgs.append("Supporting documents that could not be processed: " + ", ".join(failed_support))
            v.review_status = "unverified"
            _set_status(db, v, "completed", 100, " ".join(msgs) or "Extraction complete")
            store.audit(db, user_id, "protocol_processed", v.study_id, v.id, "protocol_version",
                        {"summary": data["summary"], "ai_used": ex["ai_used"]})
        except ProtocolValidationError as e:
            _set_status(db, v, "failed", 100, str(e))
            store.audit(db, user_id, "protocol_processing_failed", v.study_id, v.id, "protocol_version", {"reason": str(e)})
        except Exception as e:
            db.rollback()
            _set_status(db, v, "failed", 100, f"Processing failed ({type(e).__name__}). Retry or contact support.")
            store.audit(db, user_id, "protocol_processing_failed", v.study_id, v.id, "protocol_version", {"error": type(e).__name__})
    finally:
        db.close()


# ─── Studies ─────────────────────────────────────────────────────────

class StudyCreate(BaseModel):
    study_code: str
    title: str = ""
    sponsor: str | None = None
    therapeutic_area: str | None = None


class StudyUpdate(BaseModel):
    title: str | None = None
    sponsor: str | None = None
    therapeutic_area: str | None = None


class MemberAdd(BaseModel):
    email: str
    role: str = "viewer"


@router.get("/studies")
async def list_studies(db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    roles = {m.study_id: m.role for m in db.query(StudyMemberDB).filter(StudyMemberDB.user_id == user.id).all()}
    studies = db.query(StudyDB).filter(StudyDB.id.in_(list(roles) or [""])).order_by(StudyDB.created_at.desc()).all()
    registered = {v.document_id for v in db.query(ProtocolVersionDB).filter(ProtocolVersionDB.study_id.in_(list(roles) or [""])).all()}
    return {"studies": [study_dict(db, s, roles[s.id]) for s in studies], "registered_document_ids": sorted(registered)}


@router.post("/studies")
async def create_study(req: StudyCreate, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    code = req.study_code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Study ID is required")
    mine = store.study_ids_for_user(db, user.id)
    if db.query(StudyDB).filter(StudyDB.id.in_(mine or [""]), StudyDB.study_code == code).first():
        raise HTTPException(status_code=400, detail=f"You already have a study with ID '{code}'")
    s = StudyDB(id=store.new_id(), study_code=code[:100], title=req.title.strip(), sponsor=(req.sponsor or "").strip() or None,
                therapeutic_area=(req.therapeutic_area or "").strip() or None, owner_id=user.id, created_at=store.now_iso())
    db.add(s)
    db.add(StudyMemberDB(study_id=s.id, user_id=user.id, role="owner", added_at=store.now_iso()))
    db.commit()
    store.audit(db, user.id, "study_created", s.id, entity="study", detail={"study_code": s.study_code})
    return study_dict(db, s, "owner")


@router.get("/studies/{study_id}")
async def get_study(study_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    s, role = store.require_study(db, study_id, user)
    out = study_dict(db, s, role)
    members = db.query(StudyMemberDB).filter(StudyMemberDB.study_id == s.id).all()
    users = {u.id: u for u in db.query(UserDB).filter(UserDB.id.in_([m.user_id for m in members])).all()}
    out["members"] = [{"user_id": m.user_id, "role": m.role, "email": users[m.user_id].email if m.user_id in users else None,
                       "name": users[m.user_id].fullname if m.user_id in users else None} for m in members]
    return out


@router.patch("/studies/{study_id}")
async def update_study(study_id: str, req: StudyUpdate, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    s, role = store.require_study(db, study_id, user, "editor")
    changes = {k: v for k, v in req.model_dump().items() if v is not None}
    for k, v in changes.items():
        setattr(s, k, v.strip() if k == "title" else (v.strip() or None))
    db.commit()
    store.audit(db, user.id, "study_updated", s.id, entity="study", detail={"fields": list(changes)})
    return study_dict(db, s, role)


@router.post("/studies/{study_id}/members")
async def add_member(study_id: str, req: MemberAdd, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    store.require_study(db, study_id, user, "owner")
    if req.role not in ("viewer", "editor", "reviewer"):
        raise HTTPException(status_code=400, detail="Role must be viewer, editor or reviewer")
    target = db.query(UserDB).filter(UserDB.email == req.email.lower().strip()).first()
    if not target:
        raise HTTPException(status_code=404, detail="No user with that email")
    m = db.query(StudyMemberDB).filter(StudyMemberDB.study_id == study_id, StudyMemberDB.user_id == target.id).first()
    if m and m.role == "owner":
        raise HTTPException(status_code=400, detail="The study owner's role cannot be changed")
    if m:
        m.role = req.role
    else:
        db.add(StudyMemberDB(study_id=study_id, user_id=target.id, role=req.role, added_at=store.now_iso()))
    db.commit()
    store.audit(db, user.id, "member_set", study_id, entity="member", detail={"user_id": target.id, "role": req.role})
    return {"user_id": target.id, "role": req.role}


@router.delete("/studies/{study_id}/members/{member_id}")
async def remove_member(study_id: str, member_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    store.require_study(db, study_id, user, "owner")
    m = db.query(StudyMemberDB).filter(StudyMemberDB.study_id == study_id, StudyMemberDB.user_id == member_id).first()
    if not m or m.role == "owner":
        raise HTTPException(status_code=400, detail="Member not found or is the owner")
    db.delete(m)
    db.commit()
    store.audit(db, user.id, "member_removed", study_id, entity="member", detail={"user_id": member_id})
    return {"removed": member_id}


@router.get("/studies/{study_id}/audit")
async def study_audit(study_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    store.require_study(db, study_id, user)
    return {"entries": store.list_audit(db, study_id)}


# ─── Protocol versions ───────────────────────────────────────────────

def _save_original(content: bytes, filename: str, user_id: str | None, status: str = "processing") -> DocumentDB:
    doc_id = str(uuid.uuid4())[:8]
    safe = f"{doc_id}_{Path(filename).name}"
    path = UPLOAD_DIR / safe
    with open(path, "xb") as f:  # never overwrite an existing file
        f.write(content)
    doc = DocumentDB(id=doc_id, filename=Path(filename).name, safe_filename=safe, file_path=str(path),
                     file_type=Path(filename).suffix.lower(), file_size=len(content), upload_time=datetime.now().isoformat(),
                     extracted_text="", word_count=0, status=status, stats_json="{}", analysis_results_json="{}", user_id=user_id)
    return doc


def _next_sequence(db: Session, study_id: str) -> int:
    last = db.query(ProtocolVersionDB).filter(ProtocolVersionDB.study_id == study_id).order_by(ProtocolVersionDB.sequence.desc()).first()
    return (last.sequence + 1) if last else 1


def _check_version_label(db: Session, study_id: str, label: str | None):
    if label and db.query(ProtocolVersionDB).filter(ProtocolVersionDB.study_id == study_id,
                                                    ProtocolVersionDB.version_label == label).first():
        raise HTTPException(status_code=400, detail=f"Version '{label}' is already registered for this study. Versions are never overwritten; use a new version number.")


def _prefs(raw: str | None) -> dict:
    try:
        p = json.loads(raw) if raw else {}
        return p if isinstance(p, dict) else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Extraction preferences must be valid JSON")


@router.post("/studies/{study_id}/versions")
async def register_version(
    study_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    version_label: str | None = Form(None),
    amendment_number: str | None = Form(None),
    effective_date: str | None = Form(None),
    amendment_reason: str | None = Form(None),
    language: str = Form("en"),
    preferences: str | None = Form(None),
    supporting_files: list[UploadFile] | None = File(None),
    supporting_kinds: str | None = Form(None),
    db: Session = Depends(get_db),
    user: UserDB = Depends(get_current_user),
):
    """Register a new protocol version (never replaces an earlier one) and start processing."""
    store.require_study(db, study_id, user, "editor")
    label = (version_label or "").strip() or None
    _check_version_label(db, study_id, label)
    content = await file.read()
    try:
        validate_protocol_file(file.filename, content, MAX_FILE_SIZE_MB)
    except ProtocolValidationError as e:
        store.audit(db, user.id, "protocol_upload_rejected", study_id, entity="protocol_version", detail={"reason": str(e)})
        raise HTTPException(status_code=400, detail=str(e))

    kinds = [k.strip() for k in (supporting_kinds or "").split(",")] if supporting_kinds else []
    pending = []
    for i, sf in enumerate(supporting_files or []):
        if not sf.filename:
            continue
        sc = await sf.read()
        try:
            validate_protocol_file(sf.filename, sc, MAX_FILE_SIZE_MB)
        except ProtocolValidationError as e:
            raise HTTPException(status_code=400, detail=f"Supporting document '{sf.filename}': {e}")
        pending.append((sf.filename, sc, kinds[i] if i < len(kinds) and kinds[i] in SUPPORTING_KINDS else "other"))

    # Everything is validated; only now are originals written to disk
    supporting, support_docs = [], []
    for fname, sc, kind in pending:
        sdoc = _save_original(sc, fname, None)  # owner-less: reachable only through the study, not the document list
        support_docs.append(sdoc)
        supporting.append({"document_id": sdoc.id, "kind": kind, "filename": sdoc.filename, "sha256": sha256_bytes(sc), "status": "queued"})

    doc = _save_original(content, file.filename, user.id)
    db.add(doc)
    for sdoc in support_docs:
        db.add(sdoc)
    v = ProtocolVersionDB(
        id=store.new_id(), study_id=study_id, document_id=doc.id, sequence=_next_sequence(db, study_id),
        version_label=label, amendment_number=(amendment_number or "").strip() or None,
        effective_date=(effective_date or "").strip() or None, amendment_reason=(amendment_reason or "").strip() or None,
        language=(language or "en")[:20], preferences_json=json.dumps(_prefs(preferences)), supporting_json=json.dumps(supporting),
        file_sha256=sha256_bytes(content), processing_status="queued", processing_progress=5,
        processing_message="Upload validated; queued for processing", review_status="unverified",
        created_by=user.id, created_at=store.now_iso(),
    )
    db.add(v)
    db.commit()
    store.audit(db, user.id, "protocol_version_registered", study_id, v.id, "protocol_version",
                {"sequence": v.sequence, "label": version_name(v), "sha256": v.file_sha256, "supporting": len(supporting)})
    background.add_task(process_version, v.id, user.id)
    return version_dict(db, v)


class RegisterExisting(BaseModel):
    document_id: str
    version_label: str | None = None
    amendment_number: str | None = None
    effective_date: str | None = None
    amendment_reason: str | None = None
    language: str = "en"
    preferences: dict = {}


@router.post("/studies/{study_id}/versions/from-document")
async def register_existing_document(study_id: str, req: RegisterExisting, background: BackgroundTasks,
                                     db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Register a protocol that was already uploaded to the DESIGN module, keeping its existing analyses."""
    store.require_study(db, study_id, user, "editor")
    _check_version_label(db, study_id, (req.version_label or "").strip() or None)
    doc = db.query(DocumentDB).filter(DocumentDB.id == req.document_id, DocumentDB.user_id == user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if db.query(ProtocolVersionDB).filter(ProtocolVersionDB.document_id == doc.id).first():
        raise HTTPException(status_code=400, detail="This document is already registered as a protocol version")
    content = Path(doc.file_path).read_bytes() if os.path.exists(doc.file_path) else b""
    try:
        validate_protocol_file(doc.filename, content, MAX_FILE_SIZE_MB)
    except ProtocolValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    v = ProtocolVersionDB(
        id=store.new_id(), study_id=study_id, document_id=doc.id, sequence=_next_sequence(db, study_id),
        version_label=(req.version_label or "").strip() or None, amendment_number=req.amendment_number,
        effective_date=req.effective_date, amendment_reason=req.amendment_reason, language=req.language[:20],
        preferences_json=json.dumps(req.preferences or {}), supporting_json="[]", file_sha256=sha256_bytes(content),
        processing_status="queued", processing_progress=5, processing_message="Queued for processing",
        review_status="unverified", created_by=user.id, created_at=store.now_iso(),
    )
    db.add(v)
    db.commit()
    store.audit(db, user.id, "protocol_version_registered", study_id, v.id, "protocol_version",
                {"sequence": v.sequence, "from_document": doc.id, "sha256": v.file_sha256})
    background.add_task(process_version, v.id, user.id)
    return version_dict(db, v)


@router.get("/versions/{version_id}")
async def get_version(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, role = store.require_version(db, version_id, user)
    return {**version_dict(db, v), "role": role, "study": study_dict(db, s, role, with_versions=False)}


@router.post("/versions/{version_id}/reprocess")
async def reprocess_version(version_id: str, background: BackgroundTasks, use_ai: bool | None = None,
                            db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Re-run extraction. Produces a new Protocol Intelligence revision; earlier revisions and the original file are kept."""
    v, _, _ = store.require_version(db, version_id, user, "editor")
    if v.processing_status in ("queued", "extracting", "structuring", "saving"):
        raise HTTPException(status_code=409, detail="This version is already being processed")
    if use_ai is not None:
        prefs = json.loads(v.preferences_json or "{}")
        prefs["use_ai"] = use_ai
        v.preferences_json = json.dumps(prefs)
    _set_status(db, v, "queued", 5, "Queued for re-processing")
    store.audit(db, user.id, "protocol_reprocess_requested", v.study_id, v.id, "protocol_version")
    background.add_task(process_version, v.id, user.id)
    return version_dict(db, v)


@router.get("/versions/{version_id}/original")
async def download_original(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, _ = store.require_version(db, version_id, user)
    doc = _doc_row(db, v.document_id)
    content = Path(doc.file_path).read_bytes()
    if sha256_bytes(content) != v.file_sha256:
        raise HTTPException(status_code=409, detail="Integrity check failed: the stored original does not match its registered checksum")
    media = "application/pdf" if doc.file_type == ".pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return StreamingResponse(io.BytesIO(content), media_type=media,
                             headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'})


@router.get("/versions/{version_id}/blocks/{block_id}")
async def get_block(version_id: str, block_id: str, context: int = 2,
                    db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """A source block with its neighbours, for the evidence viewer."""
    v, _, _ = store.require_version(db, version_id, user)
    blocks = load_blocks(db, v, include_supporting=True)
    idx = next((i for i, b in enumerate(blocks) if b["id"] == block_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Source block not found")
    context = max(0, min(context, 6))
    return {"block": blocks[idx], "before": blocks[max(0, idx - context):idx], "after": blocks[idx + 1:idx + 1 + context]}


# ─── Feature 01: Protocol Intelligence ───────────────────────────────

def _pi_latest(db: Session, v: ProtocolVersionDB):
    a = store.latest_artifact(db, v.id, "protocol_intelligence")
    if not a:
        raise HTTPException(status_code=404, detail="No Protocol Intelligence extraction exists for this version yet")
    return a


@router.get("/versions/{version_id}/intelligence")
async def get_intelligence(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, role = store.require_version(db, version_id, user)
    a = _pi_latest(db, v)
    history = [store.artifact_dict(h, include_data=False) for h in store.lineage_history(db, a.lineage_id)]
    return {**store.artifact_dict(a), "history": history, "role": role}


class FieldUpdate(BaseModel):
    key: str
    value: str | list[str] | None = None
    verify: bool = False
    note: str | None = None


class FieldUpdates(BaseModel):
    updates: list[FieldUpdate]
    base_revision: int | None = None


def _refresh_review_status(db: Session, v: ProtocolVersionDB, data: dict):
    # Fields excluded by the extraction preferences are not part of the review
    fields = [f for f in data["fields"] if f["status"] != "not_requested" or f.get("source") == "user"]
    verified = sum(1 for f in fields if f["verification"]["status"] == "verified")
    v.review_status = "verified" if verified == len(fields) else "in_review" if verified or any(
        f["verification"]["status"] == "corrected" for f in fields) else "unverified"
    db.commit()


@router.post("/versions/{version_id}/intelligence/fields")
async def update_fields(version_id: str, req: FieldUpdates, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Edit and/or verify extracted fields. Saves a new revision; previous revisions are kept."""
    v, s, role = store.require_version(db, version_id, user, "editor")
    a = _pi_latest(db, v)
    if req.base_revision is not None and req.base_revision != a.revision:
        raise HTTPException(status_code=409, detail=f"The extraction changed (now revision {a.revision}). Reload before saving.")
    data = json.loads(a.data_json)
    fmap = pi_engine.field_map(data)
    now = store.now_iso()
    changed = []
    for u in req.updates:
        f = fmap.get(u.key)
        if not f:
            raise HTTPException(status_code=400, detail=f"Unknown field '{u.key}'")
        if u.verify and store.ROLE_RANK[role] < store.ROLE_RANK["reviewer"]:
            raise HTTPException(status_code=403, detail="Verifying fields requires the 'reviewer' role")
        if u.value is not None:
            new_value = [x.strip() for x in (u.value if isinstance(u.value, list) else [u.value]) if x and x.strip()] if f["multi"] \
                else (u.value if isinstance(u.value, str) else "; ".join(u.value)).strip()
            if new_value != f["value"]:
                f["history"].append({"value": f["value"], "status": f["status"], "source": f["source"], "replaced_by": user.id, "at": now, "note": u.note})
                f["value"] = new_value if new_value else ([] if f["multi"] else pi_engine.NOT_SPECIFIED)
                f["status"] = "extracted" if new_value else "missing"
                f["source"] = "user"
                f["flags"] = ["Entered or corrected by a user; confirm against the source document"] if new_value else ["Not found in the protocol"]
                f["alternatives"] = []
                f["verification"] = {"status": "corrected", "by": user.id, "at": now, "note": u.note}
                changed.append({"key": u.key, "action": "edited"})
        if u.verify:
            f["verification"] = {"status": "verified", "by": user.id, "at": now, "note": u.note}
            changed.append({"key": u.key, "action": "verified"})
    if not changed:
        return {**store.artifact_dict(a), "unchanged": True}
    data["summary"] = pi_engine.summarize_fields(data["fields"])
    data["characteristics"] = pi_engine.characteristics(data["fields"])
    new = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="protocol_intelligence", data=data,
                              user_id=user.id, lineage_id=a.lineage_id, method_version=a.method_version,
                              note="; ".join(f"{c['action']} {c['key']}" for c in changed)[:500])
    _refresh_review_status(db, v, data)
    store.audit(db, user.id, "pi_fields_updated", v.study_id, v.id, "protocol_intelligence",
                {"artifact_id": new.id, "revision": new.revision, "changes": changed})
    history = [store.artifact_dict(h, include_data=False) for h in store.lineage_history(db, new.lineage_id)]
    return {**store.artifact_dict(new), "history": history, "role": role}


@router.get("/versions/{version_id}/intelligence/export")
async def export_intelligence(version_id: str, format: str = "json", revision: int | None = None,
                              db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, _ = store.require_version(db, version_id, user)
    a = _pi_latest(db, v)
    if revision is not None:
        a = next((h for h in store.lineage_history(db, a.lineage_id) if h.revision == revision), None)
        if not a:
            raise HTTPException(status_code=404, detail="Revision not found")
    data = json.loads(a.data_json)
    meta = [("Study ID", s.study_code), ("Study title", s.title or ""), ("Protocol version", version_name(v)),
            ("Document", data.get("document", {}).get("filename", "")), ("Document SHA-256", v.file_sha256),
            ("Extraction revision", str(a.revision)), ("Method", a.method_version or ""), ("Exported", store.now_iso()),
            ("Review status", v.review_status)]
    name = f"{s.study_code}_{version_name(v)}_protocol_intelligence_r{a.revision}".replace(" ", "_")
    store.audit(db, user.id, "pi_exported", v.study_id, v.id, "protocol_intelligence", {"format": format, "revision": a.revision})
    if format == "json":
        body = json.dumps({"metadata": dict(meta), **data}, indent=2).encode("utf-8")
        return StreamingResponse(io.BytesIO(body), media_type="application/json",
                                 headers={"Content-Disposition": f'attachment; filename="{name}.json"'})
    if format == "xlsx":
        return StreamingResponse(io.BytesIO(pi_to_xlsx(meta, data)), media_type=XLSX_MIME,
                                 headers={"Content-Disposition": f'attachment; filename="{name}.xlsx"'})
    raise HTTPException(status_code=400, detail="Format must be json or xlsx")


# ─── Generic artifact access ─────────────────────────────────────────

@router.get("/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str, study_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    store.require_study(db, study_id, user)
    a = store.get_artifact(db, artifact_id, study_id)
    history = [store.artifact_dict(h, include_data=False) for h in store.lineage_history(db, a.lineage_id)]
    return {**store.artifact_dict(a), "history": history}
