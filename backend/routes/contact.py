"""
Contact / enquiry / newsletter routes for the iClinicalAI marketing website.

Every submission is stored in the contact_messages table immediately and the
notification email is sent in the BACKGROUND (so the website responds instantly
instead of waiting for the SMTP handshake). Emails go to info@iclinical.ai with
Reply-To set to the sender. A configurable daily cap (MAX_EMAILS_PER_DAY)
protects the mailbox from abuse — submissions past the cap are still stored.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db, SessionLocal, ContactMessageDB
from config import MAX_EMAILS_PER_DAY, EMAIL_ENABLED
from services.email_service import send_contact_email

router = APIRouter(prefix="/api", tags=["Contact"])


# ─── Schemas ──────────────────────────────────────────────────────

class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    organization: Optional[str] = None
    subject: Optional[str] = None
    message: str
    kind: str = "enquiry"  # "enquiry" | "partnership"
    source_page: Optional[str] = None

    @field_validator("name", "message")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("This field is required.")
        return v.strip()


class SubscribeRequest(BaseModel):
    email: EmailStr
    source_page: Optional[str] = None


class SubmitResponse(BaseModel):
    status: str
    message: str
    emailed: bool


# ─── Helpers ──────────────────────────────────────────────────────

def _emails_sent_today(db: Session) -> int:
    start_of_day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(func.count(ContactMessageDB.id))
        .filter(ContactMessageDB.email_sent == 1)
        .filter(ContactMessageDB.created_at >= start_of_day)
        .scalar()
    ) or 0


def _send_in_background(record_id: int, kind: str, data: dict) -> None:
    """Runs after the HTTP response is returned. Sends the email and, on
    success, marks the stored record as delivered using a fresh DB session."""
    ok = send_contact_email(kind, data)
    if not ok:
        return
    db = SessionLocal()
    try:
        rec = db.get(ContactMessageDB, record_id)
        if rec:
            rec.email_sent = 1
            db.commit()
    except Exception as e:
        print(f"[contact] Could not mark record {record_id} as sent: {e}")
        db.rollback()
    finally:
        db.close()


def _store(db: Session, kind: str, data: dict) -> ContactMessageDB:
    record = ContactMessageDB(
        kind=kind,
        name=data.get("name"),
        email=data.get("email"),
        organization=data.get("organization"),
        subject=data.get("subject"),
        message=data.get("message"),
        source_page=data.get("source_page"),
        email_sent=0,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# ─── Endpoints ────────────────────────────────────────────────────

@router.post("/contact", response_model=SubmitResponse)
async def submit_contact(req: ContactRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    kind = "partnership" if req.kind == "partnership" else "enquiry"
    data = {
        "name": req.name, "email": str(req.email), "organization": req.organization,
        "subject": req.subject, "message": req.message, "source_page": req.source_page,
    }
    record = _store(db, kind, data)

    scheduled = EMAIL_ENABLED and _emails_sent_today(db) < MAX_EMAILS_PER_DAY
    if scheduled:
        background_tasks.add_task(_send_in_background, record.id, kind, data)

    return SubmitResponse(
        status="ok",
        message="Thank you! Your message has been received. Our team will get back to you shortly.",
        emailed=scheduled,
    )


@router.post("/subscribe", response_model=SubmitResponse)
async def subscribe(req: SubscribeRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    data = {
        "name": None, "email": str(req.email), "organization": None,
        "subject": "Newsletter subscription",
        "message": f"{req.email} subscribed to the newsletter.",
        "source_page": req.source_page,
    }
    record = _store(db, "subscribe", data)

    scheduled = EMAIL_ENABLED and _emails_sent_today(db) < MAX_EMAILS_PER_DAY
    if scheduled:
        background_tasks.add_task(_send_in_background, record.id, "subscribe", data)

    return SubmitResponse(
        status="ok",
        message="You're subscribed! Thank you for joining the iClinicalAI newsletter.",
        emailed=scheduled,
    )
