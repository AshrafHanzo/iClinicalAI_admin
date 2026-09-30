"""
Manage Engine
Contains AI prompts and validation logic for clinical data management tasks.
"""

import csv
import io
import re
from datetime import datetime
from typing import Dict, Any, List

from services.openai_service import chat_completion

# ─── PROMPT TEMPLATES ────────────────────────────────────────────────

CRF_REVIEW_PROMPT = """You are an expert Clinical Data Manager (CDM). Your task is to perform Step 1: CRF Review Support.
Analyze the provided Study Protocol text and identify CRF design gaps, including:
1. Missing essential data fields that should be collected based on protocol requirements (e.g., collecting medication start date but not end date, missing pregnancy checks for childbearing age, etc.).
2. Inconsistent field definitions across visits or forms.
3. Duplicate data collection (e.g., collecting the same vital sign parameters in two separate CRF forms unnecessarily).
4. Alignment gaps between the Protocol objectives and the proposed CRF collection.

Structure your analysis as a formal report:
# CRF Review & Gap Analysis Report

## 1. Critical Missing Fields
[List specific fields missing from the data collection structure, with rationale]

## 2. Inconsistencies & Redundancies
[Identify fields defined inconsistently or collected in duplicate]

## 3. Protocol Alignment Issues
[List discrepancies where the protocol dictates a procedure/endpoint but the CRF does not capture it]

## 4. Recommendations for eCRF Design
[Actionable modifications to finalize the CRF specifications]"""


EDIT_CHECK_PROMPT = """You are a Lead Clinical Database Programmer. Your task is to perform Step 2: Edit Check Suggestion.
Review the Protocol context and generate suggested edit checks (logical rules to prevent dirty data in the EDC).
For each suggested edit check, provide:
1. Edit Check ID (e.g., EC-001)
2. Target Form/Field (e.g., Vitals - Systolic BP)
3. Logical Condition (e.g., IF BP_SYS < 90 OR BP_SYS > 180)
4. Query Action (e.g., THEN Generate Query: "Please verify Systolic Blood Pressure as it falls outside the normal range of 90-180 mmHg.")
5. Validation Type (e.g., Range check, Date sequence, Cross-form validation)

Structure your output as a markdown table with these headers, followed by brief guidance on implementation priority."""


QUERY_WORDING_PROMPT = """You are a Clinical Data Reviewer. Your task is to perform Step 3: Data Query Wording Assistance.
The user will provide a raw, informal observation or note (e.g., "date wrong", "value high").
Rephrase this observation into three different levels of professional, GCP-compliant queries ready to be issued in the EDC:
1. Standard Query: Direct, professional, and clear.
2. Contextual Query: References protocol/GCP guidelines specifically.
3. Polite Clarification: A softer approach for complex cases.

Ensure the tone is non-prescriptive, objective, and does not suggest the actual answer to the site.

User Input: "{user_input}"
Protocol Context:
{protocol_context}

Output format:
# Data Clarification Query Suggestions
**Raw Note:** "{user_input}"

### 1. Standard Query
*Wording:* ...

### 2. Contextual Query
*Wording:* ...

### 3. Polite Clarification
*Wording:* ..."""


CLEANING_CHECKLIST_PROMPT = """You are a Senior Clinical Data Manager. Your task is to perform Step 4: Data Cleaning Checklist.
Generate a comprehensive, study-specific Data Cleaning Checklist.
Organize the checklist into these categories:
1. Demographic & Eligibility Verification
2. Date Sequencing (Informed Consent, Randomization, Visits, Treatment Start/Stop, Discontinuation)
3. Laboratory & Vital Signs (Outliers, Reference Ranges, Repeat tests)
4. Adverse Events (AE terms, seriousness, severity, relationship, matching with ConMeds)
5. Concomitant Medications (Indication check, start/stop date consistency)
6. Protocol Deviations (Missed visits, prohibited meds)

For each checklist item, provide a check description and the target timeline (e.g., Ongoing, prior to DBL).
Format the response clearly using markdown check-boxes."""


MEDICAL_CODING_PROMPT = """You are a Medical Coding Specialist. Your task is to perform Step 5: Medical Coding Review Notes.
Review the adverse event terms, medical histories, or medication names. Identify terms that:
1. Require clarification because they are vague or uncoded (e.g., "Head pain" vs "Headache").
2. Are misspelled or contain multiple diagnoses in a single term.
3. Are inconsistent with their coded MedDRA (System Organ Class / Preferred Term) or WHODrug classifications.

Structure your output into:
# Medical Coding Review Notes

## 1. Vague or Ambiguous Terms
[Identify terms requiring investigator clarification before coding]

## 2. Inconsistent Classifications
[Spot mismatch between terms and standard MedDRA/WHODrug classes]

## 3. Splitting/Merging Recommendations
[Identify compound terms like 'nausea and vomiting' that need splitting]"""


