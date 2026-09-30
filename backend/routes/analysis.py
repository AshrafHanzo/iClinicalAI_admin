"""
Analysis Routes
Handles AI-powered document analysis: summarize, extract, eligibility, gaps, feasibility, recommendations, chat.
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from database import get_db, UserDB
from routes.auth import get_current_user
import services.db_service as db_service
from services.analysis_engine import (
    summarize_document,
    extract_key_info,
    review_eligibility,
    analyze_gaps,
    generate_feasibility,
    generate_recommendations,
    full_analysis,
    chat_with_document,
)
from models.schemas import AnalysisResponse, FullAnalysisResponse, ChatRequest, ChatResponse

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])


def _get_document_text(doc_id: str, db: Session, user_id: str) -> str:
    """Helper to get document text or raise 404."""
    doc = db_service.get_document(db, doc_id, user_id=user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc["extracted_text"]


@router.post("/summarize/{doc_id}", response_model=AnalysisResponse)
async def summarize(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Generate an AI summary of the uploaded document."""
    text = _get_document_text(doc_id, db, user_id=current_user.id)
    try:
        result = await summarize_document(text)
        doc = db_service.get_document(db, doc_id, user_id=current_user.id)
        if doc:
            doc.setdefault("analysis_results", {})["summary"] = result
            db_service.save_document(db, doc, user_id=current_user.id)
        db_service.log_api_usage(db, current_user.id, "DESIGN", 12500)
        return AnalysisResponse(
            doc_id=doc_id,
            analysis_type="summary",
            result=result,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/extract/{doc_id}", response_model=AnalysisResponse)
async def extract(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Extract key structured information from the document."""
    text = _get_document_text(doc_id, db, user_id=current_user.id)
    try:
        result = await extract_key_info(text)
        doc = db_service.get_document(db, doc_id, user_id=current_user.id)
        if doc:
            doc.setdefault("analysis_results", {})["extraction"] = result
            db_service.save_document(db, doc, user_id=current_user.id)
        db_service.log_api_usage(db, current_user.id, "DESIGN", 14000)
        return AnalysisResponse(
            doc_id=doc_id,
            analysis_type="extraction",
            result=result,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/eligibility/{doc_id}", response_model=AnalysisResponse)
async def eligibility(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Perform eligibility criteria review on the document."""
    text = _get_document_text(doc_id, db, user_id=current_user.id)
    try:
        result = await review_eligibility(text)
        doc = db_service.get_document(db, doc_id, user_id=current_user.id)
        if doc:
            doc.setdefault("analysis_results", {})["eligibility_review"] = result
            db_service.save_document(db, doc, user_id=current_user.id)
        db_service.log_api_usage(db, current_user.id, "DESIGN", 16500)
        return AnalysisResponse(
            doc_id=doc_id,
            analysis_type="eligibility_review",
            result=result,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eligibility review failed: {str(e)}")


@router.post("/gaps/{doc_id}", response_model=AnalysisResponse)
async def gaps(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Perform gap analysis on the document."""
    text = _get_document_text(doc_id, db, user_id=current_user.id)
    try:
        result = await analyze_gaps(text)
        doc = db_service.get_document(db, doc_id, user_id=current_user.id)
        if doc:
            doc.setdefault("analysis_results", {})["gap_analysis"] = result
            db_service.save_document(db, doc, user_id=current_user.id)
        db_service.log_api_usage(db, current_user.id, "DESIGN", 15000)
        return AnalysisResponse(
            doc_id=doc_id,
            analysis_type="gap_analysis",
            result=result,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gap analysis failed: {str(e)}")


@router.post("/feasibility/{doc_id}", response_model=AnalysisResponse)
async def feasibility(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Generate a feasibility assessment checklist."""
    text = _get_document_text(doc_id, db, user_id=current_user.id)
    try:
        result = await generate_feasibility(text)
        doc = db_service.get_document(db, doc_id, user_id=current_user.id)
        if doc:
            doc.setdefault("analysis_results", {})["feasibility"] = result
            db_service.save_document(db, doc, user_id=current_user.id)
        db_service.log_api_usage(db, current_user.id, "DESIGN", 18000)
        return AnalysisResponse(
            doc_id=doc_id,
            analysis_type="feasibility",
            result=result,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feasibility analysis failed: {str(e)}")


@router.post("/recommendations/{doc_id}", response_model=AnalysisResponse)
async def recommendations(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Generate study design recommendations and benchmark notes."""
    text = _get_document_text(doc_id, db, user_id=current_user.id)
    try:
        result = await generate_recommendations(text)
        doc = db_service.get_document(db, doc_id, user_id=current_user.id)
        if doc:
            doc.setdefault("analysis_results", {})["design_recommendations"] = result
            db_service.save_document(db, doc, user_id=current_user.id)
        db_service.log_api_usage(db, current_user.id, "DESIGN", 13500)
        return AnalysisResponse(
            doc_id=doc_id,
            analysis_type="design_recommendations",
            result=result,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendations failed: {str(e)}")


@router.post("/full/{doc_id}", response_model=FullAnalysisResponse)
async def full(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Run complete analysis (all 6 steps)."""
    text = _get_document_text(doc_id, db, user_id=current_user.id)
    try:
        results = await full_analysis(text)
        doc = db_service.get_document(db, doc_id, user_id=current_user.id)
        if doc:
            analysis_res = doc.setdefault("analysis_results", {})
            analysis_res["summary"] = results["summary"]
            analysis_res["extraction"] = results["key_information"]
            analysis_res["eligibility_review"] = results["eligibility_review"]
            analysis_res["gap_analysis"] = results["gap_analysis"]
            analysis_res["feasibility"] = results["feasibility_checklist"]
            analysis_res["design_recommendations"] = results["design_recommendations"]
            db_service.save_document(db, doc, user_id=current_user.id)
        db_service.log_api_usage(db, current_user.id, "DESIGN", 89500)
        return FullAnalysisResponse(
            doc_id=doc_id,
            summary=results["summary"],
            key_information=results["key_information"],
            eligibility_review=results["eligibility_review"],
            gap_analysis=results["gap_analysis"],
            feasibility_checklist=results["feasibility_checklist"],
            design_recommendations=results["design_recommendations"],
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Full analysis failed: {str(e)}")


@router.post("/chat/{doc_id}", response_model=ChatResponse)
async def chat(
    doc_id: str, 
    request: ChatRequest, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Chat with the document - ask questions about its content."""
    text = _get_document_text(doc_id, db, user_id=current_user.id)

    # Build messages list with history
    messages = list(request.history)
    messages.append({"role": "user", "content": request.message})

    try:
        result = await chat_with_document(text, messages)
        db_service.log_api_usage(db, current_user.id, "DESIGN", 2400)
        return ChatResponse(
            doc_id=doc_id,
            response=result,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")
