"""
Endpoint Intelligence
Builds the endpoint register from Protocol Intelligence fields, links endpoints to objectives,
checks each endpoint for definition / measurement method / time point, and detects duplication
and cross-section inconsistencies. Suggestions (rule-generated or AI) are held separately from the
protocol content and never modify the endpoint hierarchy.
"""

import json
import re

from services.openai_service import ai_available, chat_completion_json
from services.protocol_intelligence import field_map, norm, similarity, evidence, _quote

METHOD_VERSION = "endpoint-intelligence/1.1"

STOPWORDS = set("""a an the of in on at to for from by with and or vs versus between within during after before
from baseline change proportion number rate percentage participants subjects patients who which that is are be
will was were as per over through up its their this these those primary secondary exploratory endpoint endpoints
objective objectives evaluate assess determine compare demonstrate study treatment""".split())

MEASUREMENT_TERMS = re.compile(
    r"\b(measured|assessed|evaluated|determined|recorded|calculated)\s+(by|using|with|via|according to|per)\b"
    r"|\b(scale|score|questionnaire|index|inventory|instrument|criteria|RECIST|iRECIST|NYHA|EQ-5D|SF-36|PHQ-9|HAM-D|MADRS|"
    r"ADAS-Cog|PASI|EASI|DAS28|ACR\d{2}|HbA1c|ECG|MRI|CT scan|PET|ultrasound|biopsy|spirometry|FEV1|blood pressure|"
    r"laboratory|assay|central lab|serum|plasma|urine|diary|ePRO|PRO|clinician[- ]reported|adjudicat\w+|"
    r"Kaplan|log-rank|CTCAE|MedDRA|viral load|titer|titre|pharmacokinetic|AUC|Cmax)\b", re.I)
TIMEPOINT = re.compile(
    r"\b(?:at|by|through|until|up to|over|from baseline to|to)?\s*(?:week|wk|day|month|year|visit)s?\s*-?\d+(?:\s*(?:and|,|to|–|-)\s*\d+)*"
    r"|\bbaseline\b|\bend of (?:treatment|study|the study)\b|\b(?:EOT|EOS)\b|\bfollow[- ]up\b|\bscreening\b"
    r"|\b\d+\s*(?:weeks?|days?|months?|years?)\b(?:\s*(?:after|post|following))?", re.I)
DEFINITION_TERMS = re.compile(
    r"\b(change|proportion|percentage|percent|rate|incidence|number of|time to|duration of|occurrence|"
    r"survival|response|remission|relapse|mean|median|level|concentration|score|frequency|event|events|"
    r"reduction|improvement|achiev\w+|AUC|Cmax)\b", re.I)


def content_terms(text: str) -> set[str]:
    return {w for w in norm(text).split() if len(w) > 2 and w not in STOPWORDS and not w.isdigit()}


def timepoints(text: str) -> list[str]:
    return [re.sub(r"\s+", " ", m.group(0)).strip() for m in TIMEPOINT.finditer(text or "") if m.group(0).strip()]


def _numeric_timepoints(text: str) -> set[tuple[str, str]]:
    out = set()
    for m in re.finditer(r"\b(week|wk|day|month|year)s?\s*(-?\d+)", text or "", re.I):
        unit = {"wk": "week"}.get(m.group(1).lower(), m.group(1).lower())
        out.add((unit, m.group(2)))
    return out


def _item_evidence(field: dict, idx: int) -> list[dict]:
    return [e for e in field.get("evidence", []) if e.get("item") == idx] or (
        field.get("evidence", [])[:1] if not field.get("multi") else [])


def _collect(fields: dict, keys_types: list[tuple[str, str]], prefix: str) -> list[dict]:
    out = []
    for key, typ in keys_types:
        f = fields.get(key)
        if not f or f["status"] == "missing":
            continue
        values = f["value"] if isinstance(f["value"], list) else [f["value"]]
        for i, text in enumerate(values):
            if not str(text).strip():
                continue
            out.append({
                "id": f"{prefix}{len(out) + 1}",
                "type": typ,
                "priority": sum(1 for o in out if o["type"] == typ) + 1,
                "text": str(text).strip(),
                "evidence": _item_evidence(f, i),
                "source_field": key,
                "verification": f["verification"]["status"],
            })
    return out


