"""
Analysis Engine
Clinical research prompt templates and analysis orchestration.
"""

from services.openai_service import chat_completion, chat_completion_with_history

# ─── PROMPT TEMPLATES ────────────────────────────────────────────────

SUMMARIZE_PROMPT = """You are an expert clinical research consultant. Your task is to generate a professional Protocol Summary.
Analyze the provided document and produce a summary structured EXACTLY as follows:

# Protocol Summary

## 1. Executive Summary
Provide a high-level overview of the trial, its purpose, and significance.

## 2. Indication
Specify the therapeutic area, disease state, or condition under study.

## 3. Study Objective
Clearly define the primary and secondary objectives.

## 4. Population
Define the target patient population (age, condition severity, sample size).

## 5. Design
Describe the trial design (e.g., Phase, Randomized, Double-Blind, Parallel Group).

## 6. Endpoints
List the primary and secondary endpoints.

Be extremely precise, use formal clinical terminology, and do not fabricate details not present in the text."""

EXTRACT_PROMPT = """You are an expert clinical data extraction specialist. Perform Step 1: Protocol Parsing.
Extract the following elements from the document and format them into structured clinical metadata:

# Protocol Parsing & Structured Metadata

## 1. Study Title
Full title of the clinical trial.

## 2. Objectives
Primary, secondary, and exploratory objectives.

## 3. Endpoints
Primary, secondary, and exploratory endpoints.

## 4. Inclusion Criteria
Detailed list of requirements for patient inclusion.

## 5. Exclusion Criteria
Detailed list of criteria for patient exclusion.

## 6. Study Design
Trial phase, blinding, randomization, control type, and masking.

## 7. Treatment Arms
Dosing, schedule, and description of treatment groups/cohorts.

## 8. Visit Schedule
Frequency of visits, assessments per visit, and total study duration.

Ensure everything is extracted directly from the text without hallucination."""

ELIGIBILITY_PROMPT = """You are a senior medical director and clinical operations reviewer. Perform Step 3: Eligibility Criteria Review.
Critically review the inclusion and exclusion criteria in the document to identify recruitment barriers and operational risks.

Structure your review as follows:

# Eligibility Criteria Review

## 1. Inclusion Criteria Assessment
- **Restricted Criteria**: Identify any criteria that are overly restrictive.
- **Missing Criteria**: Highlight standard inclusion criteria that should be present but are missing.

## 2. Exclusion Criteria Assessment
- **Excessive Exclusions**: Identify criteria that unnecessarily exclude patients.
- **Operational Challenges**: Highlight criteria that will make site screening difficult.

## 3. Optimization Recommendations
Provide concrete suggestions to optimize eligibility.
*Example: "Patients aged >75 years are excluded. Consider assessing whether this restriction may affect recruitment feasibility."*

Ensure your review is realistic, operationally focused, and supports patient recruitment feasibility."""

GAP_ANALYSIS_PROMPT = """You are a regulatory affairs and clinical quality assurance director. Perform Step 4: Gap Analysis.
Analyze the clinical document to identify missing sections, content quality issues, or regulatory compliance gaps. Ensure you reference relevant regulatory guidelines (such as ICH E6(R3) Good Clinical Practice, ICH E8 General Considerations for Clinical Studies, and standard FDA/EMA Protocol Guidance) where gaps or compliance considerations arise.

Structure your report as follows:

# Gap Analysis Report

## 1. Missing Core Sections
Identify standard protocol sections that are absent or poorly defined. Specifically check for:
- Missing Safety Endpoint
- Missing Statistical Considerations
- Missing Risk Mitigation Plan
- Missing Recruitment Strategy

## 2. Severity-Rated Findings & Regulatory Compliance
For each identified gap, use the following format:
- **Gap**: [Name/Description of gap]
- **Severity**: 🔴 Critical | 🟡 Major | 🟢 Minor
- **Regulatory Reference**: [e.g., ICH E6(R3) Section 6.4, FDA Guidance, or EMA Guidance]
- **Recommendation**: [How to resolve this gap]
- **Operational Impact**: [What happens if left unresolved]

Only report genuine protocol gaps and scientific omissions."""

