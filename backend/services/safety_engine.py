"""
Safety Engine
Pharmacovigilance (PV) and safety analysis orchestration for all 9 workflow steps.
"""

from services.openai_service import chat_completion, chat_completion_with_history

# ─── 9 STEP PROMPT TEMPLATES ──────────────────────────────────────────

# Step 1: Safety Case Review
STEP1_PROMPT = """You are a senior pharmacovigilance specialist. Perform Step 1: Safety Case Review.
Analyze the provided document (patient information, event information, medical history, concomitant medications, laboratory findings, and outcomes).
Generate a professional Safety Case Review Summary structured exactly as follows:

# Safety Case Review Summary

## 1. Patient Profile & Demographics
Summarize patient age, sex, relevant history, and baseline status.

## 2. Suspect Medication Details
List the suspect drug, indication, dose, frequency, and duration of therapy.

## 3. Adverse Event Description & Timeline
Provide a chronological summary of the onset, progression, and severity of the event.

## 4. Supporting Laboratory & Clinical Findings
Summarize key lab values, diagnostic tests, or clinical evidence relevant to the event.

## 5. Case Completeness Assessment
State if any critical patient or event information is missing or unclear.

Be precise, use formal clinical terminology, and do not hallucinate details."""

# Step 2: SAE Narrative Draft Generation
STEP2_PROMPT = """You are an expert drug safety writer. Perform Step 2: SAE Narrative Draft Generation.
Generate a draft safety narrative based on the provided document details, structured exactly as follows:

# Serious Adverse Event (SAE) Narrative Draft

## 1. Patient Context & Indication
Subject ID, demographic details, indication, and relevant medical history.

## 2. Suspect Product Exposure
Suspect drug name, batch/lot (if available), dose, route, therapy start and stop dates.

## 3. Clinical Description of the Event
Detailed chronological narrative of the event onset, clinical symptoms, severity, and interventions.

## 4. De-challenge & Re-challenge Information
Clinical outcomes following dose reduction, interruption, or discontinuation.

## 5. Reporter's & Medical Monitor's Assessment
Causality and seriousness criteria assessment.

Generate a narrative suitable for a CIOMS I / MedWatch 3500A Form block."""

# Step 3: Safety Case Summary Generation
STEP3_PROMPT = """You are a pharmacovigilance safety reporter. Perform Step 3: Safety Case Summary Generation.
Provide a concise summary highlighting:
- Suspected Adverse Drug Reactions (ADRs)
- Seriousness criteria met
- Overall clinical outcomes

Structure the report exactly as follows:

# Safety Case Summary

## 1. Safety Event Classification
Identify suspected AEs, Serious AEs, and Suspected Unexpected Serious Adverse Reactions (SUSARs).

## 2. Outcome of the Event
Detail whether the events are resolved, resolving, ongoing, fatal, or recovered with sequelae.

## 3. Core Safety Takeaways
A brief, high-level executive summary of the safety incident."""

# Step 4: Seriousness & Causality Checklist
STEP4_PROMPT = """You are a medical monitor. Perform Step 4: Seriousness & Causality Assessment Checklist.
Evaluate the document for seriousness criteria and drug causality.

First, output the summary table EXACTLY in this format:

| Parameter | Criteria Met / Assessment |
| :--- | :--- |
| Death | [Yes / No / Unknown] |
| Life Threatening | [Yes / No / Unknown] |
| Hospitalization | [Yes / No / Unknown] |
| Disability / Incapacity | [Yes / No / Unknown] |
| Congenital Anomaly | [Yes / No / Unknown] |
| Medically Important Event | [Yes / No / Unknown] |
| Causality Assessment | [Related / Possibly Related / Unlikely Related / Not Related] |

Then, provide the detailed breakdown:

## 1. Seriousness Criteria Analysis
Explain which seriousness criteria are met and the medical justification.

## 2. Causality Rationale
Provide clinical reasoning for the causality assessment (e.g., temporal relationship, alternative explanations)."""