def _link(endpoints: list[dict], objectives: list[dict]) -> list[dict]:
    links = []
    for ep in endpoints:
        ep_terms = content_terms(ep["text"])
        scored = []
        for ob in objectives:
            ob_terms = content_terms(ob["text"])
            overlap = len(ep_terms & ob_terms) / max(1, min(len(ep_terms), len(ob_terms)))
            same_type = ep["type"] == ob["type"]
            score = overlap + (0.25 if same_type else 0)
            scored.append((score, overlap, same_type, ob))
        scored.sort(key=lambda t: -t[0])
        for score, overlap, same_type, ob in scored:
            only_of_type = same_type and sum(1 for o in objectives if o["type"] == ob["type"]) == 1
            if overlap >= 0.34 or (only_of_type and overlap >= 0.1) or (only_of_type and ep["type"] == "primary"):
                basis = "shared terms" if overlap >= 0.34 else "objective type"
                links.append({"endpoint_id": ep["id"], "objective_id": ob["id"], "score": round(score, 2),
                              "basis": basis, "certainty": "high" if overlap >= 0.34 and same_type else "possible"})
    return links


def _components(ep: dict, assessment_methods: list[str], am_field: dict | None) -> dict:
    text = ep["text"]
    definition = DEFINITION_TERMS.search(text)
    measure = MEASUREMENT_TERMS.search(text)
    measure_src, measure_ev = None, []
    if measure:
        measure_src = measure.group(0)
    else:
        terms = content_terms(text)
        for i, am in enumerate(assessment_methods):
            if len(terms & content_terms(am)) >= 2 and MEASUREMENT_TERMS.search(am):
                measure_src = am
                measure_ev = _item_evidence(am_field, i) if am_field else []
                break
    tps = timepoints(text)
    return {
        "definition": {"present": bool(definition) and len(text.split()) >= 4,
                       "text": text if definition else "Not specified"},
        "measurement_method": {"present": bool(measure_src), "text": measure_src or "Not specified",
                               "from_assessment_section": bool(measure_src and not measure), "evidence": measure_ev},
        "time_points": {"present": bool(tps), "values": tps or [], "text": ", ".join(tps) if tps else "Not specified"},
    }


ENDPOINT_CONTEXT = re.compile(r"(end ?point|objective|outcome|synopsis|statistic|analysis|efficacy)", re.I)


TIME_WORDS = {"week", "weeks", "day", "days", "month", "months", "year", "years", "visit", "wk"}


def core_terms(text: str) -> set[str]:
    """Terms naming the measure itself: text before the method clause, without time words."""
    core = re.split(r",|;|\b(?:measured|assessed|evaluated|determined|using|as per|according to)\b", text, maxsplit=1)[0]
    return content_terms(core) - TIME_WORDS


def _text_units(b: dict) -> list[str]:
    if b.get("table"):
        return [" ".join(c for c in row if c) for row in b["table"]]
    return [b["text"]]


