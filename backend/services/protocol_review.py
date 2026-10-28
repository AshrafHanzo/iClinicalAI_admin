"""
Protocol Review
Evaluates a protocol version for completeness, consistency, clarity and quality:
Check -> Identify issues -> Explain findings -> Recommend improvements.

Input is the protocol text (processed blocks) and the structured Protocol Intelligence data.
Rule-based checks always run; an AI review runs when configured. Every finding carries a category,
severity, priority, explanation, recommendation and source references. AI findings are accepted
only with quotes that exist in the protocol and are labelled as AI-generated.
"""

import json
import re

from services.openai_service import ai_available, chat_completion_json
from services.protocol_intelligence import evidence, field_map, find_quote, norm, _quote

METHOD_VERSION = "protocol-review/1.0"

CATEGORIES = {
    "completeness": "Missing information",
    "consistency": "Inconsistency",
    "ambiguity": "Ambiguity",
    "clarity": "Unclear wording",
    "unresolved": "Unresolved issue",
}
SEVERITY_RANK = {"critical": 3, "major": 2, "minor": 1}
PRIORITY_BY_SEVERITY = {"critical": "high", "major": "medium", "minor": "low"}

# Protocol elements checked for completeness: (Protocol Intelligence field, label, severity, recommendation)
REQUIRED_FIELDS = [
    ("primary_objectives", "Primary objective", "critical", "State the primary objective explicitly in its own section."),
    ("primary_endpoints", "Primary endpoint", "critical", "Define the primary endpoint, its measurement method and assessment time point."),
    ("study_design", "Study design", "critical", "Describe the overall design (phase, control, allocation, blinding, duration)."),
    ("population", "Study population", "major", "Describe the target population the study will enrol."),
    ("inclusion_criteria", "Inclusion criteria", "critical", "List the inclusion criteria as separate, numbered items."),
    ("exclusion_criteria", "Exclusion criteria", "critical", "List the exclusion criteria as separate, numbered items."),
    ("sample_size", "Planned sample size", "critical", "State the planned number of participants and how it was determined."),
    ("treatment_arms", "Treatment arms / interventions", "major", "Describe each treatment arm, dose and regimen."),
    ("statistical_methods", "Statistical methods", "critical", "Describe the statistical analysis of the primary and key secondary endpoints."),
    ("safety_assessments", "Safety assessments", "major", "Describe how safety is assessed (adverse events, laboratory tests, vital signs, ECG)."),
    ("visits", "Study visits / schedule", "major", "Provide a visit schedule or Schedule of Assessments."),
    ("study_duration", "Study duration", "minor", "State the expected duration of participation and of the overall study."),
    ("secondary_objectives", "Secondary objectives", "minor", "State secondary objectives, or confirm there are none."),
    ("hypotheses", "Study hypothesis", "minor", "State the hypothesis tested by the primary analysis (or that no formal testing is planned)."),
]

# Protocol sections expected in a complete protocol (ICH E6(R3) / ICH M11 structure)
EXPECTED_SECTIONS = [
    ("informed_consent", "Informed consent", r"informed consent", "major",
     "Describe the informed consent process, including who obtains consent and when."),
    ("adverse_events", "Adverse event definitions and reporting", r"adverse event|serious adverse|\bsae\b|safety reporting", "critical",
     "Define adverse and serious adverse events and the reporting timelines and responsibilities."),
    ("discontinuation", "Participant discontinuation / withdrawal", r"discontinu|withdraw", "major",
     "Describe criteria and procedures for discontinuing study treatment and withdrawing participants."),
    ("data_management", "Data management / data quality", r"data (management|handling|collection|quality)|case report form|\bcrf\b|\bedc\b", "minor",
     "Describe data collection, data management and quality-control procedures."),
    ("ethics", "Ethics / regulatory considerations", r"ethic|institutional review|\birb\b|\biec\b|regulatory", "major",
     "Describe ethics committee review, regulatory obligations and Good Clinical Practice compliance."),
    ("monitoring", "Monitoring / quality assurance", r"monitoring|quality assurance|audit", "minor",
     "Describe study monitoring and quality-assurance arrangements."),
    ("deviations", "Protocol deviations", r"protocol deviation|deviations? from (the )?protocol|deviation (handling|management|reporting)", "minor", "Describe how protocol deviations are handled and documented."),
    ("concomitant", "Prohibited / concomitant medications", r"concomitant|prohibited (medication|therap)|prior (medication|therap)", "major",
     "List permitted and prohibited concomitant medications."),
]