TREND_ANALYSIS_PROMPT = """You are a Clinical Operations Analyst. Your task is to perform Step 6: Query Trend Analysis.
Analyze study metrics, site performance, and query lists. Identify:
1. Outlier sites (e.g., sites with high query volumes, slow response times).
2. Recurring query types (e.g., recurring lab errors, missing diaries).
3. Data entry lag trends.

Generate a summary of operational observations:
# Query Trends & Site Performance Report

## 1. Key Performance Observations
[Summarize top bottlenecks and site behaviors]

## 2. Outlier Site Profiles
[Identify sites requiring retraining or remote monitoring support]

## 3. High-Frequency Errors
[Categorize the most common edit check triggers and suggest preventative actions]"""


REVIEW_SUMMARY_PROMPT = """You are a Clinical Data Management Director. Your task is to perform Step 7: Data Review Summary.
Compile all data review observations, audit findings, and checklists into a high-level Data Review Executive Summary.
Structure the summary exactly as follows:
# CDM Data Review Executive Summary

## 1. Study Status & Data Integrity Score
State the estimated overall data cleanliness and readiness (e.g., 92% DBL-Ready).

## 2. Key Data Quality Findings
Summarize the critical issues (outliers, logic breaks, missing key safety data).

## 3. Site Performance & Compliance Risks
Detail sites with high backlogs or query counts.

## 4. Recommended Action Plan
Provide list of immediate priorities to resolve before lock.

Context:
{context}"""


# ─── CORE ORCHESTRATOR ───────────────────────────────────────────────

async def run_manage_analysis(step: str, document_text: str, extra_input: str = None) -> str:
    """Orchestrates AI prompts based on the selected MANAGE step."""
    if step == "crf_review":
        system_prompt = CRF_REVIEW_PROMPT
        user_msg = f"Here is the study protocol/document:\n\n{document_text[:50000]}"
        return await chat_completion(system_prompt, user_msg, temperature=0.3)
        
    elif step == "edit_checks":
        system_prompt = EDIT_CHECK_PROMPT
        user_msg = f"Here is the study protocol/document:\n\n{document_text[:50000]}"
        return await chat_completion(system_prompt, user_msg, temperature=0.3)
        
    elif step == "query_wording":
        raw_input = extra_input if extra_input else "value out of range"
        system_prompt = QUERY_WORDING_PROMPT.format(user_input=raw_input, protocol_context=document_text[:15000])
        return await chat_completion(system_prompt, "Please formulate the queries.", temperature=0.5)
        
    elif step == "cleaning_checklist":
        system_prompt = CLEANING_CHECKLIST_PROMPT
        user_msg = f"Here is the study protocol/document:\n\n{document_text[:50000]}"
        return await chat_completion(system_prompt, user_msg, temperature=0.3)
        
    elif step == "medical_coding":
        system_prompt = MEDICAL_CODING_PROMPT
        user_msg = f"Analyze these terms in relation to this study context:\n\n{document_text[:30000]}"
        if extra_input:
            user_msg += f"\n\nListing Data:\n{extra_input}"
        return await chat_completion(system_prompt, user_msg, temperature=0.4)
        
    elif step == "trend_analysis" or step == "dataset_review":
        system_prompt = TREND_ANALYSIS_PROMPT
        user_msg = f"Review the query trends for this study:\n\n{document_text[:30000]}"
        if extra_input:
            user_msg += f"\n\nQuery Registry / Metrics:\n{extra_input}"
        return await chat_completion(system_prompt, user_msg, temperature=0.3)
        
    elif step == "review_summary":
        system_prompt = REVIEW_SUMMARY_PROMPT
        context = f"Protocol Outline:\n{document_text[:20000]}"
        if extra_input:
            context += f"\n\nAudit Findings / Datasets summary:\n{extra_input}"
        user_msg = "Please generate the Executive Summary report."
        return await chat_completion(system_prompt, user_msg, temperature=0.4)
        
    else:
        raise ValueError(f"Unknown data management step: {step}")


# ─── PROGRAMMATIC DATASET AUDITOR ───────────────────────────────────