# Step 5: MedDRA Coding Review Support
STEP5_PROMPT = """You are a certified safety coding specialist. Perform Step 5: MedDRA Coding Review Support.
Analyze the adverse events in the document and match them to potential MedDRA (Medical Dictionary for Regulatory Activities) terms.

Structure the output exactly as follows:

# MedDRA Coding Review Notes

## 1. Verbatim Terms to Preferred Terms (PT) Map
Map verbatim terms from the text to their corresponding MedDRA Preferred Terms and System Organ Classes (SOC).

## 2. System Organ Class (SOC) Distribution
List the affected System Organ Classes.

## 3. Coding Consistency & Recommendations
Identify any inconsistent terminology or recommended updates for compliance."""

# Step 6: Aggregate Safety Summary
STEP6_PROMPT = """You are a safety physician. Perform Step 6: Aggregate Safety Summary.
Analyze the safety data and adverse event frequencies in the document.

Structure the report exactly as follows:

# Aggregate Safety Summary Report

## 1. Overall Adverse Event Distribution
Total number of AEs and SAEs identified in the text.

## 2. System Organ Class (SOC) Frequency Table
List the frequencies of events across different SOCs.

## 3. Risk-Benefit Implications
Summarize whether these findings impact the overall safety profile of the investigational product."""

# Step 7: Safety Trend Analysis
STEP7_PROMPT = """You are a safety statistician. Perform Step 7: Safety Trend Analysis.
Scan the text to identify potential emerging safety patterns, event clusters, or site-specific issues.

Structure the report exactly as follows:

# Safety Trend Dashboard Summary

## 1. Frequently Reported Adverse Events
Highlight the most common safety events.

## 2. Emerging Safety Patterns & Clusters
Identify any unexpected timing, cumulative toxicities, or drug-drug interaction trends.

## 3. Site-Level and Demographic Trends
Note if certain sites or patient demographics show higher event rates."""

# Step 8: Medical Review Note Generation
STEP8_PROMPT = """You are a medical reviewer. Perform Step 8: Medical Review Note Generation.
Draft a professional medical review note summarizing the clinical safety case.

Structure the note exactly as follows:

# Medical Review Note

## 1. Clinical Interpretation
Analyze the medical complexity of the safety events, including confounding factors like medical history and concomitant drugs.

## 2. Safety Review Comments & Queries
List questions or clarification queries for the clinical investigator site.

## 3. Follow-up Recommendations
Detail recommendations for patient follow-up, dose adjustment, or protocol amendment."""

# Step 9: Signal Detection & Review Support
STEP9_PROMPT = """You are a pharmacovigilance signal detection lead. Perform Step 9: Signal Detection & Review Support.
Analyze the text to detect potential safety signals, event clusters, or areas requiring safety monitoring.

Structure the report exactly as follows:

# Signal Review Summary

## 1. Potential Safety Signals
Identify potential new safety signals that require further formal validation.

## 2. Unexpected Event Patterns
List events that have a higher severity or frequency than anticipated.

## 3. Recommended Signal Action Plan
State next steps (e.g., monitor via future DSURs, update Investigator Brochure, recommend protocol changes)."""


# Chat System Prompt
CHAT_SYSTEM_PROMPT = """You are an expert clinical safety and pharmacovigilance specialist.
You have been provided with a clinical document's content. Answer safety-related, toxicology, laboratory, and adverse event monitoring questions about this protocol or case report.

Rules:
1. ONLY answer based on information present in the document
2. If information is not in the document, clearly state "This safety information is not explicitly documented in the protocol"
3. Use formal medical and clinical terminology (MedDRA, CTCAE)
4. Highlight risks, safety parameters, or lab tests when asked
5. Focus heavily on patient safety and protocol compliance

Document content is provided below.

DOCUMENT CONTENT:
{document_text}"""


# ─── SAFETY FUNCTIONS ────────────────────────────────────────────────