FEASIBILITY_PROMPT = """You are a clinical trial feasibility director. Perform Step 5: Feasibility Checklist.
Generate a feasibility assessment checklist for this trial.

First, output the summary table EXACTLY in this format:

| Category | Status |
| :--- | :--- |
| Recruitment | [Status: High Risk / Medium Risk / Good] |
| Site Availability | [Status: Good / Limited / High Risk] |
| Eligibility Complexity | [Status: High / Moderate / Low] |
| Timeline Feasibility | [Status: Moderate / Realistic / Aggressive] |

Then, provide the detailed breakdown:

## 1. Patient Population Feasibility
Analyze target population size, screening complexity, and screen failure rate.

## 2. Site Capability Requirements
Highlight infrastructure, lab processing, and investigator training needs.

## 3. Regulatory Considerations
Ethical approvals, country-specific pathways, and timeline impacts.

## 4. Operational Complexity
Assess visit frequency, number of assessments, and patient burden.

## 5. Timeline Feasibility
Evaluate the realism of enrollment, treatment duration, and follow-up timelines.

## 6. Budget Considerations
Key cost drivers, third-party lab services, and financial risk mitigation.

Conclude with an overall Feasibility Score (High/Medium/Low) and a brief justification."""

RECOMMENDATIONS_PROMPT = """You are a clinical design strategist. Perform Step 6: Study Design Recommendations.
Suggest optimizations and clinical design strategies to improve the study. Incorporate modern regulatory compliance frameworks, referencing FDA Guidance on Adaptive Clinical Trials, ICH E8(R1) guidelines, and EMA policies where appropriate.

Structure your recommendations as follows:

# Study Design Recommendations & Trial Benchmark

## 1. Adaptive Design Suggestions
Propose potential adaptive pathways (e.g., sample size re-estimation, early efficacy/futility stops) if applicable, aligning with FDA Guidance for Adaptive Designs.

## 2. Randomization & Blinding Strategy
Review current randomization/blinding and suggest enhancements in alignment with ICH E9 principles.

## 3. Endpoint Improvements
Suggest refinements to primary or secondary endpoints to increase scientific validity.

## 4. Eligibility Optimization
Provide concrete ideas to expand patient access and speed up recruitment.

## 5. Similar Trial Benchmark Report & Regulatory References
Outline benchmarking tips from similar trials and highlight any relevant ICH E6(R3) or FDA/EMA regulatory guidelines that designers should follow.

Focus on practical, actionable study design optimizations."""

CHAT_SYSTEM_PROMPT = """You are an expert clinical research AI assistant for the iClinicalAi platform. 
You have been provided with a clinical document's content. Answer questions about this document 
accurately and thoroughly.

Rules:
1. ONLY answer based on information present in the document
2. If information is not in the document, clearly state "This information is not available in the uploaded document"
3. Use proper clinical terminology
4. Be precise and evidence-based in your responses
5. When quoting from the document, use exact text where possible
6. Provide context for your answers when helpful
7. If asked to compare or analyze, provide structured responses

Document content is provided below. Use it to answer all questions.

DOCUMENT CONTENT:
{document_text}"""


# ─── ANALYSIS FUNCTIONS ──────────────────────────────────────────────

async def summarize_document(text: str) -> str:
    """Generate a comprehensive summary of the clinical document."""
    truncated = text[:50000] if len(text) > 50000 else text
    return await chat_completion(
        system_prompt=SUMMARIZE_PROMPT,
        user_message=f"Please analyze and summarize the following clinical document:\n\n{truncated}",
    )


async def extract_key_info(text: str) -> str:
    """Extract structured key information from the document."""
    truncated = text[:50000] if len(text) > 50000 else text
    return await chat_completion(
        system_prompt=EXTRACT_PROMPT,
        user_message=f"Extract all key information from the following clinical document:\n\n{truncated}",
    )