def _cross_section_issues(ep: dict, blocks: list[dict]) -> list[dict]:
    """Compare time points of the same measure stated in other endpoint-related sections."""
    issues = []
    terms = core_terms(ep["text"])
    if not terms:
        return issues
    needed = 1.0 if len(terms) <= 2 else 0.6
    own_tp = _numeric_timepoints(ep["text"])
    own_units = {u for u, _ in own_tp}
    own_blocks = {e["block_id"] for e in ep["evidence"]}
    for b in blocks:
        if b["id"] in own_blocks or b["kind"] == "heading":
            continue
        if not ENDPOINT_CONTEXT.search(b.get("section") or "") and not ENDPOINT_CONTEXT.search(b["text"][:80]):
            continue
        for unit_text in _text_units(b):
            if len(terms & content_terms(unit_text)) / len(terms) < needed:
                continue
            other_tp = _numeric_timepoints(unit_text)
            diff = {(u, v) for u, v in other_tp if u in own_units} - own_tp
            if own_tp and diff and not (other_tp & own_tp):
                issues.append({
                    "type": "inconsistent_timepoint", "certainty": "confirmed",
                    "description": (f"{ep['id']} states {', '.join(f'{u} {v}' for u, v in sorted(own_tp))} but "
                                    f"another section states {', '.join(f'{u} {v}' for u, v in sorted(diff))} for the same measure."),
                    "evidence": ep["evidence"][:1] + [evidence(b, unit_text)],
                })
            elif 0.6 <= similarity(ep["text"], unit_text) < 0.9 and len(unit_text) < 400:
                issues.append({
                    "type": "inconsistent_name", "certainty": "potential",
                    "description": f"{ep['id']} is worded differently in another section; confirm both refer to the same endpoint.",
                    "evidence": ep["evidence"][:1] + [evidence(b, unit_text)],
                })
    return issues[:3]


def _split_sentences(field: dict | None) -> dict | None:
    """Hypotheses are often one paragraph; treat each sentence as a separate hypothesis."""
    if not field or field["status"] in ("missing", "not_requested") or isinstance(field["value"], list):
        return field
    parts = [x.strip() for x in re.split(r"(?<=[.;])\s+(?=[A-Z])", field["value"]) if len(x.strip()) > 15] or [field["value"]]
    ev = field.get("evidence", [])[:1]
    return {**field, "value": parts, "multi": True, "evidence": [dict(e, item=i) for i in range(len(parts)) for e in ev]}


def _link_hypotheses(endpoints: list[dict], hypotheses: list[dict]) -> list[dict]:
    """A hypothesis tests an endpoint when it names the endpoint's measure (its core terms)."""
    links = []
    for ep in endpoints:
        core = core_terms(ep["text"])
        if not core:
            continue
        for hy in hypotheses:
            score = len(core & content_terms(hy["text"])) / len(core)
            if score >= (1.0 if len(core) <= 2 else 0.6):
                links.append({"endpoint_id": ep["id"], "hypothesis_id": hy["id"], "score": round(score, 2), "basis": "endpoint measure named"})
    return links


def _sap_units(sap_blocks: list[dict]) -> list[tuple[dict, str]]:
    return [(b, u) for b in sap_blocks if b["kind"] not in ("heading", "toc") for u in _text_units(b)]


def _sap_comparison(endpoints: list[dict], sap_blocks: list[dict], add) -> list[dict]:
    """Check each endpoint against the statistical analysis plan: presence, time points and priority."""
    units = _sap_units(sap_blocks)
    rows = []
    for ep in endpoints:
        terms = core_terms(ep["text"])
        if not terms:
            continue
        needed = 1.0 if len(terms) <= 2 else 0.6
        hits = [(b, u) for b, u in units if len(terms & content_terms(u)) / len(terms) >= needed]
        own_tp = _numeric_timepoints(ep["text"])
        row = {"endpoint_id": ep["id"], "found_in_sap": bool(hits), "sap_evidence": [evidence(b, u) for b, u in hits[:2]],
               "sap_time_points": sorted({f"{u} {v}" for _, t in hits[:5] for u, v in _numeric_timepoints(t)}), "status": "consistent"}
        if not hits:
            row["status"] = "not_found"
            add({"type": "not_in_sap", "certainty": "potential", "endpoint_id": ep["id"],
                 "description": f"{ep['id']} could not be found in the statistical analysis plan.", "evidence": ep["evidence"]})
        else:
            sap_tp = {t for _, u in hits for t in _numeric_timepoints(u)}
            units_own = {u for u, _ in own_tp}
            diff = {t for t in sap_tp if t[0] in units_own} - own_tp
            if own_tp and diff and not (sap_tp & own_tp):
                row["status"] = "timepoint_mismatch"
                add({"type": "sap_timepoint_mismatch", "certainty": "confirmed", "endpoint_id": ep["id"],
                     "description": (f"{ep['id']} states {', '.join(f'{u} {v}' for u, v in sorted(own_tp))} in the protocol but the SAP states "
                                     f"{', '.join(f'{u} {v}' for u, v in sorted(diff))}."),
                     "evidence": ep["evidence"][:1] + [evidence(hits[0][0], hits[0][1])]})
            sap_text = " ".join((b.get("section") or "") + " " + u for b, u in hits[:3]).lower()
            other = {"primary", "secondary", "exploratory"} - {ep["type"]}
            if ep["type"] in ("primary", "secondary", "exploratory") and ep["type"] not in sap_text and any(o in sap_text for o in other):
                row["status"] = "priority_mismatch" if row["status"] == "consistent" else row["status"]
                add({"type": "sap_priority_mismatch", "certainty": "potential", "endpoint_id": ep["id"],
                     "description": f"{ep['id']} is {ep['type']} in the protocol but appears under a different priority in the SAP.",
                     "evidence": ep["evidence"][:1] + [evidence(hits[0][0], hits[0][1])]})
        rows.append(row)
    return rows


