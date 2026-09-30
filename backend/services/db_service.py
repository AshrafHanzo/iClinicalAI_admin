import json
import os
from datetime import datetime
from sqlalchemy.orm import Session
from database import DocumentDB, TrialDB, UserDB, ApiUsageLogDB

def get_document(db: Session, doc_id: str, user_id: str | None = None) -> dict | None:
    query = db.query(DocumentDB).filter(DocumentDB.id == doc_id)
    if user_id:
        query = query.filter(DocumentDB.user_id == user_id)
    doc = query.first()
    if not doc:
        return None
        
    file_path = doc.file_path
    
    # Read extracted text from disk, fall back to DB column for backward compatibility
    extracted_text = ""
    if os.path.exists(f"{file_path}.extracted.txt"):
        with open(f"{file_path}.extracted.txt", "r", encoding="utf-8") as f:
            extracted_text = f.read()
    else:
        extracted_text = doc.extracted_text
        
    # Read stats from disk, fall back to DB column
    stats = {}
    if os.path.exists(f"{file_path}.stats.json"):
        with open(f"{file_path}.stats.json", "r", encoding="utf-8") as f:
            stats = json.load(f)
    elif doc.stats_json:
        stats = json.loads(doc.stats_json)
        
    # Read analysis results from disk, fall back to DB column
    analysis_results = {}
    if os.path.exists(f"{file_path}.analysis.json"):
        with open(f"{file_path}.analysis.json", "r", encoding="utf-8") as f:
            analysis_results = json.load(f)
    elif doc.analysis_results_json:
        analysis_results = json.loads(doc.analysis_results_json)
        
    return {
        "id": doc.id,
        "filename": doc.filename,
        "safe_filename": doc.safe_filename,
        "file_path": doc.file_path,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "upload_time": doc.upload_time,
        "extracted_text": extracted_text,
        "word_count": doc.word_count,
        "status": doc.status,
        "stats": stats,
        "analysis_results": analysis_results,
        "user_id": doc.user_id
    }

def save_document(db: Session, doc_data: dict, user_id: str | None = None) -> None:
    doc = db.query(DocumentDB).filter(DocumentDB.id == doc_data["id"]).first()
    if not doc:
        doc = DocumentDB(id=doc_data["id"])
        db.add(doc)
    
    if user_id:
        doc.user_id = user_id
    elif "user_id" in doc_data:
        doc.user_id = doc_data["user_id"]
        
    doc.filename = doc_data["filename"]
    doc.safe_filename = doc_data["safe_filename"]
    doc.file_path = doc_data["file_path"]
    doc.file_type = doc_data["file_type"]
    doc.file_size = doc_data["file_size"]
    doc.upload_time = doc_data["upload_time"]
    
    # Save the heavy contents to disk sidecar files
    file_path = doc_data["file_path"]
    
    # Write extracted text to disk
    extracted_text = doc_data.get("extracted_text", "")
    with open(f"{file_path}.extracted.txt", "w", encoding="utf-8") as f:
        f.write(extracted_text)
        
    # Write stats to disk
    stats = doc_data.get("stats", {})
    with open(f"{file_path}.stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
        
    # Write analysis results to disk
    analysis_results = doc_data.get("analysis_results", {})
    with open(f"{file_path}.analysis.json", "w", encoding="utf-8") as f:
        json.dump(analysis_results, f, indent=2)
    
    # Store empty/placeholder values in the database to optimize space and query speeds
    doc.extracted_text = ""
    doc.stats_json = "{}"
    doc.analysis_results_json = "{}"
    
    doc.word_count = doc_data["word_count"]
    doc.status = doc_data["status"]
    
    db.commit()

def list_documents(db: Session, user_id: str | None = None) -> list[dict]:
    query = db.query(DocumentDB)
    if user_id:
        query = query.filter(DocumentDB.user_id == user_id)
    docs = query.all()
    results = []
    for doc in docs:
        file_path = doc.file_path
        
        # Read analysis results from disk, fall back to DB column
        analysis_results = {}
        if os.path.exists(f"{file_path}.analysis.json"):
            with open(f"{file_path}.analysis.json", "r", encoding="utf-8") as f:
                analysis_results = json.load(f)
        elif doc.analysis_results_json:
            analysis_results = json.loads(doc.analysis_results_json)
            
        results.append({
            "id": doc.id,
            "filename": doc.filename,
            "file_type": doc.file_type,
            "file_size": doc.file_size,
            "upload_time": doc.upload_time,
            "word_count": doc.word_count,
            "status": doc.status,
            "analysis_results": analysis_results,
            "user_id": doc.user_id
        })
    return results

def delete_document(db: Session, doc_id: str, user_id: str | None = None) -> bool:
    query = db.query(DocumentDB).filter(DocumentDB.id == doc_id)
    if user_id:
        query = query.filter(DocumentDB.user_id == user_id)
    doc = query.first()
    if not doc:
        return False
        
    # Delete sidecar files from disk
    file_path = doc.file_path
    for suffix in [".extracted.txt", ".stats.json", ".analysis.json"]:
        try:
            if os.path.exists(f"{file_path}{suffix}"):
                os.remove(f"{file_path}{suffix}")
        except Exception:
            pass
            
    db.delete(doc)
    db.commit()
    return True

def load_all_trials(db: Session) -> list[dict]:
    trials = db.query(TrialDB).all()
    # Auto-migration if database is empty
    if not trials:
        import os
        from pathlib import Path
        base_dir = Path(__file__).resolve().parent.parent
        db_path = base_dir / "trials_db.json"
        try:
            if db_path.exists():
                with open(db_path, "r", encoding="utf-8") as f:
                    file_trials = json.load(f)
                    save_all_trials(db, file_trials)
                    return file_trials
        except Exception as e:
            print("Failed to auto-migrate trials from JSON:", e)
        return []
        
    return [json.loads(t.raw_data_json) for t in trials]

def save_all_trials(db: Session, trials: list[dict]) -> None:
    for t in trials:
        trial = db.query(TrialDB).filter(TrialDB.id == t["id"]).first()
        if not trial:
            trial = TrialDB(id=t["id"])
            db.add(trial)
            
        trial.title = t.get("title", "N/A")
        trial.indication = t.get("indication", "N/A")
        trial.therapeutic_area = t.get("therapeutic_area", "N/A")
        trial.phase = t.get("phase", "N/A")
        trial.sponsor = t.get("sponsor", "N/A")
        trial.drug_name = t.get("drug_name", "N/A")
        trial.status = t.get("status", "N/A")
        trial.study_design = t.get("study_design", "N/A")
        trial.mechanism_of_action = t.get("mechanism_of_action", "N/A")
        trial.countries_json = json.dumps(t.get("countries", []))
        trial.raw_data_json = json.dumps(t)
        
    db.commit()

def delete_trial(db: Session, trial_id: str) -> bool:
    trial = db.query(TrialDB).filter(TrialDB.id == trial_id).first()
    if not trial:
        return False
    db.delete(trial)
    db.commit()
    return True

def log_api_usage(db: Session, user_id: str, module: str, tokens: int) -> None:
    try:
        # Increment total token counter for the user
        user = db.query(UserDB).filter(UserDB.id == user_id).first()
        if user:
            user.api_tokens_used = (user.api_tokens_used or 0) + tokens
            
        # Add a detailed daily usage log
        log_entry = ApiUsageLogDB(
            user_id=user_id,
            module=module.upper(),
            tokens=tokens,
            timestamp=datetime.utcnow()
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print("Error logging API usage:", e)
        db.rollback()
