"""
DESIGN Analysis Routes
Endpoint Intelligence (06), Schedule of Assessments (07), Sample Size & Power (10),
Protocol Version Control (11) and Design Reports & AI Assistant (12).
"""

import io
import json

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import ProtocolVersionDB, UserDB, get_db
from routes.auth import get_current_user
import routes.design as design_routes
from config import MAX_FILE_SIZE_MB
from routes.design import doc_analyses, load_blocks, version_name
from services import design_store as store
from services import endpoint_intelligence as ep_engine
from services import protocol_review as review_engine
from services import sample_size as ss_engine
from services import soa_engine
from services import version_compare
from services import design_reports as reports
from services.design_exports import (DOCX_MIME, XLSX_MIME, render, review_model, review_to_xlsx, sample_size_model, soa_fill_docx_template,
                                     soa_fill_xlsx_template, soa_model, soa_to_xlsx, template_placeholders, timeline)

router = APIRouter(prefix="/api/design", tags=["DESIGN Analysis"])


def _latest_data(db: Session, v: ProtocolVersionDB, kind: str) -> dict | None:
    a = store.latest_artifact(db, v.id, kind)
    return json.loads(a.data_json) if a else None


def _require_pi(db: Session, v: ProtocolVersionDB) -> dict:
    data = _latest_data(db, v, "protocol_intelligence")
    if not data:
        raise HTTPException(status_code=409, detail="Run Protocol Intelligence for this version first")
    return data


def _with_history(db: Session, a) -> dict:
    return {**store.artifact_dict(a), "history": [store.artifact_dict(h, include_data=False) for h in store.lineage_history(db, a.lineage_id)]}


def _file(content: bytes, mime: str, name: str) -> StreamingResponse:
    return StreamingResponse(io.BytesIO(content), media_type=mime, headers={"Content-Disposition": f'attachment; filename="{name}"'})


def _meta(s, v, a, title: str) -> list[tuple[str, str]]:
    return [("Study ID", s.study_code), ("Study title", s.title or ""), ("Protocol version", version_name(v)),
            ("Output", title), ("Revision", f"{a.revision} ({a.status})"), ("Method", a.method_version or ""),
            ("Generated", a.created_at), ("Exported", store.now_iso())]


def _carry_reviews(old: list[dict], new: list[dict], key) -> None:
    prev = {key(x): x for x in old}
    for x in new:
        p = prev.get(key(x))
        if p:
            for f in ("status", "resolution", "comments", "decision"):
                if f in p:
                    x[f] = p[f]


# ─── Generic status change (draft / reviewed / approved) ─────────────

class StatusChange(BaseModel):
    status: str
    note: str | None = None