QUESTION_TEMPLATES = {
    "missing_measurement": "How is {ep} measured (instrument, assay or method)?",
    "missing_timepoint": "At which time point(s) is {ep} assessed?",
    "missing_definition": "What is the precise definition and summary measure of {ep}?",
    "no_objective": "Which study objective does {ep} support?",
    "objective_without_endpoint": "Which endpoint addresses {ob}?",
    "hypothesis_without_endpoint": "Which endpoint tests hypothesis {hy}?",
    "primary_without_hypothesis": "Which hypothesis does primary endpoint {ep} test?",
    "duplicate": "Are {ep} and the similar endpoint intended to be distinct endpoints?",
    "inconsistent_name": "Do the differently worded descriptions of {ep} refer to the same endpoint?",
    "inconsistent_timepoint": "Which time point is correct for {ep}?",
    "timepoint_not_scheduled": "Should the time point of {ep} be added to the Schedule of Assessments?",
    "priority_not_stated": "Is {ep} a primary, secondary or exploratory endpoint?",
    "not_in_sap": "Is {ep} analysed in the statistical analysis plan?",
    "sap_timepoint_mismatch": "Which time point for {ep} is correct, the protocol's or the SAP's?",
    "sap_priority_mismatch": "What is the intended priority of {ep}, as stated in the protocol or in the SAP?",
    "no_endpoints": "Where are the study endpoints defined?",
}


def unresolved_questions(issues: list[dict]) -> list[dict]:
    """Open questions derived from the issues; a question is answered when its issue is reviewed."""
    out = []
    for i in issues:
        tpl = QUESTION_TEMPLATES.get(i["type"])
        if not tpl:
            continue
        out.append({"id": f"Q{len(out) + 1}", "issue_id": i["id"], "certainty": i["certainty"],
                    "question": tpl.format(ep=i.get("endpoint_id", "the endpoint"), ob=i.get("objective_id", "the objective"),
                                           hy=i.get("hypothesis_id", "")),
                    "context": i["description"], "evidence": i.get("evidence", [])[:2]})
    return out


