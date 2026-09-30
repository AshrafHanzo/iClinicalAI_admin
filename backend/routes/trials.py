"""
Trials Routes
Handles endpoints for the FIND module: searching trials, listing trials, AI-based analysis, and chatting.
"""

from datetime import datetime
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, UserDB
from routes.auth import get_current_user
import services.db_service as db_service
from services.trials_engine import run_trial_analysis, chat_with_trials, load_all_trials, fetch_live_trials_from_api

router = APIRouter(prefix="/api/trials", tags=["Trials"])

class TrialSearchRequest(BaseModel):
    mode: str = "clinical" # "clinical" or "academic"
    live: bool = False
    
    # Clinical filters
    indication: str | None = None
    therapeutic_area: str | None = None
    phase: str | None = None
    sponsor: str | None = None
    drug_name: str | None = None
    country: str | None = None
    status: str | None = None
    study_design: str | None = None
    enrolment_size: str | None = None
    keywords: str | None = None
    
    # Academic filters
    research_topic: str | None = None
    thesis_area: str | None = None
    specialty: str | None = None
    molecule: str | None = None
    publication_topic: str | None = None
    emerging_area: str | None = None
    research_question: str | None = None

class TrialAnalysisRequest(BaseModel):
    step: str
    selected_trial_ids: list[str] = []
    topic: str | None = None
    mode: str = "clinical"

class TrialChatRequest(BaseModel):
    selected_trial_ids: list[str] = []
    message: str
    history: list[dict] = []


@router.get("")
async def list_trials(db: Session = Depends(get_db)):
    """List all available trials in the database."""
    return {"trials": load_all_trials(db)}


@router.post("/search")
async def search_trials(request: TrialSearchRequest, db: Session = Depends(get_db)):
    """
    Search trials database based on clinical or academic criteria.
    Always queries the live ClinicalTrials.gov V2 registry, with fallback to local cached database.
    """
    live_trials = fetch_live_trials_from_api(request.model_dump())
    
    if live_trials:
        # Merge/import new trials into db so they can be analyzed by ID later
        current_trials = load_all_trials(db)
        existing_ids = {t["id"] for t in current_trials}
        
        new_imports = []
        for lt in live_trials:
            if lt["id"] not in existing_ids:
                new_imports.append(lt)
                
        if new_imports:
            all_updated = current_trials + new_imports
            try:
                db_service.save_all_trials(db, all_updated)
            except Exception as e:
                print("Failed to auto-save imported live trials to database:", e)
                
        return {"trials": live_trials, "mode": request.mode}

    all_trials = load_all_trials(db)
    
    # If no filters provided, return all
    if request.mode == "clinical":
        filtered = all_trials
        
        # Substring/equality checks
        if request.indication:
            filtered = [t for t in filtered if request.indication.lower() in t["indication"].lower()]
        if request.therapeutic_area:
            filtered = [t for t in filtered if request.therapeutic_area.lower() in t["therapeutic_area"].lower()]
        if request.phase and request.phase != "All":
            filtered = [t for t in filtered if request.phase.lower() in t["phase"].lower()]
        if request.sponsor:
            filtered = [t for t in filtered if request.sponsor.lower() in t["sponsor"].lower()]
        if request.drug_name:
            filtered = [t for t in filtered if request.drug_name.lower() in t["drug_name"].lower()]
        if request.country:
            filtered = [t for t in filtered if any(request.country.lower() in c.lower() for c in t.get("countries", []))]
        if request.status and request.status != "All":
            filtered = [t for t in filtered if request.status.lower() in t["status"].lower()]
        if request.study_design:
            filtered = [t for t in filtered if request.study_design.lower() in t["study_design"].lower()]
        if request.keywords:
            kw = request.keywords.lower()
            filtered = [
                t for t in filtered if (
                    kw in t["title"].lower() or 
                    kw in t["indication"].lower() or 
                    kw in t["drug_name"].lower() or
                    kw in t["sponsor"].lower() or
                    kw in t.get("mechanism_of_action", "").lower()
                )
            ]
            
        return {"trials": filtered, "mode": "clinical"}
        
    else: # Academic mode
        filtered = all_trials
        # Use query mapping
        search_terms = []
        if request.research_topic:
            search_terms.append(request.research_topic.lower())
        if request.thesis_area:
            search_terms.append(request.thesis_area.lower())
        if request.specialty:
            search_terms.append(request.specialty.lower())
        if request.molecule:
            search_terms.append(request.molecule.lower())
        if request.publication_topic:
            search_terms.append(request.publication_topic.lower())
        if request.emerging_area:
            search_terms.append(request.emerging_area.lower())
        if request.research_question:
            search_terms.append(request.research_question.lower())
            
        if search_terms:
            # Match if any term is in Title, Indication, Therapeutic Area, or Drug Name
            matched = []
            for t in filtered:
                text_to_search = (
                    t["title"] + " " + 
                    t["indication"] + " " + 
                    t["therapeutic_area"] + " " + 
                    t["drug_name"] + " " +
                    t.get("mechanism_of_action", "")
                ).lower()
                if any(term in text_to_search for term in search_terms):
                    matched.append(t)
            filtered = matched
            
        return {"trials": filtered, "mode": "academic"}


@router.post("/analyze")
async def analyze_trials(
    request: TrialAnalysisRequest, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Run AI trial search analysis for a given step (metadata, summary, comparison, gaps, etc.)."""
    try:
        result = await run_trial_analysis(
            step=request.step,
            trial_ids=request.selected_trial_ids,
            topic=request.topic,
            db=db
        )
        db_service.log_api_usage(db, current_user.id, "FIND", 4500)
        return {
            "step": request.step,
            "result": result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat")
async def chat_trials_endpoint(
    request: TrialChatRequest, 
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user)
):
    """Chat contextually about the selected clinical trials."""
    try:
        # Reformat history from frontend
        history_list = []
        for msg in request.history:
            history_list.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })
            
        messages = history_list + [{"role": "user", "content": request.message}]
        
        result = await chat_with_trials(messages, request.selected_trial_ids, db=db)
        db_service.log_api_usage(db, current_user.id, "FIND", 2500)
        return {
            "response": result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{trial_id}")
async def delete_trial(trial_id: str, db: Session = Depends(get_db)):
    """Delete a trial from the registry."""
    success = db_service.delete_trial(db, trial_id)
    if not success:
        raise HTTPException(status_code=404, detail="Trial not found")
    return {"status": "success", "message": f"Trial {trial_id} deleted."}