def audit_dataset_file(file_content: str, filename: str) -> Dict[str, Any]:
    """
    Parses a CSV dataset string and audits it programmatically.
    Checks for:
      - Missing values
      - Invalid/Out-of-order dates
      - Numeric range outliers (e.g., Age)
      - Identical duplicate records
      - Key clinical field logic gaps
    """
    issues = []
    summary = {
        "filename": filename,
        "total_rows": 0,
        "total_cols": 0,
        "total_issues": 0,
        "missing_count": 0,
        "outlier_count": 0,
        "date_logic_count": 0,
        "duplicate_count": 0
    }
    
    try:
        # Read file rows
        f = io.StringIO(file_content.strip())
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return {"error": "CSV file is empty or invalid"}
            
        summary["total_cols"] = len(header)
        
        # Clean header keys for comparison
        clean_headers = [h.strip().upper() for h in header]
        
        rows = []
        for r in reader:
            if any(r): # Skip empty rows
                rows.append(r)
        
        summary["total_rows"] = len(rows)
        
        # 1. Check for duplicates
        seen_rows = set()
        for idx, r in enumerate(rows, start=2): # 1-indexed header is row 1
            row_tuple = tuple(r)
            if row_tuple in seen_rows:
                issues.append({
                    "row": idx,
                    "field": "ALL",
                    "type": "Duplicate Record",
                    "description": "This row is an exact duplicate of a previous record.",
                    "severity": "Medium"
                })
                summary["duplicate_count"] += 1
            else:
                seen_rows.add(row_tuple)

        # Helper: Find columns
        def find_col_idx(names: List[str]) -> int:
            for n in names:
                if n in clean_headers:
                    return clean_headers.index(n)
            return -1

        # Locate key columns
        age_col = find_col_idx(["AGE", "SUBJECT_AGE", "PATIENT_AGE"])
        sex_col = find_col_idx(["SEX", "GENDER", "PATIENT_SEX"])
        sub_col = find_col_idx(["SUBJECT", "SUBJECT_ID", "SUBJID", "USUBJID"])
        visit_col = find_col_idx(["VISIT", "VISIT_NAME", "VISITNUM"])
        
        # Date columns
        start_date_col = find_col_idx(["START_DATE", "VISIT_DATE", "VISIT_DT", "AESTDTC", "MHSTDTC", "CMSTDTC"])
        end_date_col = find_col_idx(["END_DATE", "AEENDTC", "MHENDTC", "CMENDTC"])
        
        # 2. Iterate cells to audit
        for idx, r in enumerate(rows, start=2):
            # Pad row if columns don't match header length
            while len(r) < len(header):
                r.append("")
                
            # A. Check missing values
            for col_idx, val in enumerate(r):
                val_clean = val.strip()
                if val_clean == "":
                    field_name = header[col_idx]
                    # Check if it's a key identifier field
                    is_key = col_idx in [sub_col, visit_col, start_date_col]
                    issues.append({
                        "row": idx,
                        "field": field_name,
                        "type": "Missing Value",
                        "description": f"Field '{field_name}' is empty." + (" (Key study parameter)" if is_key else ""),
                        "severity": "High" if is_key else "Low"
                    })
                    summary["missing_count"] += 1
            
            # B. Check Age Outliers
            if age_col != -1 and age_col < len(r):
                age_val = r[age_col].strip()
                if age_val:
                    try:
                        # Extract digit
                        age_num = float(re.findall(r"[-+]?\d*\.\d+|\d+", age_val)[0])
                        if age_num < 0 or age_num > 110:
                            issues.append({
                                "row": idx,
                                "field": header[age_col],
                                "type": "Outlier Detection",
                                "description": f"Abnormal age detected: {age_val} years.",
                                "severity": "High"
                            })
                            summary["outlier_count"] += 1
                    except (ValueError, IndexError):
                        pass # Ignore non-numeric formats for outliers (already flagged as missing/formatting)

            # C. Check Date Sequences
            s_dt = None
            e_dt = None
            
            if start_date_col != -1 and start_date_col < len(r):
                date_str = r[start_date_col].strip()
                if date_str:
                    s_dt = parse_date_flexible(date_str)
                    if not s_dt:
                        issues.append({
                            "row": idx,
                            "field": header[start_date_col],
                            "type": "Invalid Format",
                            "description": f"Date value '{date_str}' does not match standard clinical formats (YYYY-MM-DD or DD-MMM-YYYY).",
                            "severity": "Medium"
                        })
                        summary["date_logic_count"] += 1
            
            if end_date_col != -1 and end_date_col < len(r):
                date_str = r[end_date_col].strip()
                if date_str:
                    # Ignore active ongoing flags (e.g. ONGOING, ACTIVE)
                    if date_str.upper() not in ["ONGOING", "ACTIVE", "PRESENT"]:
                        e_dt = parse_date_flexible(date_str)
                        if not e_dt:
                            issues.append({
                                "row": idx,
                                "field": header[end_date_col],
                                "type": "Invalid Format",
                                "description": f"Date value '{date_str}' does not match standard format.",
                                "severity": "Medium"
                            })
                            summary["date_logic_count"] += 1

            # Check logic: End Date < Start Date
            if s_dt and e_dt and e_dt < s_dt:
                issues.append({
                    "row": idx,
                    "field": f"{header[start_date_col]} / {header[end_date_col]}",
                    "type": "Date Logic Inconsistency",
                    "description": f"End date ({r[end_date_col]}) is recorded earlier than the start date ({r[start_date_col]}).",
                    "severity": "High"
                })
                summary["date_logic_count"] += 1
                
        summary["total_issues"] = len(issues)
        return {"summary": summary, "issues": issues[:150]} # Cap issues report at 150 items
        
    except Exception as e:
        return {"error": f"Failed to parse CSV: {str(e)}"}

def parse_date_flexible(date_str: str) -> datetime | None:
    """Try parsing date using common clinical study formats."""
    formats = [
        "%Y-%m-%d", "%Y/%m/%d", 
        "%d-%b-%Y", "%d/%b/%Y",
        "%d-%m-%Y", "%d/%m/%Y",
        "%m-%d-%Y", "%m/%d/%Y"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None
