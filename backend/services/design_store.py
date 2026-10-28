"""
DESIGN Store
Study access control, versioned artifacts and the audit trail for the DESIGN workspace.
"""

import json
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database import (
    StudyDB, StudyMemberDB, ProtocolVersionDB, DesignArtifactDB, DesignAuditDB, UserDB,
)

# Higher number = more rights. A role includes the rights of every role below it.
ROLE_RANK = {"viewer": 1, "editor": 2, "reviewer": 3, "owner": 4}


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ─── Access control ──────────────────────────────────────────────────

def member_role(db: Session, study_id: str, user_id: str) -> str | None:
    m = db.query(StudyMemberDB).filter(
        StudyMemberDB.study_id == study_id, StudyMemberDB.user_id == user_id
    ).first()
    return m.role if m else None


def require_study(db: Session, study_id: str, user: UserDB, min_role: str = "viewer") -> tuple[StudyDB, str]:
    """Return the study and the caller's role, or raise. Non-members get 404 so study IDs do not leak."""
    study = db.query(StudyDB).filter(StudyDB.id == study_id).first()
    role = member_role(db, study_id, user.id) if study else None
    if not study or not role:
        raise HTTPException(status_code=404, detail="Study not found")
    if ROLE_RANK[role] < ROLE_RANK[min_role]:
        raise HTTPException(status_code=403, detail=f"This action requires the '{min_role}' role on this study")
    return study, role


def require_version(db: Session, version_id: str, user: UserDB, min_role: str = "viewer") -> tuple[ProtocolVersionDB, StudyDB, str]:
    version = db.query(ProtocolVersionDB).filter(ProtocolVersionDB.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Protocol version not found")
    study, role = require_study(db, version.study_id, user, min_role)
    return version, study, role


def study_ids_for_user(db: Session, user_id: str) -> list[str]:
    return [m.study_id for m in db.query(StudyMemberDB).filter(StudyMemberDB.user_id == user_id).all()]


# ─── Audit ───────────────────────────────────────────────────────────

def audit(db: Session, user_id: str, action: str, study_id: str | None = None,
          version_id: str | None = None, entity: str | None = None, detail: dict | None = None,
          commit: bool = True) -> None:
    db.add(DesignAuditDB(
        study_id=study_id,
        protocol_version_id=version_id,
        user_id=user_id,
        action=action,
        entity=entity,
        detail_json=json.dumps(detail or {}),
        timestamp=datetime.utcnow(),
    ))
    if commit:
        db.commit()


def list_audit(db: Session, study_id: str, limit: int = 200) -> list[dict]:
    rows = (db.query(DesignAuditDB).filter(DesignAuditDB.study_id == study_id)
            .order_by(DesignAuditDB.id.desc()).limit(limit).all())
    return [{
        "id": r.id,
        "protocol_version_id": r.protocol_version_id,
        "user_id": r.user_id,
        "action": r.action,
        "entity": r.entity,
        "detail": json.loads(r.detail_json or "{}"),
        "timestamp": r.timestamp.isoformat() + "Z" if r.timestamp else None,
    } for r in rows]


# ─── Artifacts ───────────────────────────────────────────────────────

def artifact_dict(a: DesignArtifactDB, include_data: bool = True) -> dict:
    out = {
        "id": a.id,
        "study_id": a.study_id,
        "protocol_version_id": a.protocol_version_id,
        "kind": a.kind,
        "lineage_id": a.lineage_id,
        "revision": a.revision,
        "status": a.status,
        "method_version": a.method_version,
        "note": a.note,
        "created_by": a.created_by,
        "created_at": a.created_at,
    }
    if include_data:
        out["data"] = json.loads(a.data_json)
    return out


def save_artifact(db: Session, *, study_id: str, version_id: str | None, kind: str, data: dict,
                  user_id: str, lineage_id: str | None = None, status: str = "draft",
                  method_version: str | None = None, note: str | None = None) -> DesignArtifactDB:
    """Insert a new artifact revision. Passing lineage_id appends a revision to an existing artifact."""
    revision = 1
    if lineage_id:
        last = latest_in_lineage(db, lineage_id)
        if not last or last.study_id != study_id:
            raise HTTPException(status_code=404, detail="Artifact not found")
        revision = last.revision + 1
    else:
        lineage_id = new_id()
    a = DesignArtifactDB(
        id=new_id(),
        study_id=study_id,
        protocol_version_id=version_id,
        kind=kind,
        lineage_id=lineage_id,
        revision=revision,
        status=status,
        method_version=method_version,
        data_json=json.dumps(data),
        note=note,
        created_by=user_id,
        created_at=now_iso(),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def latest_in_lineage(db: Session, lineage_id: str) -> DesignArtifactDB | None:
    return (db.query(DesignArtifactDB).filter(DesignArtifactDB.lineage_id == lineage_id)
            .order_by(DesignArtifactDB.revision.desc()).first())


def lineage_history(db: Session, lineage_id: str) -> list[DesignArtifactDB]:
    return (db.query(DesignArtifactDB).filter(DesignArtifactDB.lineage_id == lineage_id)
            .order_by(DesignArtifactDB.revision.asc()).all())


def latest_artifact(db: Session, version_id: str, kind: str) -> DesignArtifactDB | None:
    """Most recent revision of the most recently created artifact of a kind for a protocol version."""
    return (db.query(DesignArtifactDB)
            .filter(DesignArtifactDB.protocol_version_id == version_id, DesignArtifactDB.kind == kind)
            .order_by(DesignArtifactDB.created_at.desc(), DesignArtifactDB.revision.desc()).first())


def list_artifacts(db: Session, study_id: str, kind: str | None = None, version_id: str | None = None,
                   latest_only: bool = True) -> list[DesignArtifactDB]:
    q = db.query(DesignArtifactDB).filter(DesignArtifactDB.study_id == study_id)
    if kind:
        q = q.filter(DesignArtifactDB.kind == kind)
    if version_id:
        q = q.filter(DesignArtifactDB.protocol_version_id == version_id)
    rows = q.order_by(DesignArtifactDB.created_at.desc(), DesignArtifactDB.revision.desc()).all()
    if not latest_only:
        return rows
    seen, out = set(), []
    for r in rows:
        if r.lineage_id not in seen:
            seen.add(r.lineage_id)
            out.append(r)
    return out


def get_artifact(db: Session, artifact_id: str, study_id: str) -> DesignArtifactDB:
    a = db.query(DesignArtifactDB).filter(DesignArtifactDB.id == artifact_id).first()
    if not a or a.study_id != study_id:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return a


# Review status transitions shared by every reviewable output.
STATUS_RULES = {
    "draft": "editor",
    "reviewed": "reviewer",
    "approved": "reviewer",
}


def check_status_change(role: str, target: str) -> None:
    if target not in STATUS_RULES:
        raise HTTPException(status_code=400, detail=f"Unknown status '{target}'. Use draft, reviewed or approved")
    needed = STATUS_RULES[target]
    if ROLE_RANK[role] < ROLE_RANK[needed]:
        raise HTTPException(status_code=403, detail=f"Setting status '{target}' requires the '{needed}' role")
