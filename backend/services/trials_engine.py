"""
Trials Engine Service
Handles AI completions for the FIND module (Clinical Trial Search and Academic Research Support).
"""

import json
from services.openai_service import chat_completion, chat_completion_with_history

import os
from pathlib import Path

# Helper to load all trials for context
def load_all_trials(db=None):
    if db:
        import services.db_service as db_service
        return db_service.load_all_trials(db)
    base_dir = Path(__file__).resolve().parent.parent
    db_path = base_dir / "trials_db.json"
    try:
        with open(db_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        # Fallback to local workspace root if run outside backend
        try:
            with open("trials_db.json", "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

def get_trials_by_ids(trial_ids: list[str], db=None) -> list[dict]:
    all_trials = load_all_trials(db)
    return [t for t in all_trials if t["id"] in trial_ids]

def build_trials_context(trials: list[dict]) -> str:
    """Format trials list as clean JSON string for GPT context."""
    if not trials:
        return "No clinical trials selected."
    return json.dumps(trials, indent=2)


async def run_trial_analysis(step: str, trial_ids: list[str], topic: str = None, db=None) -> str:
    """
    Core handler to route analysis requests to the appropriate OpenAI prompt.
    """
    trials = get_trials_by_ids(trial_ids, db)
    trials_context = build_trials_context(trials)
    
    system_prompt = "You are iClinicalAI FIND, an advanced clinical trial search and registry intelligence assistant."
    
    if step == "metadata":
        user_msg = (
          "Extract structured trial metadata for the following clinical trials. "
          "Provide a clean markdown table comparing: NCT Number, Study Title, Sponsor, Phase, Indication, Design, Target Enrollment, Countries, and Recruitment Status.\n\n"
          f"Trials Context:\n{trials_context}"
        )
        return await chat_completion(system_prompt, user_msg, temperature=0.2)
        
    elif step == "summary":
        user_msg = (
          "Generate concise trial summaries for the following studies. For each study, include:\n"
          "1. Executive Summary\n"
          "2. Objective & Indication\n"
          "3. Drug & Mechanism of Action\n"
          "4. Inclusions/Exclusions (briefly)\n"
          "5. Primary & Secondary Endpoints\n\n"
          f"Trials Context:\n{trials_context}"
        )
        return await chat_completion(system_prompt, user_msg, temperature=0.3)
        
    elif step == "similar":
        user_msg = (
          "Analyze the following clinical trials and identify similar registered clinical studies or registry search terms. "
          "Explain the key similarities in patient population, mechanism of action, and endpoints.\n\n"
          f"Trials Context:\n{trials_context}"
        )
        return await chat_completion(system_prompt, user_msg, temperature=0.3)
        
    elif step == "comparison":
        user_msg = (
          "Create a comprehensive side-by-side trial comparison table for the following trials. "
          "Structure the markdown table with parameters like: Parameter | Trial A (NCT) | Trial B (NCT)... "
          "Compare: Sponsor, Drug Name, Mechanism of Action, Phase, Study Design, Primary Endpoints, Inclusion/Exclusion limits, and Enrolment Target.\n\n"
          f"Trials Context:\n{trials_context}"
        )
        return await chat_completion(system_prompt, user_msg, temperature=0.2)
        
    elif step == "recruiting":
        user_msg = (
          "Identify and isolate the recruiting or ongoing studies from the list below. "
          "Provide a brief assessment of their recruitment status, target enrollment, geographic footprint, and site selection considerations.\n\n"
          f"Trials Context:\n{trials_context}"
        )
        return await chat_completion(system_prompt, user_msg, temperature=0.3)
        
    elif step == "gaps":
        target = f"topic '{topic}'" if topic else "selected trials"
        user_msg = (
          f"Perform a detailed Clinical Research Gap Analysis based on the {target}. "
          "Identify understudied patient populations (e.g., elderly, pediatrics, comorbidities), therapeutic delivery gaps, "
          "unanswered scientific questions, and areas with limited active trials. Structure it with clear headers and bullet points.\n\n"
          f"Trials Context (if relevant):\n{trials_context}"
        )
        return await chat_completion(system_prompt, user_msg, temperature=0.4)
        
    elif step == "topics":
        target = f"topic '{topic}'" if topic else "selected trials"
        user_msg = (
          f"Provide a Research Topic Discovery report based on the {target}. "
          "Highlight emerging therapeutic trends, novel mechanism patterns, drug development trends, and "
          "potential topics of interest for clinical research. Present as an educational guide.\n\n"
          f"Trials Context (if relevant):\n{trials_context}"
        )
        return await chat_completion(system_prompt, user_msg, temperature=0.4)
        
    elif step == "dissertation":
        target = f"topic '{topic}'" if topic else "selected trials"
        user_msg = (
          f"You are an academic thesis mentor. Generate 3 structured Dissertation & Thesis Topic Suggestions based on the {target}. "
          "For each suggestion, provide:\n"
          "- Proposed Thesis Title\n"
          "- Core Research Question\n"
          "- Specific Objectives\n"
          "- Recommended Study Design (e.g. Observational, Retrospective, Meta-analysis)\n"
          "- Literature Review Structure/Outline\n\n"
          f"Trials Context (if relevant):\n{trials_context}"
        )
        return await chat_completion(system_prompt, user_msg, temperature=0.5)
        
    else:
        raise ValueError(f"Unknown analysis step: {step}")


async def chat_with_trials(messages: list[dict], trial_ids: list[str], db=None) -> str:
    """Chat assistant specifically focused on the retrieved trials."""
    trials = get_trials_by_ids(trial_ids, db)
    trials_context = build_trials_context(trials)
    
    system_prompt = (
        "You are iClinicalAI FIND, an advanced clinical trial research chat assistant. "
        "The user is asking questions about the following retrieved clinical trials:\n\n"
        f"{trials_context}\n\n"
        "Provide evidence-based, scientifically accurate, and helpful answers based on this context. "
        "If you refer to a trial, mention its NCT number or Sponsor. If information is not in the trials, "
        "use your general clinical research knowledge to reply but state that it is general context."
    )
    
    return await chat_completion_with_history(system_prompt, messages, temperature=0.4)


def fetch_live_trials_from_api(filters: dict) -> list:
    import urllib.request
    import urllib.parse
    import json
    
    url = "https://clinicaltrials.gov/api/v2/studies"
    params = {
        "pageSize": 10,
        "format": "json"
    }
    
    query_parts = []
    
    # Clinical filters mapping
    if filters.get("indication"):
        query_parts.append(f'AREA[ConditionSearch]"{filters["indication"]}"')
    if filters.get("sponsor"):
        query_parts.append(f'AREA[SponsorCollaboratorSearch]"{filters["sponsor"]}"')
    if filters.get("drug_name"):
        query_parts.append(f'AREA[InterventionNameSearch]"{filters["drug_name"]}"')
    if filters.get("phase") and filters.get("phase") != "All":
        phase_map = {
            "Phase I": "PHASE1",
            "Phase II": "PHASE2",
            "Phase III": "PHASE3",
            "Phase IV": "PHASE4"
        }
        mapped_phase = phase_map.get(filters["phase"])
        if mapped_phase:
            query_parts.append(f'AREA[Phase]"{mapped_phase}"')
    if filters.get("status") and filters.get("status") != "All":
        status_map = {
            "Recruiting": "RECRUITING",
            "Active, not recruiting": "ACTIVE_NOT_RECRUITING",
            "Completed": "COMPLETED"
        }
        mapped_status = status_map.get(filters["status"])
        if mapped_status:
            query_parts.append(f'AREA[OverallStatus]"{mapped_status}"')
            
    # For general keywords
    if filters.get("keywords"):
        query_parts.append(f'"{filters["keywords"]}"')
        
    # Academic filters mapping (if mode is academic)
    if filters.get("research_topic"):
        query_parts.append(f'"{filters["research_topic"]}"')
    if filters.get("molecule"):
        query_parts.append(f'"{filters["molecule"]}"')
    if filters.get("specialty"):
        query_parts.append(f'"{filters["specialty"]}"')
        
    if query_parts:
        params["query.cond"] = " AND ".join(query_parts)
        
    try:
        query_string = urllib.parse.urlencode(params)
        full_url = f"{url}?{query_string}"
        
        req = urllib.request.Request(
            full_url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode('utf-8'))
            
        studies = data.get("studies", [])
        parsed_studies = []
        
        for item in studies:
            protocol = item.get("protocolSection", {})
            id_info = protocol.get("identificationModule", {})
            status_info = protocol.get("statusModule", {})
            sponsor_info = protocol.get("sponsorCollaboratorsModule", {})
            desc_info = protocol.get("descriptionModule", {})
            design_info = protocol.get("designModule", {})
            conditions = protocol.get("conditionsModule", {}).get("conditions", [])
            
            # Extract interventions
            interventions = protocol.get("armsInterventionsModule", {}).get("interventions", [])
            drug_names = [i.get("name", "") for i in interventions if i.get("type") in ["DRUG", "BIOLOGICAL"]]
            drug_str = ", ".join(drug_names) if drug_names else "N/A"
            
            # Extract locations / countries
            locations = protocol.get("contactsLocationsModule", {}).get("locations", [])
            countries = list(set([loc.get("country", "") for loc in locations if loc.get("country")]))
            if not countries:
                countries = ["N/A"]
                
            nct = id_info.get("nctId", "N/A")
            
            # Map phase list to readable string (e.g. ['PHASE3'] -> 'Phase III')
            phases_list = design_info.get("phases", [])
            phase_ui = "N/A"
            if phases_list:
                phase_ui_map = {
                    "PHASE1": "Phase I",
                    "PHASE2": "Phase II",
                    "PHASE3": "Phase III",
                    "PHASE4": "Phase IV"
                }
                phase_ui = ", ".join([phase_ui_map.get(p, p) for p in phases_list])
            
            # Map status
            status_ui = status_info.get("overallStatus", "UNKNOWN").replace("_", " ").title()
            
            parsed_studies.append({
                "id": nct,
                "nct_number": nct,
                "title": id_info.get("briefTitle", "N/A"),
                "sponsor": sponsor_info.get("leadSponsor", {}).get("name", "N/A"),
                "phase": phase_ui,
                "status": status_ui,
                "indication": ", ".join(conditions) if conditions else "N/A",
                "enrolment_target": str(design_info.get("enrollmentInfo", {}).get("count", "N/A")),
                "study_design": design_info.get("designInfo", {}).get("primaryPurpose", "N/A"),
                "therapeutic_area": conditions[0] if conditions else "N/A",
                "drug_name": drug_str,
                "countries": countries,
                "mechanism_of_action": desc_info.get("briefSummary", "N/A")
            })
            
        return parsed_studies
    except Exception as e:
        print("Live fetch error:", e)
        return []