def analyze(pi_data: dict, blocks: list[dict], soa_data: dict | None = None, sap_blocks: list[dict] | None = None) -> dict:
    fields = field_map(pi_data)
    endpoints = _collect(fields, [("primary_endpoints", "primary"), ("secondary_endpoints", "secondary"),
                                  ("exploratory_endpoints", "exploratory"), ("unclassified_endpoints", "unclassified")], "EP")
    objectives = _collect(fields, [("primary_objectives", "primary"), ("secondary_objectives", "secondary"),
                                   ("exploratory_objectives", "exploratory")], "OBJ")
    hypotheses = _collect({"hypotheses": _split_sentences(fields.get("hypotheses"))}, [("hypotheses", "hypothesis")], "H") \
        if fields.get("hypotheses") else []
    blocks = [b for b in blocks if b["kind"] != "toc"]
    am_field = fields.get("assessment_methods")
    assessment_methods = am_field["value"] if am_field and am_field["status"] != "missing" else []

    links = _link(endpoints, objectives)
    hypothesis_links = _link_hypotheses(endpoints, hypotheses)
    issues = []

    def add(issue):
        issue = {"id": f"I{len(issues) + 1}", "status": "open", "resolution": None, **issue}
        issues.append(issue)

    for ep in endpoints:
        ep["components"] = _components(ep, assessment_methods, am_field)
        c = ep["components"]
        if not c["definition"]["present"]:
            add({"type": "missing_definition", "certainty": "potential", "endpoint_id": ep["id"],
                 "description": f"{ep['id']} has no clearly measurable definition (variable and summary measure).",
                 "evidence": ep["evidence"]})
        if not c["measurement_method"]["present"]:
            add({"type": "missing_measurement", "certainty": "confirmed", "endpoint_id": ep["id"],
                 "description": f"No measurement method or instrument is specified for {ep['id']}.",
                 "evidence": ep["evidence"]})
        if not c["time_points"]["present"]:
            add({"type": "missing_timepoint", "certainty": "confirmed", "endpoint_id": ep["id"],
                 "description": f"No assessment time point is specified for {ep['id']}.", "evidence": ep["evidence"]})
        if not any(l["endpoint_id"] == ep["id"] for l in links):
            add({"type": "no_objective", "certainty": "potential", "endpoint_id": ep["id"],
                 "description": f"{ep['id']} could not be linked to a stated objective.", "evidence": ep["evidence"]})
        if ep["type"] == "unclassified":
            add({"type": "priority_not_stated", "certainty": "confirmed", "endpoint_id": ep["id"],
                 "description": f"The protocol does not state whether {ep['id']} is a primary, secondary or exploratory endpoint.",
                 "evidence": ep["evidence"]})
        if hypotheses and ep["type"] == "primary" and not any(h["endpoint_id"] == ep["id"] for h in hypothesis_links):
            add({"type": "primary_without_hypothesis", "certainty": "potential", "endpoint_id": ep["id"],
                 "description": f"Primary endpoint {ep['id']} could not be linked to a stated hypothesis.", "evidence": ep["evidence"]})
        for iss in _cross_section_issues(ep, blocks):
            add({**iss, "endpoint_id": ep["id"]})

    for ob in objectives:
        if not any(l["objective_id"] == ob["id"] for l in links):
            add({"type": "objective_without_endpoint", "certainty": "potential", "objective_id": ob["id"],
                 "description": f"{ob['id']} has no identifiable endpoint (possible objective–endpoint misalignment).",
                 "evidence": ob["evidence"]})

    for i, a in enumerate(endpoints):
        for b in endpoints[i + 1:]:
            s = similarity(a["text"], b["text"])
            if norm(a["text"]) == norm(b["text"]):
                add({"type": "duplicate", "certainty": "confirmed", "endpoint_id": b["id"],
                     "description": f"{b['id']} duplicates {a['id']}.", "evidence": a["evidence"] + b["evidence"]})
            elif s >= 0.85:
                add({"type": "duplicate", "certainty": "potential", "endpoint_id": b["id"],
                     "description": f"{b['id']} is very similar to {a['id']} ({int(s * 100)}% text similarity).",
                     "evidence": a["evidence"] + b["evidence"]})

    for hy in hypotheses:
        if not any(h["hypothesis_id"] == hy["id"] for h in hypothesis_links):
            add({"type": "hypothesis_without_endpoint", "certainty": "potential", "hypothesis_id": hy["id"],
                 "description": f"Hypothesis {hy['id']} could not be linked to an endpoint.", "evidence": hy["evidence"]})

    sap_rows = _sap_comparison(endpoints, sap_blocks, add) if sap_blocks else []

    if not endpoints:
        add({"type": "no_endpoints", "certainty": "confirmed",
             "description": "No endpoints were found in the verified protocol information.", "evidence": []})

    timepoint_map = _map_timepoints(endpoints, soa_data, add)

    unverified = [k for k in ("primary_endpoints", "secondary_endpoints", "exploratory_endpoints", "unclassified_endpoints",
                              "primary_objectives", "secondary_objectives", "exploratory_objectives", "hypotheses")
                  if fields.get(k) and fields[k]["status"] not in ("missing", "not_requested")
                  and fields[k]["verification"]["status"] != "verified"]
    return {
        "register": endpoints,
        "objectives": objectives,
        "hypotheses": hypotheses,
        "hypothesis_mapping": hypothesis_links,
        "sap_comparison": sap_rows,
        "unresolved_questions": unresolved_questions(issues),
        "mapping": links,
        "timepoint_map": timepoint_map,
        "issues": issues,
        "suggestions": rule_suggestions(issues, endpoints),
        "hierarchy": [{"id": e["id"], "type": e["type"], "priority": e["priority"]} for e in endpoints],
        "basis": {
            "unverified_fields": unverified,
            "warning": ("Analysis is based on protocol fields that have not been verified: " + ", ".join(unverified))
            if unverified else None,
            "soa_used": bool(soa_data),
            "sap_used": bool(sap_blocks),
        },
    }