@router.post("/artifacts/{artifact_id}/status")
async def change_status(artifact_id: str, req: StatusChange, study_id: str,
                        db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    _, role = store.require_study(db, study_id, user, "editor")
    a = store.get_artifact(db, artifact_id, study_id)
    latest = store.latest_in_lineage(db, a.lineage_id)
    if latest.id != a.id:
        raise HTTPException(status_code=409, detail="Only the latest revision can change status")
    store.check_status_change(role, req.status)
    data = json.loads(a.data_json)
    if a.kind == "soa" and req.status == "approved":
        open_conflicts = [i for i in data.get("issues", []) if i["severity"] == "conflict" and i["status"] != "resolved"]
        if open_conflicts:
            raise HTTPException(status_code=409, detail=f"{len(open_conflicts)} unresolved scheduling conflict(s) must be reviewed before approval")
    if a.kind == "protocol_review" and req.status == "approved":
        critical = [f for f in data.get("findings", []) if f["severity"] == "critical" and f["status"] == "open"]
        if critical:
            raise HTTPException(status_code=409, detail=f"{len(critical)} critical finding(s) must be resolved or documented before approval")
    if a.kind == "endpoint_intelligence" and req.status == "approved":
        pending = [s for s in data.get("suggestions", []) if s["status"] == "pending_review" and s["requires_scientific_review"]]
        if pending:
            raise HTTPException(status_code=409, detail=f"{len(pending)} suggestion(s) still need scientific review")
    data.setdefault("status_log", []).append({"from": a.status, "to": req.status, "by": user.id, "at": store.now_iso(), "note": req.note})
    new = store.save_artifact(db, study_id=study_id, version_id=a.protocol_version_id, kind=a.kind, data=data, user_id=user.id,
                              lineage_id=a.lineage_id, status=req.status, method_version=a.method_version,
                              note=f"Status {a.status} → {req.status}")
    store.audit(db, user.id, "status_changed", study_id, a.protocol_version_id, a.kind,
                {"artifact_id": new.id, "from": a.status, "to": req.status})
    return _with_history(db, new)


# ─── Feature 02: Protocol Review ─────────────────────────────────────

class AnalyzeRequest(BaseModel):
    use_ai: bool = True


def _review_response(db: Session, a, role: str) -> dict:
    return {**_with_history(db, a), "role": role}


@router.post("/versions/{version_id}/review/run")
async def run_protocol_review(version_id: str, req: AnalyzeRequest, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Check the protocol for completeness, consistency, clarity and unresolved issues. Re-runs keep review decisions."""
    v, _, role = store.require_version(db, version_id, user, "editor")
    pi = _require_pi(db, v)
    result = await review_engine.review(pi, load_blocks(db, v), use_ai=req.use_ai)
    prev = store.latest_artifact(db, v.id, "protocol_review")
    if prev:
        review_engine.carry_over(json.loads(prev.data_json).get("findings", []), result["findings"])
        result["summary"] = review_engine.summarize(result["findings"], result["checklist"])
    a = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="protocol_review", data=result, user_id=user.id,
                            lineage_id=prev.lineage_id if prev else None, method_version=review_engine.METHOD_VERSION,
                            note="Review run")
    store.audit(db, user.id, "protocol_reviewed", v.study_id, v.id, "protocol_review",
                {"artifact_id": a.id, "summary": result["summary"]["by_severity"], "ai_used": result["basis"]["ai_used"]})
    return _review_response(db, a, role)


@router.get("/versions/{version_id}/review")
async def get_protocol_review(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user)
    a = store.latest_artifact(db, v.id, "protocol_review")
    if not a:
        raise HTTPException(status_code=404, detail="Protocol Review has not been run for this version")
    return _review_response(db, a, role)


class FindingAction(BaseModel):
    action: str  # resolve | document | reopen | comment
    note: str | None = None


@router.post("/versions/{version_id}/review/findings/{finding_id}")
async def act_on_finding(version_id: str, finding_id: str, req: FindingAction,
                         db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Resolve a finding, document it (accepted with a rationale), reopen it, or comment on it."""
    v, _, role = store.require_version(db, version_id, user, "editor")
    a = store.latest_artifact(db, v.id, "protocol_review")
    if not a:
        raise HTTPException(status_code=404, detail="Protocol Review has not been run for this version")
    data = json.loads(a.data_json)
    f = next((x for x in data["findings"] if x["id"] == finding_id), None)
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")
    note = (req.note or "").strip()[:2000]
    now = store.now_iso()
    if req.action == "comment":
        if not note:
            raise HTTPException(status_code=400, detail="Comment text is required")
        f["comments"].append({"by": user.id, "at": now, "text": note})
    elif req.action in ("resolve", "document"):
        if store.ROLE_RANK[role] < store.ROLE_RANK["reviewer"]:
            raise HTTPException(status_code=403, detail="Resolving or documenting findings requires the 'reviewer' role")
        if not note:
            raise HTTPException(status_code=400, detail="Explain how the finding was resolved, or why it is accepted")
        f["status"] = "resolved" if req.action == "resolve" else "documented"
        f["resolution"] = {"action": req.action, "by": user.id, "at": now, "note": note}
    elif req.action == "reopen":
        if store.ROLE_RANK[role] < store.ROLE_RANK["reviewer"]:
            raise HTTPException(status_code=403, detail="Reopening findings requires the 'reviewer' role")
        f["status"], f["resolution"] = "open", None
    else:
        raise HTTPException(status_code=400, detail="Action must be resolve, document, reopen or comment")
    data["summary"] = review_engine.summarize(data["findings"], data["checklist"])
    new = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="protocol_review", data=data, user_id=user.id,
                              lineage_id=a.lineage_id, status="draft" if a.status == "approved" else a.status,
                              method_version=a.method_version, note=f"{req.action} {finding_id}")
    store.audit(db, user.id, "review_finding_updated", v.study_id, v.id, "protocol_review",
                {"artifact_id": new.id, "finding": finding_id, "action": req.action})
    return _review_response(db, new, role)


@router.get("/versions/{version_id}/review/export")
async def export_protocol_review(version_id: str, format: str = "docx", db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, _ = store.require_version(db, version_id, user)
    a = store.latest_artifact(db, v.id, "protocol_review")
    if not a:
        raise HTTPException(status_code=404, detail="Protocol Review has not been run for this version")
    data = json.loads(a.data_json)
    meta = _meta(s, v, a, "Protocol Review")
    name = f"{s.study_code}_{version_name(v)}_protocol_review_r{a.revision}".replace(" ", "_")
    store.audit(db, user.id, "review_exported", v.study_id, v.id, "protocol_review", {"format": format, "artifact_id": a.id})
    if format == "xlsx":
        return _file(review_to_xlsx(meta, data), XLSX_MIME, name + ".xlsx")
    if format in ("docx", "pdf"):
        content, mime, ext = render(review_model(meta, data), f"Protocol Review — {s.study_code} {version_name(v)}", format)
        return _file(content, mime, f"{name}.{ext}")
    raise HTTPException(status_code=400, detail="Format must be docx, pdf or xlsx")


# ─── Feature 06: Endpoint Intelligence ───────────────────────────────

@router.post("/versions/{version_id}/endpoints/analyze")
async def analyze_endpoints(version_id: str, req: AnalyzeRequest, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, _ = store.require_version(db, version_id, user, "editor")
    pi = _require_pi(db, v)
    all_blocks = load_blocks(db, v, include_supporting=True, kinds={"statistical_analysis_plan", "synopsis", "amendment"})
    sap_blocks = [b for b in all_blocks if (b.get("section") or "").startswith("[statistical_analysis_plan")]
    blocks = [b for b in all_blocks if b not in sap_blocks]
    result = ep_engine.analyze(pi, blocks, _latest_data(db, v, "soa"), sap_blocks)
    ai_note = None
    if req.use_ai:
        try:
            result["suggestions"] += await ep_engine.ai_suggestions(result, blocks)
        except Exception as e:
            ai_note = f"AI suggestions unavailable: {str(e)[:200]}"
    result["ai_note"] = ai_note
    prev = store.latest_artifact(db, v.id, "endpoint_intelligence")
    if prev:
        old = json.loads(prev.data_json)
        _carry_reviews(old.get("issues", []), result["issues"], lambda i: (i["type"], i.get("endpoint_id"), i.get("objective_id"), i["description"]))
        _carry_reviews(old.get("suggestions", []), result["suggestions"], lambda x: (x["origin"], x["target"], x["text"]))
    a = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="endpoint_intelligence", data=result, user_id=user.id,
                            lineage_id=prev.lineage_id if prev else None, method_version=ep_engine.METHOD_VERSION,
                            note="Analysis run")
    store.audit(db, user.id, "endpoints_analyzed", v.study_id, v.id, "endpoint_intelligence",
                {"artifact_id": a.id, "endpoints": len(result["register"]), "issues": len(result["issues"])})
    return _with_history(db, a)


@router.get("/versions/{version_id}/endpoints")
async def get_endpoints(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user)
    a = store.latest_artifact(db, v.id, "endpoint_intelligence")
    if not a:
        raise HTTPException(status_code=404, detail="Endpoint Intelligence has not been run for this version")
    return {**_with_history(db, a), "role": role}


class SuggestionReview(BaseModel):
    action: str  # comment | approve | reject
    comment: str | None = None


@router.post("/versions/{version_id}/endpoints/suggestions/{suggestion_id}/review")
async def review_suggestion(version_id: str, suggestion_id: str, req: SuggestionReview,
                            db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user, "editor")
    a = store.latest_artifact(db, v.id, "endpoint_intelligence")
    if not a:
        raise HTTPException(status_code=404, detail="Endpoint Intelligence has not been run for this version")
    data = json.loads(a.data_json)
    sug = next((x for x in data["suggestions"] if x["id"] == suggestion_id), None)
    if not sug:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    now = store.now_iso()
    if req.action == "comment":
        if not (req.comment or "").strip():
            raise HTTPException(status_code=400, detail="Comment text is required")
        sug["comments"].append({"by": user.id, "at": now, "text": req.comment.strip()[:2000]})
    elif req.action in ("approve", "reject"):
        needed = "reviewer" if sug["requires_scientific_review"] else "editor"
        if store.ROLE_RANK[role] < store.ROLE_RANK[needed]:
            raise HTTPException(status_code=403, detail=f"This suggestion affects {sug['impact']} decisions and requires the '{needed}' role")
        sug["status"] = "approved" if req.action == "approve" else "rejected"
        sug["decision"] = {"by": user.id, "at": now, "comment": req.comment}
    else:
        raise HTTPException(status_code=400, detail="Action must be comment, approve or reject")
    # The endpoint register/hierarchy is never altered by a suggestion decision
    new = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="endpoint_intelligence", data=data, user_id=user.id,
                              lineage_id=a.lineage_id, status="draft" if a.status == "approved" else a.status,
                              method_version=a.method_version, note=f"{req.action} {suggestion_id}")
    store.audit(db, user.id, "suggestion_reviewed", v.study_id, v.id, "endpoint_intelligence",
                {"artifact_id": new.id, "suggestion": suggestion_id, "action": req.action})
    return {**_with_history(db, new), "role": role}


class IssueResolve(BaseModel):
    note: str
    reopen: bool = False


def _resolve_issue(issues: list[dict], issue_id: str, req: IssueResolve, user_id: str):
    iss = next((i for i in issues if i["id"] == issue_id), None)
    if not iss:
        raise HTTPException(status_code=404, detail="Issue not found")
    if not req.note.strip():
        raise HTTPException(status_code=400, detail="A review note is required")
    iss["status"] = "open" if req.reopen else "resolved"
    iss["resolution"] = {"by": user_id, "at": store.now_iso(), "note": req.note.strip()[:2000]}


@router.post("/versions/{version_id}/endpoints/issues/{issue_id}/resolve")
async def resolve_endpoint_issue(version_id: str, issue_id: str, req: IssueResolve,
                                 db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user, "reviewer")
    a = store.latest_artifact(db, v.id, "endpoint_intelligence")
    if not a:
        raise HTTPException(status_code=404, detail="Endpoint Intelligence has not been run for this version")
    data = json.loads(a.data_json)
    _resolve_issue(data["issues"], issue_id, req, user.id)
    new = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="endpoint_intelligence", data=data, user_id=user.id,
                              lineage_id=a.lineage_id, status=a.status, method_version=a.method_version, note=f"Reviewed {issue_id}")
    store.audit(db, user.id, "endpoint_issue_reviewed", v.study_id, v.id, "endpoint_intelligence", {"issue": issue_id, "reopen": req.reopen})
    return {**_with_history(db, new), "role": role}