async def run_safety_step(step_num: int, text: str) -> str:
    """Run a specific safety analysis step (1-9) using the corresponding prompt template."""
    truncated = text[:50000] if len(text) > 50000 else text
    
    prompts = {
        1: STEP1_PROMPT,
        2: STEP2_PROMPT,
        3: STEP3_PROMPT,
        4: STEP4_PROMPT,
        5: STEP5_PROMPT,
        6: STEP6_PROMPT,
        7: STEP7_PROMPT,
        8: STEP8_PROMPT,
        9: STEP9_PROMPT
    }
    
    prompt = prompts.get(step_num)
    if not prompt:
        raise ValueError(f"Invalid safety step number: {step_num}")
        
    user_msgs = {
        1: "Perform a Safety Case Review on the following text:\n\n",
        2: "Generate an SAE Narrative Draft based on the following text:\n\n",
        3: "Generate a Safety Case Summary based on the following text:\n\n",
        4: "Generate a Seriousness & Causality Assessment Checklist based on the following text:\n\n",
        5: "Generate MedDRA Coding Review Notes based on the following text:\n\n",
        6: "Generate an Aggregate Safety Summary based on the following text:\n\n",
        7: "Perform a Safety Trend Analysis on the following text:\n\n",
        8: "Generate a Medical Review Note based on the following text:\n\n",
        9: "Perform a Signal Detection & Review Support analysis on the following text:\n\n",
    }
    
    return await chat_completion(
        system_prompt=prompt,
        user_message=f"{user_msgs[step_num]}{truncated}"
    )


async def chat_with_safety(text: str, messages: list[dict]) -> str:
    """Chat focused specifically on safety aspects of the protocol."""
    truncated = text[:50000] if len(text) > 50000 else text
    system_prompt = CHAT_SYSTEM_PROMPT.format(document_text=truncated)
    return await chat_completion_with_history(
        system_prompt=system_prompt,
        messages=messages,
    )


# ─── INTERACTIVE CAUSALITY & NARRATIVE (ADD-ON HELPER ENGINES) ──────────

async def generate_medwatch_narrative(event_details: str, protocol_text: str = None) -> str:
    """Generate a formal safety narrative based on raw event details and protocol context."""
    from services.safety_engine import STEP2_PROMPT
    user_msg = f"EVENT DETAILS:\n{event_details}"
    if protocol_text:
        truncated_proto = protocol_text[:20000]
        user_msg += f"\n\nPROTOCOL CONTEXT:\n{truncated_proto}"
        
    return await chat_completion(
        system_prompt=STEP2_PROMPT,
        user_message=user_msg,
    )


async def assess_causality(naranjo_responses: dict, clinical_context: str = "") -> dict:
    """Assess causality of an Adverse Event using Naranjo Algorithm and write a clinical analysis."""
    score = 0
    for q_id, val in naranjo_responses.items():
        try:
            score += int(val)
        except (ValueError, TypeError):
            pass
            
    if score >= 9:
        causality = "Definite"
        color = "🔴"
    elif 5 <= score <= 8:
        causality = "Probable"
        color = "🟡"
    elif 1 <= score <= 4:
        causality = "Possible"
        color = "🔵"
    else:
        causality = "Doubtful"
        color = "🟢"
        
    prompt = """You are a senior medical monitor reviewing a Naranjo Causality Assessment.
Explain the clinical meaning of this score, highlight the key factors driving the causality rating, and state any immediate recommendations for the trial (e.g., report to IRB/FDA, consult Investigator Brochure, update Informed Consent)."""
    
    user_msg = f"Naranjo Algorithm Score: {score}/13 (Causality: {causality}).\nClinical Context/Event description: {clinical_context}"
    
    explanation = await chat_completion(
        system_prompt=prompt,
        user_message=user_msg,
        temperature=0.4
    )
    
    return {
        "score": score,
        "causality": causality,
        "color": color,
        "explanation": explanation
    }
