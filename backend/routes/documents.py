"""
Document Routes
Handles document upload, listing, retrieval, and deletion.
"""

import uuid
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session

from config import UPLOAD_DIR, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS
from database import get_db, UserDB
from routes.auth import get_current_user
import services.db_service as db_service
from services.document_parser import extract_text, get_document_stats
from models.schemas import DocumentResponse, DocumentDetailResponse, DocumentListResponse

router = APIRouter(prefix="/api/documents", tags=["Documents"])

# Dummy exports for backward compatibility
documents_store = {}
def save_db():
    pass

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Upload a clinical document (PDF, DOCX, or TXT)."""
    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Validate file size
    if file_size > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE_MB}MB",
        )

    # Generate unique ID and save file
    doc_id = str(uuid.uuid4())[:8]
    safe_filename = f"{doc_id}_{file.filename}"
    file_path = UPLOAD_DIR / safe_filename

    with open(file_path, "wb") as f:
        f.write(content)

    # Extract text from document
    try:
        extracted_text = extract_text(str(file_path))
    except Exception as e:
        # Clean up file on extraction failure
        os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {str(e)}")

    # Get document stats
    stats = get_document_stats(extracted_text)

    # Store document metadata in database
    doc_data = {
        "id": doc_id,
        "filename": file.filename,
        "safe_filename": safe_filename,
        "file_path": str(file_path),
        "file_type": ext,
        "file_size": file_size,
        "upload_time": datetime.now().isoformat(),
        "extracted_text": extracted_text,
        "stats": stats,
        "word_count": stats["word_count"],
        "status": "processed",
        "analysis_results": {},
        "user_id": current_user.id
    }
    db_service.save_document(db, doc_data, user_id=current_user.id)

    return DocumentResponse(
        id=doc_id,
        filename=file.filename,
        file_type=ext,
        file_size=file_size,
        upload_time=doc_data["upload_time"],
        word_count=stats["word_count"],
        status="processed",
        analysis_results={},
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """List all uploaded documents."""
    docs = db_service.list_documents(db, user_id=current_user.id)
    docs_responses = [
        DocumentResponse(
            id=doc["id"],
            filename=doc["filename"],
            file_type=doc["file_type"],
            file_size=doc["file_size"],
            upload_time=doc["upload_time"],
            word_count=doc["word_count"],
            status=doc["status"],
            analysis_results=doc.get("analysis_results", {}),
        )
        for doc in docs
    ]
    return DocumentListResponse(documents=docs_responses, total=len(docs_responses))


@router.get("/{doc_id}", response_model=DocumentDetailResponse)
async def get_document(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Get document details including extracted text."""
    doc = db_service.get_document(db, doc_id, user_id=current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentDetailResponse(
        id=doc["id"],
        filename=doc["filename"],
        file_type=doc["file_type"],
        file_size=doc["file_size"],
        upload_time=doc["upload_time"],
        word_count=doc["word_count"],
        status=doc["status"],
        extracted_text=doc["extracted_text"],
        stats=doc["stats"],
        analysis_results=doc.get("analysis_results", {}),
    )


@router.post("/{doc_id}/dashboard")
async def get_or_generate_dashboard(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Generate or retrieve executive study dashboard and health readiness scores."""
    from services.analysis_engine import generate_executive_dashboard
    doc = db_service.get_document(db, doc_id, user_id=current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    stats = doc.get("stats") or {}
    
    if "executive_dashboard" in stats and stats["executive_dashboard"]:
        return {"executive_dashboard": stats["executive_dashboard"]}
        
    try:
        text = doc.get("extracted_text", "")
        dashboard_data = await generate_executive_dashboard(text)
        
        stats["executive_dashboard"] = dashboard_data
        
        doc_data = {
            "id": doc["id"],
            "filename": doc["filename"],
            "safe_filename": doc["safe_filename"],
            "file_path": doc["file_path"],
            "file_type": doc["file_type"],
            "file_size": doc["file_size"],
            "upload_time": doc["upload_time"],
            "extracted_text": text,
            "stats": stats,
            "word_count": doc["word_count"],
            "status": doc["status"],
            "analysis_results": doc.get("analysis_results", {}),
            "user_id": current_user.id
        }
        db_service.save_document(db, doc_data, user_id=current_user.id)
        
        return {"executive_dashboard": dashboard_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Delete a document."""
    doc = db_service.get_document(db, doc_id, user_id=current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete file from disk
    try:
        if doc.get("file_path") and os.path.exists(doc["file_path"]):
            os.remove(doc["file_path"])
    except Exception as e:
        # Robust fall-through if file is locked or permission denied
        pass

    # Remove from database
    db_service.delete_document(db, doc_id, user_id=current_user.id)

    return {"message": "Document deleted successfully", "id": doc_id}