VAGUE_TERMS = [
    (r"\bclinically (significant|relevant|important)\b", "\"clinically significant\" without a definition or threshold"),
    (r"\b(adequate|sufficient|appropriate|acceptable)\b", "a qualitative term (e.g. \"adequate\") without a measurable criterion"),
    (r"\b(normal|abnormal) (range|values?|function)\b(?![^.]{0,40}\b(defined|per|according|laboratory)\b)", "\"normal/abnormal\" without a reference range"),
    (r"\bat the (investigator'?s|discretion of the investigator)\b|\binvestigator'?s (discretion|judg(e)?ment|opinion)\b",
     "a decision left to investigator judgement without guidance"),
    (r"\b(stable|significant|severe|mild|moderate) (disease|condition|illness|dose)\b(?![^.]{0,40}\b(defined|for at least|for \d|≥|>=)\b)",
     "a severity/stability term without a definition"),
    (r"\b(recent|recently)\b(?![^.]{0,30}\b(within|in the (last|past)|\d))", "a time reference (\"recent\") without a time window"),
    (r"\b(etc\.?|and so on|and/or similar|such as)\b", "an open-ended list (\"etc.\", \"such as\")"),
    (r"\b(as needed|if necessary|where possible|as appropriate|if applicable)\b", "a conditional instruction without a stated condition"),
]
PLACEHOLDERS = re.compile(r"\b(TBD|TBC|TBA|to be (determined|confirmed|decided|defined|added)|pending (confirmation|decision))\b"
                          r"|\[(insert|add|tbd|xx+|to be)[^\]]*\]|\bX{2,}\b|<<[^>]+>>|\?\?", re.I)
MODAL_SHOULD = re.compile(r"\b(should|may|could|might)\b", re.I)
REVIEW_FIELDS = ("inclusion_criteria", "exclusion_criteria", "primary_endpoints", "secondary_endpoints", "exploratory_endpoints",
                 "unclassified_endpoints", "primary_objectives", "secondary_objectives", "assessment_methods", "safety_assessments")


def _finding(category: str, severity: str, title: str, description: str, recommendation: str, evidence_list: list[dict],
             key: str, origin: str = "rule", certainty: str = "confirmed", element: str | None = None) -> dict:
    return {
        "key": key,
        "category": category,
        "category_label": CATEGORIES[category],
        "severity": severity,
        "priority": PRIORITY_BY_SEVERITY[severity],
        "title": title,
        "description": description,
        "recommendation": recommendation,
        "evidence": evidence_list,
        "origin": origin,
        "certainty": certainty,
        "element": element,
        "status": "open",
        "resolution": None,
        "comments": [],
    }


# ─── Rule-based checks ───────────────────────────────────────────────

def check_completeness(fields: dict, blocks: list[dict]) -> tuple[list[dict], list[dict]]:
    findings, checklist = [], []
    for key, label, severity, rec in REQUIRED_FIELDS:
        f = fields.get(key)
        if not f or f["status"] == "not_requested":
            checklist.append({"element": label, "source": "Protocol Intelligence", "status": "not_checked",
                              "note": "Excluded by extraction preferences"})
            continue
        present = f["status"] != "missing"
        if key == "primary_endpoints" and not present:
            ue = fields.get("unclassified_endpoints")
            present = bool(ue and ue["status"] not in ("missing", "not_requested"))
            if present:
                findings.append(_finding("clarity", "major", "Primary endpoint not identified as such",
                                         "Endpoints are described, but none is designated as the primary endpoint.",
                                         "Designate the primary endpoint explicitly and classify the other endpoints by priority.",
                                         ue["evidence"][:2], key="completeness:primary_designation", element=label))
        checklist.append({"element": label, "source": "Protocol Intelligence", "status": "present" if present else "missing",
                          "evidence": f["evidence"][:1] if present else []})
        if not present:
            findings.append(_finding("completeness", severity, f"{label} not specified",
                                     f"The protocol does not state the {label.lower()} (Protocol Intelligence field '{f['label']}' is Not specified).",
                                     rec, [], key=f"completeness:{key}", element=label))
    headings = [b for b in blocks if b["kind"] == "heading"]
    for key, label, rx, severity, rec in EXPECTED_SECTIONS:
        hit = next((h for h in headings if re.search(rx, h["text"], re.I)), None)
        mention = hit or next((b for b in blocks if b["kind"] not in ("toc", "heading") and re.search(rx, b["text"], re.I)), None)
        status = "present" if hit else "mentioned_only" if mention else "missing"
        checklist.append({"element": label, "source": "Protocol sections", "status": status,
                          "evidence": [evidence(mention)] if mention else []})
        if status == "missing":
            findings.append(_finding("completeness", severity, f"No section on {label.lower()}",
                                     f"No section heading or text on {label.lower()} was found in the protocol.",
                                     rec, [], key=f"section:{key}", element=label))
        elif status == "mentioned_only":
            findings.append(_finding("completeness", "minor", f"{label} is mentioned but has no dedicated section",
                                     f"{label} is referred to in the text but is not described in its own section.",
                                     rec, [evidence(mention)], key=f"section:{key}", certainty="potential", element=label))
    return findings, checklist