def _map_timepoints(endpoints: list[dict], soa_data: dict | None, add) -> list[dict]:
    rows = []
    visits = (soa_data or {}).get("visits", [])
    for ep in endpoints:
        for tp in ep["components"]["time_points"]["values"]:
            matched = []
            for unit, value in _numeric_timepoints(tp):
                for v in visits:
                    t = v.get("timing") or {}
                    if t.get("unit") == unit and str(t.get("value")) == value:
                        matched.append(v["id"])
            if re.search(r"baseline", tp, re.I):
                matched += [v["id"] for v in visits if re.search(r"baseline|day\s*1\b|randomi", v["label"], re.I)]
            rows.append({"endpoint_id": ep["id"], "time_point": tp, "visit_ids": sorted(set(matched))})
            if visits and not matched and _numeric_timepoints(tp):
                add({"type": "timepoint_not_scheduled", "certainty": "potential", "endpoint_id": ep["id"],
                     "description": f"Time point '{tp}' of {ep['id']} does not match any visit in the Schedule of Assessments.",
                     "evidence": ep["evidence"]})
    return rows


SUGGESTION_TEMPLATES = {
    "missing_measurement": ("Specify the instrument, assay or method used to measure {ep}.", "clinical"),
    "missing_timepoint": ("State the assessment time point(s) for {ep} (e.g. the study week or visit).", "clinical"),
    "missing_definition": ("Define {ep} as a measurable variable with its summary measure (e.g. change from baseline, proportion).", "statistical"),
    "no_objective": ("Link {ep} to the study objective it supports, or reconsider whether it is needed.", "clinical"),
    "objective_without_endpoint": ("Add or identify the endpoint that addresses {ob}.", "clinical"),
    "duplicate": ("Consolidate or differentiate {ep} from the similar endpoint.", "editorial"),
    "inconsistent_timepoint": ("Harmonise the time point of {ep} across protocol sections.", "statistical"),
    "inconsistent_name": ("Use one consistent name and definition for {ep} throughout the protocol.", "editorial"),
    "priority_not_stated": ("State whether {ep} is a primary, secondary or exploratory endpoint.", "statistical"),
    "primary_without_hypothesis": ("State the hypothesis tested by primary endpoint {ep}.", "statistical"),
    "hypothesis_without_endpoint": ("Identify the endpoint that tests each stated hypothesis.", "statistical"),
    "not_in_sap": ("Add the analysis of {ep} to the statistical analysis plan, or confirm it is intentionally not analysed.", "statistical"),
    "sap_timepoint_mismatch": ("Align the time point of {ep} between the protocol and the SAP.", "statistical"),
    "sap_priority_mismatch": ("Align the priority of {ep} between the protocol and the SAP.", "statistical"),
    "timepoint_not_scheduled": ("Add the {ep} assessment time point to the Schedule of Assessments or correct the endpoint.", "clinical"),
}