# ─── Feature 07: Schedule of Assessments ─────────────────────────────

def _soa_response(db: Session, a, role: str) -> dict:
    out = _with_history(db, a)
    first = store.lineage_history(db, a.lineage_id)[0]
    out["source_diff"] = soa_engine.diff_matrices(json.loads(first.data_json), out["data"])
    out["timeline"] = timeline(out["data"])
    out["role"] = role
    return out


@router.post("/versions/{version_id}/soa/generate")
async def generate_soa(version_id: str, req: AnalyzeRequest, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Generate the matrix from the protocol. Starts a new lineage whose first revision is the source baseline."""
    v, _, role = store.require_version(db, version_id, user, "editor")
    blocks = load_blocks(db, v, include_supporting=True, kinds={"schedule_of_assessments", "synopsis"})
    matrix = await soa_engine.generate(blocks, _latest_data(db, v, "endpoint_intelligence"), use_ai=req.use_ai)
    a = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="soa", data=matrix, user_id=user.id,
                            method_version=soa_engine.METHOD_VERSION, note=f"Generated from protocol ({matrix['generated_by']})")
    store.audit(db, user.id, "soa_generated", v.study_id, v.id, "soa",
                {"artifact_id": a.id, "visits": len(matrix["visits"]), "assessments": len(matrix["assessments"]), "by": matrix["generated_by"]})
    return _soa_response(db, a, role)


@router.get("/versions/{version_id}/soa")
async def get_soa(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user)
    a = store.latest_artifact(db, v.id, "soa")
    if not a:
        raise HTTPException(status_code=404, detail="No Schedule of Assessments has been generated for this version")
    return _soa_response(db, a, role)


class SoaUpdate(BaseModel):
    matrix: dict
    note: str | None = None
    base_revision: int | None = None


@router.put("/versions/{version_id}/soa")
async def update_soa(version_id: str, req: SoaUpdate, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user, "editor")
    a = store.latest_artifact(db, v.id, "soa")
    if not a:
        raise HTTPException(status_code=404, detail="Generate the Schedule of Assessments first")
    if req.base_revision is not None and req.base_revision != a.revision:
        raise HTTPException(status_code=409, detail=f"The matrix changed (now revision {a.revision}). Reload before saving.")
    old = json.loads(a.data_json)
    m = {k: req.matrix.get(k, old.get(k)) for k in ("visits", "assessments", "cells", "footnotes", "conventions")}
    m["cells"] = m["cells"] or {}
    try:
        soa_engine.validate_matrix(m)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    for vis in m["visits"]:
        # Timing edits are re-parsed from the user's text so representation stays consistent
        if isinstance(vis.get("timing_text"), str):
            vis["timing"] = soa_engine.parse_timing(vis.pop("timing_text")) or None
        if isinstance(vis.get("window_text"), str):
            vis["window"] = soa_engine.parse_window(vis.pop("window_text")) or None
        vis["phase"] = soa_engine.visit_phase(vis["label"])
    m.update({k: old.get(k) for k in ("source_tables", "generated_by", "note")})
    m["issues"] = soa_engine.check_matrix(dict(m), _latest_data(db, v, "endpoint_intelligence"), old.get("issues"))
    new = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="soa", data=m, user_id=user.id, lineage_id=a.lineage_id,
                              status="draft", method_version=a.method_version, note=(req.note or "Matrix edited")[:500])
    store.audit(db, user.id, "soa_edited", v.study_id, v.id, "soa", {"artifact_id": new.id, "revision": new.revision})
    return _soa_response(db, new, role)


@router.post("/versions/{version_id}/soa/issues/{issue_id}/resolve")
async def resolve_soa_issue(version_id: str, issue_id: str, req: IssueResolve,
                            db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user, "reviewer")
    a = store.latest_artifact(db, v.id, "soa")
    if not a:
        raise HTTPException(status_code=404, detail="No Schedule of Assessments for this version")
    data = json.loads(a.data_json)
    _resolve_issue(data["issues"], issue_id, req, user.id)
    new = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="soa", data=data, user_id=user.id, lineage_id=a.lineage_id,
                              status=a.status, method_version=a.method_version, note=f"Reviewed {issue_id}")
    store.audit(db, user.id, "soa_issue_reviewed", v.study_id, v.id, "soa", {"issue": issue_id, "reopen": req.reopen})
    return _soa_response(db, new, role)


@router.get("/versions/{version_id}/soa/export")
async def export_soa(version_id: str, format: str = "xlsx", template_id: str | None = None,
                     db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, _ = store.require_version(db, version_id, user)
    a = store.latest_artifact(db, v.id, "soa")
    if not a:
        raise HTTPException(status_code=404, detail="No Schedule of Assessments for this version")
    m = json.loads(a.data_json)
    meta = _meta(s, v, a, "Schedule of Assessments")
    name = f"{s.study_code}_{version_name(v)}_SoA_r{a.revision}".replace(" ", "_")
    store.audit(db, user.id, "soa_exported", v.study_id, v.id, "soa", {"format": format, "artifact_id": a.id, "template_id": template_id})
    if template_id:
        t = store.get_artifact(db, template_id, v.study_id)
        if t.kind != "soa_template":
            raise HTTPException(status_code=404, detail="Template not found")
        tdata = json.loads(t.data_json)
        if format != tdata["format"]:
            raise HTTPException(status_code=400, detail=f"This template is a {tdata['format'].upper()} file; export as {tdata['format']}")
        content = Path(tdata["path"]).read_bytes()
        values = {"{{STUDY_ID}}": s.study_code, "{{STUDY_TITLE}}": s.title or "", "{{PROTOCOL_VERSION}}": version_name(v),
                  "{{STATUS}}": a.status.upper(), "{{REVISION}}": str(a.revision), "{{EXPORTED}}": store.now_iso()}
        if format == "xlsx":
            return _file(soa_fill_xlsx_template(content, values, m), XLSX_MIME, name + ".xlsx")
        return _file(soa_fill_docx_template(content, values, m), DOCX_MIME, name + ".docx")
    if format == "xlsx":
        return _file(soa_to_xlsx(meta, m), XLSX_MIME, name + ".xlsx")
    if format in ("docx", "pdf"):
        content, mime, ext = render(soa_model(meta, m), f"Schedule of Assessments — {s.study_code} {version_name(v)}", format, wide=True)
        return _file(content, mime, f"{name}.{ext}")
    raise HTTPException(status_code=400, detail="Format must be xlsx, docx or pdf")


@router.post("/studies/{study_id}/soa-templates")
async def upload_soa_template(study_id: str, file: UploadFile = File(...), name: str = Form(""),
                              db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Store a protocol-specific SoA table template (Excel or Word with {{SOA_TABLE}} and other placeholders)."""
    store.require_study(db, study_id, user, "editor")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".xlsx", ".docx"):
        raise HTTPException(status_code=400, detail="Templates must be .xlsx or .docx files")
    content = await file.read()
    if not content or len(content) > MAX_FILE_SIZE_MB * 1024 * 1024 or not content.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="The template file is empty, too large or not a valid Office file")
    try:
        found = template_placeholders(content, ext[1:])
    except Exception:
        raise HTTPException(status_code=400, detail="The template could not be opened")
    tid = store.new_id()
    path = design_routes.UPLOAD_DIR / f"soatemplate_{tid}{ext}"
    with open(path, "xb") as f:
        f.write(content)
    data = {"name": (name or Path(file.filename).stem)[:120], "filename": Path(file.filename).name, "format": ext[1:],
            "path": str(path), "placeholders": found,
            "warning": None if "{{SOA_TABLE}}" in found else "No {{SOA_TABLE}} placeholder: the matrix is added on a new sheet/at the end"}
    a = store.save_artifact(db, study_id=study_id, version_id=None, kind="soa_template", data=data, user_id=user.id, note=data["name"])
    store.audit(db, user.id, "soa_template_uploaded", study_id, entity="soa_template", detail={"artifact_id": a.id, "format": data["format"]})
    out = store.artifact_dict(a)
    out["data"].pop("path", None)
    return out