def check_consistency(fields: dict, blocks: list[dict]) -> list[dict]:
    findings = []
    for f in fields.values():
        if f["status"] == "conflict":
            ev = f["evidence"][:1] + [e for a in f.get("alternatives", [])[:2] for e in a.get("evidence", [])[:1]]
            findings.append(_finding("consistency", "major" if f["key"] in ("sample_size", "phase", "primary_endpoints", "blinding") else "minor",
                                     f"Inconsistent {f['label'].lower()}",
                                     "; ".join(f["flags"]) or f"The protocol states different values for {f['label'].lower()}.",
                                     f"Use one consistent {f['label'].lower()} throughout the protocol (synopsis and body).",
                                     ev, key=f"consistency:{f['key']}", element=f["label"]))
    # Positive and negative design statements; PDF spacing ("Non -Randomized") is normalised first
    design_claims = {
        "randomization": (r"randomi[sz]ed", r"non-randomi[sz]ed|not be randomi[sz]ed"),
        "blinding": (r"double-blind", r"open-label"),
    }

    def flat(t):
        return re.sub(r"\s*-\s*", "-", t)

    for key, (pos_rx, neg_rx) in design_claims.items():
        pos = neg = None
        for b in blocks:
            t = flat(b["text"])
            if not neg and re.search(neg_rx, t, re.I):
                neg = (b, re.search(neg_rx, t, re.I).group(0))
            if not pos:
                for m in re.finditer(pos_rx, t, re.I):
                    if not re.search(r"(non-|not be |not |non )$", t[max(0, m.start() - 8):m.start()], re.I):
                        pos = (b, m.group(0))
                        break
        if pos and neg:
            findings.append(_finding("consistency", "critical", f"Contradictory {key} statements",
                                     f"The protocol describes the study both as '{pos[1]}' and as '{neg[1]}'.",
                                     f"Correct the {key} description so all sections agree.",
                                     [evidence(pos[0], pos[1]), evidence(neg[0], neg[1])],
                                     key=f"consistency:design_{key}", certainty="potential", element=key.capitalize()))
    design = fields.get("study_design")
    rand = fields.get("randomization")
    if design and rand and design["status"] not in ("missing", "not_requested") and rand["status"] == "missing" \
            and re.search(r"\brandomi[sz]ed\b", str(design["value"]), re.I) and not re.search(r"non[- ]?randomi", str(design["value"]), re.I):
        findings.append(_finding("consistency", "major", "Randomized design without a randomization description",
                                 "The design is described as randomized but no randomization method or ratio is given.",
                                 "Describe the randomization method, allocation ratio and any stratification factors.",
                                 design["evidence"][:1], key="consistency:randomization_missing", element="Randomization"))
    from services.endpoint_intelligence import _cross_section_issues, _collect
    eps = _collect(fields, [("primary_endpoints", "primary"), ("secondary_endpoints", "secondary")], "EP")
    seen = set()
    for ep in eps:
        for iss in _cross_section_issues(ep, blocks):
            if iss["type"] != "inconsistent_timepoint" or ep["id"] in seen:
                continue
            seen.add(ep["id"])
            findings.append(_finding("consistency", "critical" if ep["type"] == "primary" else "major",
                                     f"Endpoint time point differs between sections ({ep['type']} endpoint)",
                                     iss["description"].replace(ep["id"], f"The {ep['type']} endpoint \"{_quote(ep['text'], 80)}\""),
                                     "Use the same assessment time point for the endpoint in every section (synopsis, objectives, statistics).",
                                     iss["evidence"], key=f"consistency:timepoint:{norm(ep['text'])[:60]}", element="Endpoints"))
    return findings


def _field_items(f: dict) -> list[tuple[str, list[dict]]]:
    if f["status"] in ("missing", "not_requested"):
        return []
    values = f["value"] if isinstance(f["value"], list) else [f["value"]]
    out = []
    for i, v in enumerate(values):
        ev = [e for e in f["evidence"] if e.get("item") == i] or f["evidence"][:1]
        out.append((str(v), ev))
    return out


