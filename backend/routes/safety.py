"""
Safety / Pharmacovigilance Routes
Endpoints for safety signal detection, MedWatch narratives, causality, and safety chat.
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db, UserDB
from routes.auth import get_current_user
import services.db_service as db_service
from services.safety_engine import (
    run_safety_step,
    generate_medwatch_narrative,
    assess_causality,
    chat_with_safety,
)
from models.schemas import AnalysisResponse

router = APIRouter(prefix="/api/safety", tags=["Safety"])

# Pydantic schemas for Safety requests

class SafetyAnalysisRequest(BaseModel):
    step: int
    doc_id: str

class NarrativeRequest(BaseModel):
    event_details: str
    doc_id: str | None = None

class CausalityRequest(BaseModel):
    naranjo_responses: dict
    clinical_context: str = ""

class SafetyChatRequest(BaseModel):
    message: str
    history: list[dict] = []


def _get_document_text(doc_id: str, db: Session, user_id: str) -> str:
    """Helper to retrieve isolated document or raise 404."""
    doc = db_service.get_document(db, doc_id, user_id=user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc["extracted_text"]


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_safety(
    request: SafetyAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Run a specific safety analysis step (1-9)."""
    text = _get_document_text(request.doc_id, db, user_id=current_user.id)
    try:
        result = await run_safety_step(request.step, text)
        
        # Save results in the document
        step_keys = {
            1: "safety_case_review",
            2: "sae_narrative",
            3: "safety_case_summary",
            4: "causality_checklist",
            5: "meddra_coding",
            6: "aggregate_safety",
            7: "safety_trend",
            8: "medical_review",
            9: "signal_detection",
        }
        
        step_key = step_keys.get(request.step)
        doc = db_service.get_document(db, request.doc_id, user_id=current_user.id)
        if doc and step_key:
            doc.setdefault("analysis_results", {})[step_key] = result
            db_service.save_document(db, doc, user_id=current_user.id)
            
        db_service.log_api_usage(db, current_user.id, "SAFETY", 10800)
        return AnalysisResponse(
            doc_id=request.doc_id,
            analysis_type=step_key or f"safety_step_{request.step}",
            result=result,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Safety step {request.step} analysis failed: {str(e)}")


@router.post("/narrative")
async def create_narrative(
    request: NarrativeRequest,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Generate regulatory safety narrative draft."""
    protocol_text = None
    if request.doc_id:
        try:
            protocol_text = _get_document_text(request.doc_id, db, user_id=current_user.id)
        except HTTPException:
            pass
            
    try:
        result = await generate_medwatch_narrative(request.event_details, protocol_text)
        db_service.log_api_usage(db, current_user.id, "SAFETY", 6500)
        return {"narrative": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Narrative generation failed: {str(e)}")


@router.post("/causality")
async def calculate_causality(
    request: CausalityRequest,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Calculate Naranjo score and generate clinical causality assessment."""
    try:
        result = await assess_causality(request.naranjo_responses, request.clinical_context)
        db_service.log_api_usage(db, current_user.id, "SAFETY", 3200)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Causality assessment failed: {str(e)}")


@router.post("/chat/{doc_id}")
async def safety_chat(
    doc_id: str,
    request: SafetyChatRequest,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Chat with the safety and pharmacovigilance parts of the document."""
    text = _get_document_text(doc_id, db, user_id=current_user.id)
    try:
        response = await chat_with_safety(text, request.history + [{"role": "user", "content": request.message}])
        db_service.log_api_usage(db, current_user.id, "SAFETY", 2100)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Safety chat failed: {str(e)}")