def rule_suggestions(issues: list[dict], endpoints: list[dict]) -> list[dict]:
    out = []
    for iss in issues:
        tpl = SUGGESTION_TEMPLATES.get(iss["type"])
        if not tpl:
            continue
        text, impact = tpl
        out.append(new_suggestion(
            len(out) + 1, origin="rule",
            text=text.format(ep=iss.get("endpoint_id", "the endpoint"), ob=iss.get("objective_id", "the objective")),
            rationale=iss["description"], impact=impact, issue_ids=[iss["id"]],
            target=iss.get("endpoint_id") or iss.get("objective_id"), evidence=iss.get("evidence", [])[:2]))
    return out


def new_suggestion(n: int, *, origin: str, text: str, rationale: str, impact: str, issue_ids: list[str],
                   target: str | None, evidence: list[dict]) -> dict:
    return {
        "id": f"{'AI' if origin == 'ai' else 'S'}{n}",
        "origin": origin,  # "rule" or "ai"; shown apart from verified protocol content
        "text": text,
        "rationale": rationale,
        "impact": impact,
        "requires_scientific_review": impact in ("clinical", "statistical"),
        "issue_ids": issue_ids,
        "target": target,
        "evidence": evidence,
        "status": "pending_review",
        "comments": [],
        "decision": None,
    }


AI_SUGGEST_PROMPT = """You are a clinical scientist reviewing protocol endpoints. You receive an endpoint register,
objectives, detected issues, and numbered source blocks. Propose clarifications.
Return JSON: {"suggestions": [{"target": "<EP or OBJ id>", "text": "...", "rationale": "...",
"impact": "clinical|statistical|editorial", "issue_ids": ["I1"], "source_block_ids": ["b12"]}]}
Rules: base rationale only on the supplied material and cite source_block_ids that exist; do not change the
endpoint hierarchy; do not invent protocol content. Maximum 10 suggestions."""


async def ai_suggestions(result: dict, blocks: list[dict]) -> list[dict]:
    if not ai_available():
        return []
    ids = set()
    for item in result["register"] + result["objectives"]:
        ids |= {e["block_id"] for e in item["evidence"]}
    context = "\n".join(f"[{b['id']}] {_quote(b['text'], 600)}" for b in blocks if b["id"] in ids)
    payload = {
        "register": [{k: e[k] for k in ("id", "type", "priority", "text")} for e in result["register"]],
        "objectives": [{k: o[k] for k in ("id", "type", "text")} for o in result["objectives"]],
        "issues": [{k: i.get(k) for k in ("id", "type", "certainty", "description")} for i in result["issues"]],
    }
    raw = await chat_completion_json(AI_SUGGEST_PROMPT, json.dumps(payload) + "\n\nSOURCE BLOCKS:\n" + context)
    by_id = {b["id"]: b for b in blocks}
    out = []
    for s in (raw.get("suggestions") or [])[:10]:
        if not isinstance(s, dict) or not s.get("text"):
            continue
        evs = [evidence(by_id[bid]) for bid in (s.get("source_block_ids") or []) if bid in by_id]
        impact = s.get("impact") if s.get("impact") in ("clinical", "statistical", "editorial") else "clinical"
        out.append(new_suggestion(len(out) + 1, origin="ai", text=str(s["text"]), rationale=str(s.get("rationale") or ""),
                                  impact=impact, issue_ids=[i for i in (s.get("issue_ids") or []) if isinstance(i, str)],
                                  target=s.get("target"), evidence=evs))
    return out