def check_clarity(fields: dict) -> list[dict]:
    """Vague, undefined or open-ended wording in criteria, objectives, endpoints and assessments."""
    findings = []
    for key in REVIEW_FIELDS:
        f = fields.get(key)
        if not f:
            continue
        for text, ev in _field_items(f):
            for rx, why in VAGUE_TERMS:
                m = re.search(rx, text, re.I)
                if not m:
                    continue
                severity = "major" if key in ("inclusion_criteria", "exclusion_criteria", "primary_endpoints") else "minor"
                findings.append(_finding(
                    "ambiguity", severity, f"Ambiguous wording in {f['label'].lower()}",
                    f"\"{_quote(text, 160)}\" uses {why} (\"{m.group(0)}\"). Sites may interpret it differently.",
                    "Replace with an objective, measurable definition (threshold, time window or reference range).",
                    ev, key=f"ambiguity:{key}:{norm(text)[:50]}:{norm(m.group(0))}", certainty="potential", element=f["label"]))
                break
            if key.endswith("_criteria") and MODAL_SHOULD.search(text):
                findings.append(_finding(
                    "clarity", "minor", f"Non-mandatory wording in {f['label'].lower()}",
                    f"\"{_quote(text, 160)}\" uses \"{MODAL_SHOULD.search(text).group(0)}\", which makes the criterion optional.",
                    "Eligibility criteria should be stated as definite requirements (\"must\", \"is\").",
                    ev, key=f"clarity:modal:{key}:{norm(text)[:50]}", certainty="potential", element=f["label"]))
            if len(text) > 400 and key.endswith("_criteria"):
                findings.append(_finding(
                    "clarity", "minor", f"Compound criterion in {f['label'].lower()}",
                    f"A single criterion is {len(text)} characters long and may combine several conditions.",
                    "Split compound criteria into separate numbered items so each can be checked individually.",
                    ev, key=f"clarity:long:{key}:{norm(text)[:50]}", certainty="potential", element=f["label"]))
    return findings


def check_unresolved(fields: dict, blocks: list[dict]) -> list[dict]:
    findings = []
    for b in blocks:
        if b["kind"] in ("toc",):
            continue
        m = PLACEHOLDERS.search(b["text"])
        if m:
            findings.append(_finding("unresolved", "major", "Placeholder or undecided content",
                                     f"The protocol contains \"{m.group(0)}\", which indicates content still to be decided.",
                                     "Complete or remove the placeholder before the protocol is finalised.",
                                     [evidence(b, m.group(0))], key=f"unresolved:placeholder:{b['id']}", element=b.get("section")))
    for f in fields.values():
        if f["status"] == "ambiguous":
            findings.append(_finding("unresolved", "minor", f"{f['label']} needs clarification",
                                     "; ".join(f["flags"]) or f"{f['label']} is ambiguous in the protocol.",
                                     f"Clarify the {f['label'].lower()} in the protocol text.",
                                     f["evidence"][:2], key=f"unresolved:ambiguous:{f['key']}", certainty="potential", element=f["label"]))
    return findings[:60]


# ─── AI review ───────────────────────────────────────────────────────

AI_PROMPT = """You are a senior clinical protocol reviewer. Review the protocol for completeness, consistency,
clarity and unresolved issues. The protocol is given as numbered blocks: [block_id | page | section] text.
Structured fields already extracted are given for reference.

Return JSON: {"findings": [{"category": "completeness|consistency|ambiguity|clarity|unresolved",
"severity": "critical|major|minor", "title": "...", "description": "what is wrong and why it matters",
"recommendation": "how to fix it", "evidence": [{"block_id": "...", "quote": "<exact short substring of that block>"}]}]}

Rules:
- Report only problems supported by the text. Quote the exact text that shows the problem (max 200 characters per quote).
- For missing information, cite the closest related text if any, otherwise leave evidence empty.
- Do not repeat these already-identified issues: %s
- Do not invent protocol content. Maximum 15 findings, most important first."""


