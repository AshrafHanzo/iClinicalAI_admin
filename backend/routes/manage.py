"""
Manage Routes
FastAPI endpoints for iClinicalAI MANAGE module features.
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pydantic import BaseModel
from pathlib import Path
from sqlalchemy.orm import Session

from database import get_db, UserDB
from routes.auth import get_current_user
import services.db_service as db_service
from services.manage_engine import run_manage_analysis, audit_dataset_file

router = APIRouter(prefix="/api/manage", tags=["Manage"])

class ManageAnalysisRequest(BaseModel):
    step: str
    doc_id: str | None = None
    extra_input: str | None = None

MOCK_DATASET_CSV = """USUBJID,VISIT,AGE,SEX,AETERM,AESTDTC,AEENDTC,AESER,AEACN
SUBJ-001,Screening,45,F,Head Pain,2026-05-10,2026-05-12,N,NONE
SUBJ-001,Visit 2,,F,Nausea,2026-05-15,2026-05-14,N,NONE
SUBJ-002,Screening,150,M,Fatigue,2026-05-12,ONGOING,N,NONE
SUBJ-003,Visit 2,62,M,Hypertension,12-May-2026,18-May-2026,Y,DOSE_REDUCED
SUBJ-003,Visit 2,62,M,Hypertension,12-May-2026,18-May-2026,Y,DOSE_REDUCED
SUBJ-004,,35,F,Dyspnea,2026-99-99,,N,
"""

@router.post("/analyze")
async def analyze_manage_step(
    request: ManageAnalysisRequest, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Run an AI-powered analysis step for Clinical Data Management."""
    document_text = ""
    doc = None
    if request.doc_id:
        doc = db_service.get_document(db, request.doc_id, user_id=current_user.id)
        if doc:
            document_text = doc["extracted_text"]
        else:
            raise HTTPException(status_code=404, detail="Document not found")
    else:
        # Fallback default empty text if no document uploaded yet
        document_text = "No study protocol selected. Operating under general clinical data management guidelines."

    try:
        result = await run_manage_analysis(
            step=request.step,
            document_text=document_text,
            extra_input=request.extra_input
        )
        if doc:
            doc.setdefault("analysis_results", {})[request.step] = result
            db_service.save_document(db, doc, user_id=current_user.id)
            
        db_service.log_api_usage(db, current_user.id, "MANAGE", 11200)
        return {
            "step": request.step,
            "result": result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data management analysis failed: {str(e)}")

@router.post("/upload-dataset")
async def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Upload a CSV dataset and audit it for clinical data entry errors."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported in this version.")
    try:
        content = await file.read()
        text_content = content.decode("utf-8", errors="ignore")
        audit_results = audit_dataset_file(text_content, file.filename)
        db_service.log_api_usage(db, current_user.id, "MANAGE", 8500)
        return audit_results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to audit dataset: {str(e)}")

@router.get("/mock-dataset")
async def get_mock_dataset():
    """Retrieve a pre-loaded sample clinical dataset with typical errors for demo testing."""
    audit_results = audit_dataset_file(MOCK_DATASET_CSV, "sample_adverse_events.csv")
    return {
        "csv_text": MOCK_DATASET_CSV,
        "audit": audit_results
    }