async def review_eligibility(text: str) -> str:
    """Perform eligibility criteria review on the document."""
    truncated = text[:50000] if len(text) > 50000 else text
    return await chat_completion(
        system_prompt=ELIGIBILITY_PROMPT,
        user_message=f"Perform an eligibility criteria review on the following clinical document:\n\n{truncated}",
    )


async def analyze_gaps(text: str) -> str:
    """Perform gap analysis on the document."""
    truncated = text[:50000] if len(text) > 50000 else text
    return await chat_completion(
        system_prompt=GAP_ANALYSIS_PROMPT,
        user_message=f"Perform a gap analysis on the following clinical document:\n\n{truncated}",
    )


async def generate_feasibility(text: str) -> str:
    """Generate a feasibility assessment checklist."""
    truncated = text[:50000] if len(text) > 50000 else text
    return await chat_completion(
        system_prompt=FEASIBILITY_PROMPT,
        user_message=f"Generate a feasibility assessment for the following clinical document:\n\n{truncated}",
    )


async def generate_recommendations(text: str) -> str:
    """Generate study design recommendations and trial benchmark."""
    truncated = text[:50000] if len(text) > 50000 else text
    return await chat_completion(
        system_prompt=RECOMMENDATIONS_PROMPT,
        user_message=f"Generate study design recommendations and benchmark notes for the following clinical document:\n\n{truncated}",
    )


async def full_analysis(text: str) -> dict:
    """Run all analysis types on the document in parallel."""
    import asyncio
    (
        summary,
        extraction,
        eligibility,
        gaps,
        feasibility,
        recommendations
    ) = await asyncio.gather(
        summarize_document(text),
        extract_key_info(text),
        review_eligibility(text),
        analyze_gaps(text),
        generate_feasibility(text),
        generate_recommendations(text)
    )

    return {
        "summary": summary,
        "key_information": extraction,
        "eligibility_review": eligibility,
        "gap_analysis": gaps,
        "feasibility_checklist": feasibility,
        "design_recommendations": recommendations,
    }


async def chat_with_document(text: str, messages: list[dict]) -> str:
    """Chat with the document - answer questions based on document content."""
    truncated = text[:50000] if len(text) > 50000 else text
    system_prompt = CHAT_SYSTEM_PROMPT.format(document_text=truncated)
    return await chat_completion_with_history(
        system_prompt=system_prompt,
        messages=messages,
    )


async def generate_executive_dashboard(text: str) -> dict:
    """Generate executive dashboard parameters and scores from the protocol."""
    truncated = text[:40000] if len(text) > 40000 else text
    prompt = """You are a senior clinical trials design analyst.
Analyze the clinical protocol text and extract key metadata and design quality health scores.
You must return a JSON object with EXACTLY the following keys:
{
  "phase": "Study Phase",
  "therapeutic_area": "Therapeutic Area",
  "study_design": "Study Design",
  "enrollment_target": "Enrollment Target",
  "sites_count": "Number of Sites",
  "countries": "Countries involved",
  "duration": "Study Duration",
  "quality_score": 80,
  "feasibility_score": 75,
  "recruitment_score": 60,
  "readiness_score": 82
}
Return ONLY the raw JSON object. Do not include markdown code block syntax (like ```json) or backticks."""
    try:
        raw_res = await chat_completion(
            system_prompt=prompt,
            user_message=f"Analyze this clinical protocol:\n\n{truncated}",
        )
        import json
        clean_res = raw_res.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(clean_res)
    except Exception as e:
        print("Dashboard generation failed:", e)
        return {
            "phase": "N/A",
            "therapeutic_area": "N/A",
            "study_design": "N/A",
            "enrollment_target": "N/A",
            "sites_count": "N/A",
            "countries": "N/A",
            "duration": "N/A",
            "quality_score": 0,
            "feasibility_score": 0,
            "recruitment_score": 0,
            "readiness_score": 0
        }