async def ai_findings(blocks: list[dict], fields: dict, known_titles: list[str], budget: int = 80000) -> list[dict]:
    lines, total = [], 0
    for b in blocks:
        if b["kind"] == "toc":
            continue
        line = f"[{b['id']} | p.{b.get('page') or '-'} | {(b.get('section') or '')[:50]}] {b['text']}"
        if total + len(line) > budget:
            break
        lines.append(line)
        total += len(line)
    summary = {k: (f["value"] if f["status"] not in ("missing", "not_requested") else "Not specified")
               for k, f in fields.items()}
    raw = await chat_completion_json(AI_PROMPT % ("; ".join(known_titles[:40]) or "none"),
                                     "STRUCTURED FIELDS:\n" + json.dumps(summary)[:12000] + "\n\nPROTOCOL BLOCKS:\n" + "\n".join(lines),
                                     max_tokens=4000)
    out = []
    for i, f in enumerate((raw.get("findings") or [])[:15]):
        if not isinstance(f, dict) or not f.get("title"):
            continue
        category = f.get("category") if f.get("category") in CATEGORIES else "clarity"
        severity = f.get("severity") if f.get("severity") in SEVERITY_RANK else "minor"
        evs, ok = [], True
        for e in f.get("evidence") or []:
            if not isinstance(e, dict):
                continue
            b = find_quote(blocks, str(e.get("quote") or ""), e.get("block_id"))
            if b:
                evs.append(evidence(b, str(e["quote"])))
            else:
                ok = False
        if not evs and category != "completeness":
            continue  # a non-completeness finding must be shown in the text
        fd = _finding(category, severity, str(f["title"])[:200], str(f.get("description") or "")[:1500],
                      str(f.get("recommendation") or "")[:1000], evs, key=f"ai:{norm(f['title'])[:80]}",
                      origin="ai", certainty="potential")
        if not ok:
            fd["description"] += " (Some AI-cited text could not be found in the protocol and was removed.)"
        out.append(fd)
    return out


# ─── Orchestration ───────────────────────────────────────────────────

def _dedupe(findings: list[dict]) -> list[dict]:
    seen, out = set(), []
    for f in findings:
        if f["key"] in seen:
            continue
        seen.add(f["key"])
        out.append(f)
    return out


def summarize(findings: list[dict], checklist: list[dict]) -> dict:
    open_f = [f for f in findings if f["status"] == "open"]
    checked = [c for c in checklist if c["status"] != "not_checked"]
    present = sum(1 for c in checked if c["status"] == "present")
    return {
        "total": len(findings),
        "open": len(open_f),
        "by_category": {c: sum(1 for f in findings if f["category"] == c) for c in CATEGORIES},
        "by_severity": {s: sum(1 for f in findings if f["severity"] == s) for s in SEVERITY_RANK},
        "open_critical": sum(1 for f in open_f if f["severity"] == "critical"),
        "completeness": {"present": present, "checked": len(checked),
                         "percent": round(100 * present / len(checked)) if checked else None},
    }


def carry_over(old: list[dict], new: list[dict]) -> None:
    """Keep the review decisions of findings that are found again on a re-run."""
    prev = {f["key"]: f for f in old}
    for f in new:
        p = prev.get(f["key"])
        if p:
            f.update({k: p[k] for k in ("status", "resolution", "comments")})


async def review(pi_data: dict, blocks: list[dict], use_ai: bool = True) -> dict:
    fields = field_map(pi_data)
    blocks = [b for b in blocks if b["kind"] != "toc"]
    completeness, checklist = check_completeness(fields, blocks)
    findings = completeness + check_consistency(fields, blocks) + check_clarity(fields) + check_unresolved(fields, blocks)
    findings = _dedupe(findings)
    ai_note, ai_used = None, False
    if use_ai and ai_available():
        try:
            findings += await ai_findings(blocks, fields, [f["title"] for f in findings])
            ai_used = True
        except Exception as e:
            ai_note = f"AI review unavailable: {str(e)[:200]}"
    elif use_ai:
        ai_note = "AI review not configured; findings come from rule-based checks only."
    findings = _dedupe(findings)
    findings.sort(key=lambda f: (-SEVERITY_RANK[f["severity"]], list(CATEGORIES).index(f["category"])))
    for n, f in enumerate(findings, start=1):
        f["id"] = f"F{n}"
    unverified = [f["label"] for f in fields.values()
                  if f["status"] not in ("missing", "not_requested") and f["verification"]["status"] != "verified"]
    return {
        "findings": findings,
        "checklist": checklist,
        "summary": summarize(findings, checklist),
        "basis": {
            "protocol_intelligence_used": True,
            "unverified_fields": len(unverified),
            "warning": (f"{len(unverified)} Protocol Intelligence field(s) used by this review are not yet verified."
                        if unverified else None),
            "ai_used": ai_used,
            "ai_note": ai_note,
        },
    }
