"""
Pydantic Schemas
Request and response models for the API.
"""

from pydantic import BaseModel
from datetime import datetime


# ─── Document Schemas ─────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    upload_time: str
    word_count: int
    page_count: int | None = None
    status: str = "processed"
    analysis_results: dict = {}


class DocumentDetailResponse(DocumentResponse):
    extracted_text: str
    stats: dict
    analysis_results: dict = {}


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int


# ─── Analysis Schemas ─────────────────────────────────────────────

class AnalysisResponse(BaseModel):
    doc_id: str
    analysis_type: str
    result: str
    timestamp: str


class FullAnalysisResponse(BaseModel):
    doc_id: str
    summary: str
    key_information: str
    eligibility_review: str
    gap_analysis: str
    feasibility_checklist: str
    design_recommendations: str
    timestamp: str


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ChatResponse(BaseModel):
    doc_id: str
    response: str
    timestamp: str


class ErrorResponse(BaseModel):
    detail: str