@router.get("/studies/{study_id}/soa-templates")
async def list_soa_templates(study_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    store.require_study(db, study_id, user)
    items = []
    for a in store.list_artifacts(db, study_id, "soa_template"):
        d = store.artifact_dict(a)
        d["data"].pop("path", None)
        items.append(d)
    return {"templates": items}


# ─── Feature 10: Sample Size & Power ─────────────────────────────────

@router.get("/sample-size/methods")
async def sample_size_methods(user: UserDB = Depends(get_current_user)):
    return {"method_version": ss_engine.METHOD_VERSION, "methods": ss_engine.METHODS,
            "unsupported": ss_engine.UNSUPPORTED_DESIGNS, "disclaimer": ss_engine.DISCLAIMER}


class SampleSizeRequest(BaseModel):
    inputs: dict
    name: str | None = None
    basis_note: str | None = None


@router.post("/sample-size/calculate")
async def sample_size_preview(req: SampleSizeRequest, user: UserDB = Depends(get_current_user)):
    """Stateless calculation (nothing saved)."""
    try:
        return ss_engine.calculate(req.inputs)
    except ss_engine.SampleSizeError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/versions/{version_id}/sample-size")
async def save_sample_size(version_id: str, req: SampleSizeRequest, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Calculate and save a scenario. Each scenario is a new artifact; earlier analyses are never overwritten."""
    v, _, _ = store.require_version(db, version_id, user, "editor")
    try:
        result = ss_engine.calculate(req.inputs)
    except ss_engine.SampleSizeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    data = {"name": (req.name or "").strip()[:120] or f"Scenario {store.now_iso()[:16]}", "basis_note": req.basis_note,
            "submitted_inputs": req.inputs, "result": result}
    a = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="sample_size", data=data, user_id=user.id,
                            method_version=ss_engine.METHOD_VERSION, note=data["name"])
    store.audit(db, user.id, "sample_size_saved", v.study_id, v.id, "sample_size",
                {"artifact_id": a.id, "method": result["method_id"], "method_version": ss_engine.METHOD_VERSION})
    return store.artifact_dict(a)


@router.get("/versions/{version_id}/sample-size")
async def list_sample_size(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user)
    rows = store.list_artifacts(db, v.study_id, "sample_size", v.id)
    return {"scenarios": [store.artifact_dict(a) for a in rows], "role": role}


@router.post("/versions/{version_id}/sample-size/{artifact_id}/verify")
async def verify_sample_size(version_id: str, artifact_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Recompute a saved scenario from its stored inputs and confirm the result is reproduced."""
    v, _, _ = store.require_version(db, version_id, user)
    a = store.get_artifact(db, artifact_id, v.study_id)
    if a.kind != "sample_size" or a.protocol_version_id != v.id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    data = json.loads(a.data_json)
    same_method = a.method_version == ss_engine.METHOD_VERSION
    recomputed = ss_engine.calculate(data["submitted_inputs"])
    keys = ("evaluable", "enrollment", "events", "raw")
    match = all(recomputed.get(k) == data["result"].get(k) for k in keys)
    return {"reproducible": match and same_method, "saved_method_version": a.method_version,
            "current_method_version": ss_engine.METHOD_VERSION, "results_match": match}


@router.get("/versions/{version_id}/sample-size/{artifact_id}/report")
async def sample_size_report(version_id: str, artifact_id: str, format: str = "docx",
                             db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, _ = store.require_version(db, version_id, user)
    a = store.get_artifact(db, artifact_id, v.study_id)
    if a.kind != "sample_size" or a.protocol_version_id != v.id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if format not in ("docx", "pdf"):
        raise HTTPException(status_code=400, detail="Format must be docx or pdf")
    data = json.loads(a.data_json)
    meta = _meta(s, v, a, f"Sample size calculation — {data['name']}") + [("Scenario ID", a.id)]
    content, mime, ext = render(sample_size_model(meta, data["result"]), f"Sample Size & Power — {data['name']}", format)
    store.audit(db, user.id, "sample_size_exported", v.study_id, v.id, "sample_size", {"artifact_id": a.id, "format": format})
    return _file(content, mime, f"{s.study_code}_sample_size_{a.id}.{ext}".replace(" ", "_"))


# ─── Feature 11: Protocol Version Control ────────────────────────────

class CompareRequest(BaseModel):
    base_version_id: str | None = None
    confirm_match: bool = False


@router.post("/versions/{version_id}/compare")
async def compare_versions(version_id: str, req: CompareRequest, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, role = store.require_version(db, version_id, user, "editor")
    if req.base_version_id:
        base = db.query(ProtocolVersionDB).filter(ProtocolVersionDB.id == req.base_version_id).first()
        if not base or base.study_id != v.study_id:
            raise HTTPException(status_code=400, detail="The base version must belong to the same study")
    else:
        base = (db.query(ProtocolVersionDB).filter(ProtocolVersionDB.study_id == v.study_id, ProtocolVersionDB.sequence < v.sequence)
                .order_by(ProtocolVersionDB.sequence.desc()).first())
        if not base:
            raise HTTPException(status_code=400, detail="There is no earlier version of this study to compare with")
    if base.id == v.id:
        raise HTTPException(status_code=400, detail="Choose two different versions")
    old_blocks, new_blocks = load_blocks(db, base), load_blocks(db, v)
    match = version_compare.match_versions(old_blocks, new_blocks, _latest_data(db, base, "protocol_intelligence"),
                                           _latest_data(db, v, "protocol_intelligence"))
    if match["level"] != "confident" and not req.confirm_match:
        store.audit(db, user.id, "comparison_match_uncertain", v.study_id, v.id, "version_comparison", {"base": base.id, "match": match})
        raise HTTPException(status_code=409, detail={"message": "These documents may not be versions of the same protocol. Confirm to compare anyway.", "match": match})
    match["confirmed_by"] = user.id if match["level"] != "confident" else None
    result = version_compare.compare(old_blocks, new_blocks)
    linked = [store.artifact_dict(a, include_data=False) for a in store.list_artifacts(db, v.study_id, version_id=base.id)]
    version_compare.link_artifacts(result["impact_areas"], linked, doc_analyses(db, base))
    data = {"base_version_id": base.id, "target_version_id": v.id, "base_label": version_name(base), "target_label": version_name(v),
            "base_sha256": base.file_sha256, "target_sha256": v.file_sha256, "match": match, **result}
    a = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="version_comparison", data=data, user_id=user.id,
                            method_version=version_compare.METHOD_VERSION, note=f"{version_name(base)} → {version_name(v)}")
    store.audit(db, user.id, "versions_compared", v.study_id, v.id, "version_comparison",
                {"artifact_id": a.id, "base": base.id, "totals": result["totals"], "match": match["level"]})
    return {**_with_history(db, a), "role": role}


@router.get("/versions/{version_id}/comparisons")
async def list_comparisons(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user)
    return {"comparisons": [_with_history(db, a) for a in store.list_artifacts(db, v.study_id, "version_comparison", v.id)], "role": role}


class ChangeReview(BaseModel):
    action: str  # accept | reject | comment | add_action
    comment: str | None = None
    action_item: dict | None = None


@router.post("/comparisons/{artifact_id}/changes/{change_id}/review")
async def review_change(artifact_id: str, change_id: str, req: ChangeReview, study_id: str,
                        db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    _, role = store.require_study(db, study_id, user, "editor")
    a = store.get_artifact(db, artifact_id, study_id)
    a = store.latest_in_lineage(db, a.lineage_id)
    if a.kind != "version_comparison":
        raise HTTPException(status_code=404, detail="Comparison not found")
    data = json.loads(a.data_json)
    ch = next((c for c in data["changes"] if c["id"] == change_id), None)
    if not ch:
        raise HTTPException(status_code=404, detail="Change not found")
    now = store.now_iso()
    if req.action in ("accept", "reject"):
        if store.ROLE_RANK[role] < store.ROLE_RANK["reviewer"]:
            raise HTTPException(status_code=403, detail="Accepting or rejecting changes requires the 'reviewer' role")
        ch["review"] = {"status": "accepted" if req.action == "accept" else "rejected", "by": user.id, "at": now, "comment": req.comment}
    elif req.action == "comment":
        if not (req.comment or "").strip():
            raise HTTPException(status_code=400, detail="Comment text is required")
        ch["comments"].append({"by": user.id, "at": now, "text": req.comment.strip()[:2000]})
    elif req.action == "add_action":
        item = req.action_item or {}
        if not str(item.get("description") or "").strip():
            raise HTTPException(status_code=400, detail="Follow-up action needs a description")
        ch["actions"].append({"description": str(item["description"])[:1000], "assignee": str(item.get("assignee") or "")[:200],
                              "due": str(item.get("due") or "")[:20], "status": "open", "by": user.id, "at": now})
    else:
        raise HTTPException(status_code=400, detail="Action must be accept, reject, comment or add_action")
    new = store.save_artifact(db, study_id=study_id, version_id=a.protocol_version_id, kind=a.kind, data=data, user_id=user.id,
                              lineage_id=a.lineage_id, status=a.status, method_version=a.method_version, note=f"{req.action} {change_id}")
    store.audit(db, user.id, "change_reviewed", study_id, a.protocol_version_id, "version_comparison",
                {"artifact_id": new.id, "change": change_id, "action": req.action})
    return {**_with_history(db, new), "role": role}


# ─── Feature 12: Design Reports & AI Assistant ───────────────────────

@router.get("/reports/types")
async def report_types(user: UserDB = Depends(get_current_user)):
    return {"types": {k: {"title": v["title"], "sections": v["sections"]} for k, v in reports.REPORT_TYPES.items()},
            "sections": reports.section_catalogue()}


def _selected_artifacts(db: Session, v: ProtocolVersionDB, kinds: list[str], artifact_ids: list[str] | None) -> dict:
    """Explicitly chosen analysis results, or the latest of each kind for this version. Never another version's outputs.
    When analyses are chosen explicitly, kinds without a chosen result are left out rather than filled with the latest."""
    out = {k: [] for k in kinds}
    if artifact_ids is not None:
        for aid in artifact_ids:
            a = store.get_artifact(db, aid, v.study_id)
            if a.protocol_version_id != v.id:
                raise HTTPException(status_code=400, detail=f"Artifact {aid} belongs to a different protocol version")
            if a.kind in out:
                out[a.kind].append(store.artifact_dict(a))
        return out
    for k in kinds:
        rows = store.list_artifacts(db, v.study_id, k, v.id)
        if k == "sample_size":
            out[k] = [store.artifact_dict(a) for a in rows]
        elif rows:
            out[k] = [store.artifact_dict(rows[0])]
    return out


class ReportRequest(BaseModel):
    report_type: str | None = None
    template_id: str | None = None
    sections: list[str] | None = None
    artifact_ids: list[str] | None = None


@router.get("/versions/{version_id}/report-sources")
async def report_sources(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Analysis results of this version that can be chosen explicitly for a report."""
    v, _, _ = store.require_version(db, version_id, user)
    kinds = ["protocol_intelligence", "protocol_review", "endpoint_intelligence", "soa", "sample_size", "version_comparison"]
    items = []
    for k in kinds:
        for a in store.list_artifacts(db, v.study_id, k, v.id):
            d = json.loads(a.data_json)
            items.append({"id": a.id, "kind": a.kind, "revision": a.revision, "status": a.status, "created_at": a.created_at,
                          "method_version": a.method_version, "name": d.get("name") or a.note})
    analyses = doc_analyses(db, v)
    existing = [{"key": k, "label": reports.EXISTING_LABELS[k], "available": bool(analyses.get(k))} for k in reports.EXISTING_LABELS]
    return {"artifacts": items, "existing_analyses": existing}


@router.post("/versions/{version_id}/reports")
async def generate_report(version_id: str, req: ReportRequest, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, role = store.require_version(db, version_id, user, "editor")
    template = None
    if req.template_id:
        t = store.get_artifact(db, req.template_id, v.study_id)
        if t.kind != "report_template":
            raise HTTPException(status_code=404, detail="Report template not found")
        template = {**json.loads(t.data_json), "artifact_id": t.id, "revision": t.revision}
    try:
        effective = reports.resolve_template(req.report_type, req.sections, template)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    versions = db.query(ProtocolVersionDB).filter(ProtocolVersionDB.study_id == v.study_id).order_by(ProtocolVersionDB.sequence).all()
    ctx = {
        "study": {"study_code": s.study_code, "title": s.title},
        "version": {"id": v.id, "label": version_name(v)},
        "versions": [design_routes.version_dict(db, x) for x in versions],
        "artifacts": _selected_artifacts(db, v, reports.kinds_for(effective["sections"]), req.artifact_ids),
        "doc_analyses": doc_analyses(db, v),
        "doc_id": v.document_id,
        "user_id": user.id,
        "generated_at": store.now_iso(),
    }
    report = reports.build_report(req.report_type, ctx, req.sections, template)
    if template:
        report["template"]["artifact_id"] = template["artifact_id"]
        report["template"]["revision"] = template["revision"]
    a = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="report", data=report, user_id=user.id,
                            method_version=reports.METHOD_VERSION, note=report["title"])
    store.audit(db, user.id, "report_generated", v.study_id, v.id, "report",
                {"artifact_id": a.id, "type": report["report_type"], "template_id": req.template_id,
                 "sources": report["metadata"]["analysis_versions"]})
    return {**_with_history(db, a), "role": role}


class ReportTemplate(BaseModel):
    name: str
    title: str
    intro: str = ""
    sections: list[str]


def _validate_template(req: ReportTemplate) -> dict:
    if not req.name.strip() or not req.title.strip():
        raise HTTPException(status_code=400, detail="Template name and report title are required")
    unknown = [x for x in req.sections if x not in reports.SECTIONS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown sections: {', '.join(unknown)}")
    if not req.sections:
        raise HTTPException(status_code=400, detail="Choose at least one section")
    return {"name": req.name.strip()[:120], "title": req.title.strip()[:200], "intro": req.intro.strip()[:4000],
            "sections": list(dict.fromkeys(req.sections))}


@router.get("/studies/{study_id}/report-templates")
async def list_report_templates(study_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    store.require_study(db, study_id, user)
    return {"templates": [store.artifact_dict(a) for a in store.list_artifacts(db, study_id, "report_template")]}


@router.post("/studies/{study_id}/report-templates")
async def create_report_template(study_id: str, req: ReportTemplate, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    store.require_study(db, study_id, user, "editor")
    a = store.save_artifact(db, study_id=study_id, version_id=None, kind="report_template", data=_validate_template(req),
                            user_id=user.id, note="Created")
    store.audit(db, user.id, "report_template_created", study_id, entity="report_template", detail={"artifact_id": a.id})
    return store.artifact_dict(a)


@router.put("/studies/{study_id}/report-templates/{template_id}")
async def update_report_template(study_id: str, template_id: str, req: ReportTemplate,
                                 db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    """Edits are saved as a new template revision; reports keep the revision they were generated with."""
    store.require_study(db, study_id, user, "editor")
    t = store.get_artifact(db, template_id, study_id)
    if t.kind != "report_template":
        raise HTTPException(status_code=404, detail="Report template not found")
    a = store.save_artifact(db, study_id=study_id, version_id=None, kind="report_template", data=_validate_template(req),
                            user_id=user.id, lineage_id=t.lineage_id, note="Edited")
    store.audit(db, user.id, "report_template_updated", study_id, entity="report_template",
                detail={"artifact_id": a.id, "revision": a.revision})
    return store.artifact_dict(a)


@router.get("/versions/{version_id}/reports")
async def list_reports(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, role = store.require_version(db, version_id, user)
    return {"reports": [_with_history(db, a) for a in store.list_artifacts(db, v.study_id, "report", v.id)], "role": role}


@router.get("/reports/{artifact_id}/export")
async def export_report(artifact_id: str, study_id: str, format: str = "docx",
                        db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    s, _ = store.require_study(db, study_id, user)
    a = store.get_artifact(db, artifact_id, study_id)
    if a.kind != "report":
        raise HTTPException(status_code=404, detail="Report not found")
    if format not in ("docx", "pdf"):
        raise HTTPException(status_code=400, detail="Format must be docx or pdf")
    report = json.loads(a.data_json)
    content, mime, ext = render(reports.report_model(report, a.status, a.revision), report["title"], format)
    store.audit(db, user.id, "report_exported", study_id, a.protocol_version_id, "report", {"artifact_id": a.id, "format": format})
    name = f"{s.study_code}_{report['report_type']}_r{a.revision}_{a.status}".replace(" ", "_")
    return _file(content, mime, f"{name}.{ext}")


class AssistantRequest(BaseModel):
    question: str
    artifact_ids: list[str] | None = None
    include_existing_analyses: bool = True


ASSISTANT_KINDS = ["protocol_intelligence", "protocol_review", "endpoint_intelligence", "soa", "sample_size", "version_comparison"]


@router.post("/versions/{version_id}/assistant")
async def ask_assistant(version_id: str, req: AssistantRequest, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, s, _ = store.require_version(db, version_id, user)
    q = req.question.strip()
    if not q or len(q) > 2000:
        raise HTTPException(status_code=400, detail="Question must be 1–2000 characters")
    artifacts = _selected_artifacts(db, v, ASSISTANT_KINDS, req.artifact_ids)
    corpus = reports.build_corpus(load_blocks(db, v, include_supporting=True), artifacts, doc_analyses(db, v), req.include_existing_analyses)
    try:
        result = await reports.answer(q, corpus)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Assistant failed: {str(e)[:200]}")
    result["context"] = {"study_id": s.study_code, "protocol_version": version_name(v), "protocol_version_id": v.id,
                         "artifacts": [{"id": a["id"], "kind": a["kind"], "revision": a["revision"], "status": a["status"]}
                                       for lst in artifacts.values() for a in lst]}
    a = store.save_artifact(db, study_id=v.study_id, version_id=v.id, kind="assistant_qa", data={"question": q, **result},
                            user_id=user.id, method_version=reports.METHOD_VERSION)
    store.audit(db, user.id, "assistant_question", v.study_id, v.id, "assistant_qa",
                {"artifact_id": a.id, **reports.assistant_payload_for_audit(result)})
    return {"id": a.id, "question": q, **result}


@router.get("/versions/{version_id}/assistant/history")
async def assistant_history(version_id: str, db: Session = Depends(get_db), user: UserDB = Depends(get_current_user)):
    v, _, _ = store.require_version(db, version_id, user)
    rows = [a for a in store.list_artifacts(db, v.study_id, "assistant_qa", v.id) if a.created_by == user.id][:50]
    return {"items": [{"id": a.id, "created_at": a.created_at, **json.loads(a.data_json)} for a in reversed(rows)]}
