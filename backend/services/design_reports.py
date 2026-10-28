"""
Design Reports & AI Assistant
Builds evidence-linked reports from the selected protocol version and explicitly chosen analysis
artifacts, and answers study questions using only retrieved study evidence. Every statement is
labelled as a source fact, calculated result, AI interpretation or unresolved issue.
"""

import math
import re
from collections import Counter

from services.openai_service import ai_available, chat_completion_json
from services.protocol_intelligence import _quote

METHOD_VERSION = "design-reports/1.0"

# Built-in report types are default templates over the section catalogue (SECTIONS below)
REPORT_TYPES = {
    "protocol_intelligence": {
        "title": "Protocol Intelligence Report",
        "sections": ["overview", "characteristics", "fields", "review_items", "synopsis"],
    },
    "study_design_assessment": {
        "title": "Study Design Assessment Report",
        "sections": ["characteristics", "design_facts", "protocol_review", "sample_size", "design_analyses"],
    },
    "endpoint_soa_review": {
        "title": "Endpoint and Schedule of Assessments Review Report",
        "sections": ["endpoint_register", "endpoint_hypotheses", "endpoint_issues", "endpoint_questions", "endpoint_sap",
                     "endpoint_suggestions", "soa_summary", "soa_timeline", "soa_issues"],
    },
    "eligibility_recruitment": {
        "title": "Eligibility and Recruitment Burden Summary",
        "sections": ["criteria", "eligibility_analysis"],
    },
    "feasibility_sample_size": {
        "title": "Feasibility and Sample-Size Planning Report",
        "sections": ["sample_size", "feasibility_analysis"],
    },
    "amendment_impact": {
        "title": "Protocol Amendment Impact Report",
        "sections": ["version_history", "comparison_summary", "substantive_changes", "impacts"],
    },
}

EXISTING_LABELS = {
    "extraction": "Protocol Review (earlier extraction output)", "summary": "Synopsis Generator", "eligibility_review": "Eligibility Intelligence",
    "gap_analysis": "Protocol Gap Assessment", "feasibility": "Study Feasibility", "design_recommendations": "Study Design Optimizer",
}


def cite(ev: dict) -> str:
    parts = []
    if ev.get("page"):
        parts.append(f"p.{ev['page']}")
    if ev.get("section"):
        parts.append(f"§ {ev['section'][:60]}")
    if ev.get("block_id"):
        parts.append(ev["block_id"])
    return ", ".join(parts)


def _field_label(f: dict) -> str:
    v = f["verification"]["status"]
    return "verified" if v == "verified" else "pending"


def _artifact_ref(a: dict) -> str:
    return f"{a['kind']} {a['id']} rev {a['revision']} ({a['status']})"


# ─── Section builders ────────────────────────────────────────────────

def _pi_fields_section(pi: dict, keys: list[str] | None, heading: str) -> dict:
    items = []
    for f in pi["data"]["fields"]:
        if keys and f["key"] not in keys:
            continue
        if f["status"] == "missing":
            items.append({"label": "unresolved", "text": f"{f['label']}: Not specified in the protocol.", "citations": []})
            continue
        value = "; ".join(f["value"]) if isinstance(f["value"], list) else f["value"]
        items.append({"label": _field_label(f), "text": f"{f['label']}: {value}",
                      "citations": [cite(e) for e in f["evidence"][:3]] + [_artifact_ref(pi)]})
        if f["status"] in ("conflict", "ambiguous", "low_confidence") and f["verification"]["status"] != "verified":
            items.append({"label": "unresolved", "text": f"{f['label']}: {'; '.join(f['flags']) or f['status']}", "citations": []})
    return {"heading": heading, "items": items}


def _existing_section(doc_analyses: dict, keys: list[str], heading: str, doc_id: str | None) -> dict:
    items = []
    for k in keys:
        text = doc_analyses.get(k)
        if not text:
            items.append({"label": "note", "text": f"{EXISTING_LABELS.get(k, k)} has not been run for this protocol version.", "citations": []})
            continue
        items.append({"label": "ai_interpretation",
                      "text": f"{EXISTING_LABELS.get(k, k)} (AI analysis output; not source-verified):\n{text.strip()[:6000]}",
                      "citations": [f"document {doc_id} analysis '{k}'"]})
    return {"heading": heading, "items": items}


def _sample_size_section(scenarios: list[dict]) -> dict:
    items = []
    if not scenarios:
        items.append({"label": "note", "text": "No sample-size calculation has been saved for this protocol version.", "citations": []})
    for a in scenarios:
        r = a["data"]["result"]
        name = a["data"].get("name") or a["id"]
        items.append({"label": "calculated",
                      "text": (f"Scenario '{name}': {r['method_name']} — evaluable {r['evaluable']['total']} "
                               f"(per arm {', '.join(map(str, r['evaluable']['per_arm']))}), enrollment target {r['enrollment']['total']} "
                               f"(per arm {', '.join(map(str, r['enrollment']['per_arm']))})"
                               + (f", events {r['events']}" if r.get("events") else "") + "."),
                      "citations": [_artifact_ref(a) + f", method {r['method_version']}"]})
        items.append({"label": "note", "text": "Assumptions: " + "; ".join(r["assumptions"]), "citations": []})
    if scenarios:
        items.append({"label": "note", "text": scenarios[0]["data"]["result"]["disclaimer"], "citations": []})
    return {"heading": "Sample size and power (calculated planning estimates)", "items": items}


def _endpoint_sections(ep: dict | None, wanted: list[str]) -> list[dict]:
    if not ep:
        return [{"heading": "Endpoint Intelligence", "items": [{"label": "note", "text": "Endpoint Intelligence has not been run.", "citations": []}]}]
    d, ref = ep["data"], _artifact_ref(ep)
    out = []
    if "endpoint_register" in wanted:
        rows = [[e["id"], e["type"], e["priority"], e["text"], e["components"]["measurement_method"]["text"],
                 e["components"]["time_points"]["text"], "; ".join(cite(x) for x in e["evidence"][:2])] for e in d["register"]]
        links = {e["id"]: ", ".join(l["objective_id"] for l in d["mapping"] if l["endpoint_id"] == e["id"]) or "—" for e in d["register"]}
        for r in rows:
            r.insert(3, links[r[0]])
        out.append({"heading": "Endpoint register", "items": [{"label": "fact", "text": f"{len(rows)} endpoints from protocol fields.", "citations": [ref]}],
                    "table": {"columns": ["ID", "Type", "Priority", "Objective(s)", "Endpoint", "Measurement", "Time points", "Source"], "rows": rows}})
    if "endpoint_issues" in wanted:
        out.append({"heading": "Endpoint issues", "items": [
            {"label": "unresolved" if i["status"] != "resolved" else "note",
             "text": f"[{i['certainty']}] {i['description']}" + (" (resolved)" if i["status"] == "resolved" else ""),
             "citations": [cite(e) for e in i.get("evidence", [])[:2]]} for i in d["issues"]] or
            [{"label": "note", "text": "No endpoint issues detected.", "citations": []}]})
    if "endpoint_hypotheses" in wanted:
        hyps = d.get("hypotheses") or []
        rows = [[h["id"], h["text"], ", ".join(l["endpoint_id"] for l in d.get("hypothesis_mapping", []) if l["hypothesis_id"] == h["id"]) or "—"]
                for h in hyps]
        out.append({"heading": "Hypotheses and endpoint links", "items": [
            {"label": "fact" if hyps else "note", "text": f"{len(hyps)} hypothesis statement(s) from the protocol." if hyps
             else "No study hypotheses are stated in the protocol information.", "citations": [ref]}],
            **({"table": {"columns": ["ID", "Hypothesis", "Linked endpoints"], "rows": rows}} if rows else {})})
    if "endpoint_questions" in wanted:
        status = {i["id"]: i["status"] for i in d["issues"]}
        qs = d.get("unresolved_questions") or []
        out.append({"heading": "Unresolved endpoint questions", "items": [
            {"label": "unresolved" if status.get(q["issue_id"]) != "resolved" else "note",
             "text": f"{q['id']}: {q['question']}" + (" (answered in review)" if status.get(q["issue_id"]) == "resolved" else ""),
             "citations": [cite(e) for e in q.get("evidence", [])[:2]]} for q in qs]
            or [{"label": "note", "text": "No unresolved questions.", "citations": []}]})
    if "endpoint_sap" in wanted:
        rows = [[r["endpoint_id"], r["status"].replace("_", " "), ", ".join(r["sap_time_points"]) or "—",
                 "; ".join(cite(e) for e in r["sap_evidence"][:1]) or "—"] for r in d.get("sap_comparison") or []]
        used = (d.get("basis") or {}).get("sap_used")
        out.append({"heading": "Protocol vs statistical analysis plan", "items": [
            {"label": "fact" if used else "note", "text": "Endpoints compared with the uploaded statistical analysis plan." if used
             else "No statistical analysis plan was supplied with this protocol version.", "citations": [ref] if used else []}],
            **({"table": {"columns": ["Endpoint", "Result", "SAP time points", "SAP source"], "rows": rows}} if rows else {})})
    if "endpoint_suggestions" in wanted:
        out.append({"heading": "Suggested clarifications (separate from protocol content)", "items": [
            {"label": "ai_interpretation" if s["origin"] == "ai" else "note",
             "text": f"{s['id']} [{s['status']}{', requires scientific review' if s['requires_scientific_review'] else ''}] {s['text']} — Rationale: {s['rationale']}",
             "citations": [cite(e) for e in s.get("evidence", [])[:2]]} for s in d["suggestions"]] or
            [{"label": "note", "text": "No suggestions.", "citations": []}]})
    return out


def _soa_sections(soa: dict | None, wanted: list[str]) -> list[dict]:
    if not soa:
        return [{"heading": "Schedule of Assessments", "items": [{"label": "note", "text": "Schedule of Assessments has not been generated.", "citations": []}]}]
    m, ref = soa["data"], _artifact_ref(soa)
    out = []
    if "soa_summary" in wanted:
        rows = [[v["id"], v["label"], (v.get("timing") or {}).get("label", "Not specified"),
                 (v.get("window") or {}).get("text", "Not specified"),
                 sum(1 for k in m["cells"] if k.endswith("|" + v["id"]))] for v in m["visits"]]
        out.append({"heading": "Schedule of Assessments summary", "items": [
            {"label": "fact", "text": f"{len(m['visits'])} visits and {len(m['assessments'])} assessments (matrix status: {soa['status']}).", "citations": [ref]}],
            "table": {"columns": ["ID", "Visit", "Timing (as stated)", "Window", "Assessments"], "rows": rows}})
    if "soa_timeline" in wanted:
        from services.design_exports import timeline
        rows = [[n, t["label"], t["phase"], t["timing"], t["approx_day"] if t["approx_day"] is not None else "Not specified", t["window"]]
                for n, t in enumerate(timeline(m), start=1)]
        out.append({"heading": "Visit timeline", "items": [
            {"label": "fact", "text": "Visits in chronological order; timing as stated in the protocol (approximate study day only for ordering).",
             "citations": [ref]}], "table": {"columns": ["#", "Visit", "Phase", "Timing", "Approx. day", "Window"], "rows": rows}})
    if "soa_issues" in wanted:
        out.append({"heading": "Scheduling issues", "items": [
            {"label": "unresolved" if i["status"] != "resolved" else "note",
             "text": f"[{i['severity']}] {i['description']}" + (" (resolved)" if i["status"] == "resolved" else ""), "citations": [ref]}
            for i in m["issues"]] or [{"label": "note", "text": "No scheduling issues.", "citations": []}]})
    return out


def _comparison_sections(cmp: dict | None, wanted: list[str]) -> list[dict]:
    if not cmp:
        return [{"heading": "Amendment comparison", "items": [{"label": "note", "text": "No version comparison has been run.", "citations": []}]}]
    d, ref = cmp["data"], _artifact_ref(cmp)
    out = []
    if "comparison_summary" in wanted:
        t = d["totals"]
        out.append({"heading": "Comparison summary", "items": [
            {"label": "fact", "text": (f"Compared version {d['base_label']} → {d['target_label']}: {t['added']} added, {t['removed']} removed, "
                                       f"{t['modified']} modified, {t['formatting']} formatting-only."), "citations": [ref]},
            {"label": "note", "text": f"Document match: {d['match']['level']} ({d['match']['score']}). " + "; ".join(d['match']['reasons']), "citations": []}],
            "table": {"columns": ["Old section", "New section", "Status", "Added", "Removed", "Modified", "Formatting"],
                      "rows": [[s["section_old"] or "—", s["section_new"] or "—", s["status"], s["added"], s["removed"], s["modified"], s["formatting"]]
                               for s in d["section_summary"]]}})
    if "substantive_changes" in wanted:
        items = []
        for c in [c for c in d["changes"] if c["substantive"]][:200]:
            old = _quote((c["old"] or {}).get("text", ""), 220)
            new = _quote((c["new"] or {}).get("text", ""), 220)
            text = {"added": f"Added: {new}", "removed": f"Removed: {old}", "modified": f"Changed: “{old}” → “{new}”"}[c["type"]]
            cites = [f"old {cite(c['old'])}" if c["old"] else None, f"new {cite(c['new'])}" if c["new"] else None]
            items.append({"label": "fact", "text": f"{c['id']} [{c['review']['status']}] {text}", "citations": [x for x in cites if x]})
        out.append({"heading": "Substantive changes", "items": items or [{"label": "note", "text": "No substantive changes.", "citations": []}]})
    if "impacts" in wanted:
        out.append({"heading": "Potential downstream impacts (recommendations, not confirmed consequences)", "items": [
            {"label": "unresolved",
             "text": f"{a['label']}: changes {', '.join(a['change_ids'][:15])}" + (
                 f". Linked deliverables: {', '.join((x.get('kind') or x.get('existing_analysis')) for x in a.get('linked_deliverables', []))}"
                 if a.get("linked_deliverables") else ""), "citations": [ref]}
            for a in d["impact_areas"]] or [{"label": "note", "text": "No downstream impacts identified.", "citations": []}]})
    return out


def _missing(heading: str, what: str) -> dict:
    return {"heading": heading, "items": [{"label": "note", "text": f"{what} has not been run for this protocol version.", "citations": []}]}


def _pi(ctx):
    return (ctx["artifacts"].get("protocol_intelligence") or [None])[0]


def _first(ctx, kind):
    return (ctx["artifacts"].get(kind) or [None])[0]


def _sec_overview(ctx):
    pi = _pi(ctx)
    if not pi:
        return [_missing("Extraction overview", "Protocol Intelligence")]
    s = pi["data"]["summary"]
    return [{"heading": "Extraction overview", "items": [{"label": "fact", "text": (
        f"{s['total']} fields: {s['extracted']} extracted, {s['missing']} not specified, {s.get('conflict', 0)} conflicting, "
        f"{s.get('ambiguous', 0)} ambiguous, {s.get('low_confidence', 0)} low confidence, {s.get('not_requested', 0)} excluded by preferences; "
        f"{s['verified']} verified."), "citations": [_artifact_ref(pi)]}]}]


def _sec_characteristics(ctx):
    pi = _pi(ctx)
    if not pi:
        return [_missing("Study characteristics", "Protocol Intelligence")]
    fm = {f["key"]: f for f in pi["data"]["fields"]}
    rows = []
    for c in pi["data"].get("characteristics") or []:
        f = fm.get(c["key"]) or {}
        rows.append([c["label"], c["value"], c["verification"], "; ".join(cite(e) for e in (f.get("evidence") or [])[:1]) or "—"])
    return [{"heading": "Study characteristics", "items": [
        {"label": "fact", "text": "Characteristics as extracted from the protocol (verification status shown per row).", "citations": [_artifact_ref(pi)]}],
        "table": {"columns": ["Characteristic", "Value", "Verification", "Source"], "rows": rows}}]


def _sec_fields(ctx):
    pi = _pi(ctx)
    return [_pi_fields_section(pi, None, "Structured protocol information")] if pi else [_missing("Structured protocol information", "Protocol Intelligence")]


def _sec_review_items(ctx):
    pi = _pi(ctx)
    if not pi:
        return [_missing("Missing, conflicting and low-confidence items", "Protocol Intelligence")]
    items = [{"label": "unresolved", "text": f"{f['label']} — {f['status']}, confidence {f['confidence_level']}: {'; '.join(f['flags'])}",
              "citations": [cite(e) for e in f["evidence"][:2]]}
             for f in pi["data"]["fields"] if f.get("needs_review") and f["verification"]["status"] != "verified"]
    return [{"heading": "Missing, conflicting and low-confidence items",
             "items": items or [{"label": "note", "text": "None outstanding.", "citations": []}]}]


def _pi_subset(keys, heading):
    def build(ctx):
        pi = _pi(ctx)
        return [_pi_fields_section(pi, keys, heading)] if pi else [_missing(heading, "Protocol Intelligence")]
    return build


def _existing(keys, heading):
    def build(ctx):
        return [_existing_section(ctx["doc_analyses"], keys, heading, ctx.get("doc_id"))]
    return build


def _sec_sample_size(ctx):
    return [_sample_size_section(ctx["artifacts"].get("sample_size", []))]


def _ep_section(name):
    def build(ctx):
        ep = _first(ctx, "endpoint_intelligence")
        if not ep:
            return [_missing("Endpoint Intelligence", "Endpoint Intelligence")]
        return _endpoint_sections(ep, [name])
    return build


def _soa_section(name):
    def build(ctx):
        soa = _first(ctx, "soa")
        if not soa:
            return [_missing("Schedule of Assessments", "Schedule of Assessments")]
        return _soa_sections(soa, [name])
    return build


def _cmp_section(name):
    def build(ctx):
        cmp = _first(ctx, "version_comparison")
        if not cmp:
            return [_missing("Amendment comparison", "Protocol Version Control comparison")]
        return _comparison_sections(cmp, [name])
    return build


def _sec_version_history(ctx):
    rows = [[v["sequence"], v["label"], v.get("amendment_number") or "—", v.get("effective_date") or "—",
             v.get("amendment_reason") or "—", (v.get("file_sha256") or "")[:12], v.get("processing_status"),
             v.get("review_status"), (v.get("created_at") or "")[:10]] for v in ctx.get("versions", [])]
    return [{"heading": "Protocol version history", "items": [
        {"label": "fact", "text": f"{len(rows)} registered version(s). Earlier versions are preserved unchanged (checksums shown).", "citations": []}],
        "table": {"columns": ["#", "Version", "Amendment", "Effective", "Reason", "SHA-256", "Processing", "Review", "Registered"], "rows": rows}}]


def _sec_protocol_review(ctx):
    pr = _first(ctx, "protocol_review")
    if not pr:
        return [_missing("Protocol Review findings", "Protocol Review")]
    d, ref = pr["data"], _artifact_ref(pr)
    sm = d["summary"]
    comp = sm["completeness"]
    items = [{"label": "fact", "text": (f"{sm['total']} findings ({sm['open']} open): " + ", ".join(f"{v} {k}" for k, v in sm["by_severity"].items())
                                         + f". Completeness: {comp['present']} of {comp['checked']} expected elements present."), "citations": [ref]}]
    for f in d["findings"]:
        label = "ai_interpretation" if f["origin"] == "ai" else ("unresolved" if f["status"] == "open" else "note")
        items.append({"label": label,
                      "text": f"{f['id']} [{f['severity']}, {f['category_label']}, {f['status']}] {f['title']}: {f['description']} "
                              f"Recommendation: {f['recommendation']}"
                              + (f" Resolution: {f['resolution']['note']}" if f.get("resolution") else ""),
                      "citations": [cite(e) for e in f["evidence"][:2]]})
    return [{"heading": "Protocol Review findings", "items": items}]


# id -> (title, artifact kinds used, existing analyses used, builder)
SECTIONS = {
    "overview": ("Extraction overview", ["protocol_intelligence"], [], _sec_overview),
    "characteristics": ("Study characteristics", ["protocol_intelligence"], [], _sec_characteristics),
    "fields": ("Structured protocol information", ["protocol_intelligence"], [], _sec_fields),
    "review_items": ("Missing, conflicting and low-confidence items", ["protocol_intelligence"], [], _sec_review_items),
    "design_facts": ("Study design (from the protocol)", ["protocol_intelligence"], [], _pi_subset(
        ["phase", "study_design", "treatment_arms", "comparator", "randomization", "blinding", "sample_size", "population",
         "study_duration", "statistical_methods"], "Study design (from the protocol)")),
    "criteria": ("Eligibility criteria (from the protocol)", ["protocol_intelligence"], [], _pi_subset(
        ["population", "inclusion_criteria", "exclusion_criteria", "sample_size", "visits"], "Eligibility criteria (from the protocol)")),
    "objectives_endpoints": ("Objectives, hypotheses and endpoints (from the protocol)", ["protocol_intelligence"], [], _pi_subset(
        ["primary_objectives", "secondary_objectives", "exploratory_objectives", "hypotheses", "primary_endpoints",
         "secondary_endpoints", "exploratory_endpoints", "unclassified_endpoints"], "Objectives, hypotheses and endpoints (from the protocol)")),
    "sample_size": ("Sample size and power", ["sample_size"], [], _sec_sample_size),
    "synopsis": ("Study synopsis (Synopsis Generator)", [], ["summary"], _existing(["summary"], "Study synopsis (Synopsis Generator)")),
    "protocol_review": ("Protocol Review findings", ["protocol_review"], [], _sec_protocol_review),
    "gap_assessment": ("Protocol Gap Assessment", [], ["gap_analysis"], _existing(["gap_analysis"], "Protocol Gap Assessment")),
    "design_optimizer": ("Study Design Optimizer", [], ["design_recommendations"], _existing(["design_recommendations"], "Study Design Optimizer")),
    "design_analyses": ("Design analyses", [], ["extraction", "design_recommendations", "gap_analysis"],
                        _existing(["extraction", "design_recommendations", "gap_analysis"], "Design analyses")),
    "eligibility_analysis": ("Eligibility and recruitment burden analysis", [], ["eligibility_review", "feasibility"],
                             _existing(["eligibility_review", "feasibility"], "Eligibility and recruitment burden analysis")),
    "feasibility_analysis": ("Feasibility assessment", [], ["feasibility"], _existing(["feasibility"], "Feasibility assessment")),
    "endpoint_register": ("Endpoint register", ["endpoint_intelligence"], [], _ep_section("endpoint_register")),
    "endpoint_hypotheses": ("Hypotheses and endpoint links", ["endpoint_intelligence"], [], _ep_section("endpoint_hypotheses")),
    "endpoint_issues": ("Endpoint issues", ["endpoint_intelligence"], [], _ep_section("endpoint_issues")),
    "endpoint_questions": ("Unresolved endpoint questions", ["endpoint_intelligence"], [], _ep_section("endpoint_questions")),
    "endpoint_sap": ("Protocol vs statistical analysis plan", ["endpoint_intelligence"], [], _ep_section("endpoint_sap")),
    "endpoint_suggestions": ("Suggested clarifications", ["endpoint_intelligence"], [], _ep_section("endpoint_suggestions")),
    "soa_summary": ("Schedule of Assessments summary", ["soa"], [], _soa_section("soa_summary")),
    "soa_timeline": ("Visit timeline", ["soa"], [], _soa_section("soa_timeline")),
    "soa_issues": ("Scheduling issues", ["soa"], [], _soa_section("soa_issues")),
    "version_history": ("Protocol version history", [], [], _sec_version_history),
    "comparison_summary": ("Comparison summary", ["version_comparison"], [], _cmp_section("comparison_summary")),
    "substantive_changes": ("Substantive changes", ["version_comparison"], [], _cmp_section("substantive_changes")),
    "impacts": ("Potential downstream impacts", ["version_comparison"], [], _cmp_section("impacts")),
}


def section_catalogue() -> dict:
    return {k: {"title": v[0], "uses": v[1] + [f"existing:{e}" for e in v[2]]} for k, v in SECTIONS.items()}


def kinds_for(section_ids: list[str]) -> list[str]:
    out = []
    for sid in section_ids:
        for k in SECTIONS[sid][1]:
            if k not in out:
                out.append(k)
    return out


def resolve_template(report_type: str | None, sections: list[str] | None, template: dict | None) -> dict:
    """The effective template: a saved custom template, or a built-in type optionally narrowed to chosen sections."""
    if template:
        ids = [x for x in template.get("sections", []) if x in SECTIONS]
        if not ids:
            raise ValueError("The template has no valid sections")
        return {"report_type": "custom", "title": template.get("title") or "Custom report", "intro": template.get("intro") or "",
                "sections": ids, "available": list(SECTIONS), "template_name": template.get("name")}
    if report_type not in REPORT_TYPES:
        raise ValueError("Unknown report type")
    spec = REPORT_TYPES[report_type]
    ids = [x for x in (sections or spec["sections"]) if x in SECTIONS] or spec["sections"]
    return {"report_type": report_type, "title": spec["title"], "intro": "", "sections": ids, "available": spec["sections"]}


def build_report(report_type: str | None, ctx: dict, sections: list[str] | None = None, template: dict | None = None) -> dict:
    """ctx: study, version, versions, artifacts {kind: [artifact dicts]}, doc_analyses, doc_id, user_id, generated_at."""
    t = resolve_template(report_type, sections, template)
    out_sections = []
    if t["intro"]:
        out_sections.append({"heading": "Introduction", "items": [{"label": "note", "text": t["intro"], "citations": []}]})
    used_existing = []
    for sid in t["sections"]:
        out_sections += SECTIONS[sid][3](ctx)
        used_existing += [e for e in SECTIONS[sid][2] if e not in used_existing]
    arts = ctx["artifacts"]
    sources = [{"artifact_id": a["id"], "kind": a["kind"], "revision": a["revision"], "status": a["status"],
                "method_version": a.get("method_version")} for lst in arts.values() for a in lst]
    present = [k for k in used_existing if ctx["doc_analyses"].get(k)]
    if present:
        sources.append({"existing_analyses": present, "document_id": ctx.get("doc_id")})
    return {
        "report_type": t["report_type"],
        "title": t["title"],
        "template": {"sections": t["sections"], "available_sections": t["available"], "name": t.get("template_name")},
        "metadata": {
            "study_id": ctx["study"]["study_code"],
            "study_title": ctx["study"]["title"],
            "protocol_version": ctx["version"]["label"],
            "protocol_version_id": ctx["version"]["id"],
            "generated_at": ctx["generated_at"],
            "generated_by": ctx["user_id"],
            "method_version": METHOD_VERSION,
            "analysis_versions": sources,
        },
        "sections": out_sections,
    }


def report_model(report: dict, status: str, revision: int) -> list:
    md = report["metadata"]
    model = [("meta", [
        ("Study ID", md["study_id"]), ("Study title", md["study_title"] or "—"),
        ("Protocol version", md["protocol_version"]), ("Generated", md["generated_at"]),
        ("Report status", f"{status.upper()} (revision {revision})"),
        ("Analysis versions", "; ".join(
            f"{s['kind']} {s['artifact_id']} rev {s['revision']} [{s['status']}] {s.get('method_version') or ''}" if "artifact_id" in s
            else f"existing analyses {', '.join(s['existing_analyses'])} (document {s['document_id']})" for s in md["analysis_versions"]) or "—"),
    ]), ("p", "Labels: [Verified source fact] verified protocol content; [Source fact – pending verification] extracted but not yet verified; "
              "[Calculated result] deterministic calculation; [AI interpretation] model-generated analysis; [Unresolved issue] requires review.")]
    for s in report["sections"]:
        model.append(("h1", s["heading"]))
        for it in s["items"]:
            model.append(("label", it["label"], it["text"], it.get("citations", [])))
        if s.get("table"):
            model.append(("table", s["table"]["columns"], s["table"]["rows"]))
    return model


# ─── Assistant ───────────────────────────────────────────────────────

_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = set("the a an of to in on for and or is are be what which how does do did was were with by at as from this that "
            "it its study protocol trial please tell me about there any".split())


def _tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall((text or "").lower()) if t not in _STOP and len(t) > 1]


def build_corpus(blocks: list[dict], artifacts: dict, doc_analyses: dict, include_existing: bool) -> list[dict]:
    corpus = []
    for b in blocks:
        corpus.append({"type": "protocol_text", "text": b["text"], "ref": cite(b)})
    pi = (artifacts.get("protocol_intelligence") or [None])[0]
    if pi:
        for f in pi["data"]["fields"]:
            if f["status"] == "not_requested":
                continue
            if f["status"] == "missing":
                corpus.append({"type": "unresolved", "text": f"{f['label']}: Not specified in the protocol.", "ref": f"PI field {f['key']}",
                               "review": f"Protocol Intelligence field '{f['label']}' (not specified in the protocol)"})
                continue
            if f["status"] in ("conflict", "ambiguous") and f["verification"]["status"] != "verified":
                alts = "; ".join(f"{a['value'] if isinstance(a['value'], str) else '; '.join(a['value'])} "
                                 f"({cite(a['evidence'][0]) if a.get('evidence') else 'no source'})" for a in f.get("alternatives", [])[:3])
                corpus.append({"type": "contradiction", "ref": f"PI field {f['key']}",
                               "text": f"{f['label']} is {f['status']} in the protocol: {'; '.join(f['flags'])}" + (f" Other values: {alts}" if alts else ""),
                               "review": f"Protocol Intelligence field '{f['label']}' at " + (cite(f["evidence"][0]) if f["evidence"] else "its source")})
            value = "; ".join(f["value"]) if isinstance(f["value"], list) else f["value"]
            corpus.append({"type": "verified_field" if f["verification"]["status"] == "verified" else "pending_field",
                           "text": f"{f['label']}: {value}", "ref": f"PI field {f['key']} ({'; '.join(cite(e) for e in f['evidence'][:2])})"})
    for a in artifacts.get("sample_size", []):
        r = a["data"]["result"]
        corpus.append({"type": "calculated", "ref": f"sample_size {a['id']} rev {a['revision']}",
                       "text": (f"Sample size scenario {a['data'].get('name') or ''}: {r['method_name']}; evaluable total {r['evaluable']['total']}, "
                                f"enrollment total {r['enrollment']['total']}; assumptions: {'; '.join(r['assumptions'])}")})
    ep = (artifacts.get("endpoint_intelligence") or [None])[0]
    if ep:
        for i in ep["data"]["issues"]:
            contradictory = i["certainty"] == "confirmed" and ("inconsistent" in i["type"] or "mismatch" in i["type"])
            corpus.append({"type": "contradiction" if contradictory and i["status"] != "resolved" else "unresolved",
                           "text": f"Endpoint issue ({i['certainty']}): {i['description']}", "ref": f"endpoint_intelligence {ep['id']} {i['id']}",
                           "review": "; ".join(cite(e) for e in i.get("evidence", [])[:2]) or f"Endpoint Intelligence issue {i['id']}"})
    pr = (artifacts.get("protocol_review") or [None])[0]
    if pr:
        for f in pr["data"]["findings"]:
            if f["status"] != "open":
                continue
            corpus.append({"type": "contradiction" if f["category"] == "consistency" else "unresolved",
                           "text": f"Protocol Review finding ({f['severity']}, {f['category_label']}): {f['title']}. {f['description']}",
                           "ref": f"protocol_review {pr['id']} {f['id']}",
                           "review": "; ".join(cite(e) for e in f["evidence"][:2]) or f"Protocol Review finding {f['id']}"})
    soa = (artifacts.get("soa") or [None])[0]
    if soa:
        for v in soa["data"]["visits"]:
            names = [a["name"] for a in soa["data"]["assessments"] if f"{a['id']}|{v['id']}" in soa["data"]["cells"]]
            corpus.append({"type": "verified_field" if soa["status"] == "approved" else "pending_field", "ref": f"soa {soa['id']} {v['id']}",
                           "text": f"Visit {v['label']} ({(v.get('timing') or {}).get('label', 'timing not specified')}): {', '.join(names)}"})
        for i in soa["data"]["issues"]:
            if i["status"] != "resolved":
                corpus.append({"type": "unresolved", "text": f"Scheduling issue: {i['description']}", "ref": f"soa {soa['id']} {i['id']}"})
    cmp = (artifacts.get("version_comparison") or [None])[0]
    if cmp:
        t = cmp["data"]["totals"]
        corpus.append({"type": "calculated", "ref": f"version_comparison {cmp['id']}",
                       "text": f"Amendment comparison {cmp['data']['base_label']} to {cmp['data']['target_label']}: {t['added']} added, {t['removed']} removed, {t['modified']} modified sections content; impact areas: {', '.join(a['label'] for a in cmp['data']['impact_areas'])}"})
    if include_existing:
        for k, text in doc_analyses.items():
            if k in EXISTING_LABELS and isinstance(text, str):
                for chunk in re.split(r"\n(?=#)", text):
                    if chunk.strip():
                        corpus.append({"type": "ai_analysis", "text": chunk.strip()[:1500], "ref": f"{EXISTING_LABELS[k]} output"})
    return corpus


def retrieve(question: str, corpus: list[dict], k: int = 10) -> list[tuple[float, dict]]:
    """BM25 ranking over the study corpus."""
    q = _tokens(question)
    if not q or not corpus:
        return []
    docs = [_tokens(c["text"]) for c in corpus]
    n = len(docs)
    avg = sum(len(d) for d in docs) / n or 1
    df = Counter(t for d in docs for t in set(d))
    scored = []
    for d, c in zip(docs, corpus):
        tf = Counter(d)
        s = 0.0
        for t in q:
            if t not in tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * tf[t] * 2.2 / (tf[t] + 1.2 * (0.25 + 0.75 * len(d) / avg))
        if s > 0:
            matched = len(set(q) & set(d)) / len(set(q))
            scored.append((s * (0.5 + matched), c))
    scored.sort(key=lambda x: -x[0])
    return scored[:k]


CATEGORY_BY_TYPE = {
    "protocol_text": "source_fact_pending", "pending_field": "source_fact_pending", "verified_field": "verified_fact",
    "calculated": "calculated_result", "ai_analysis": "ai_interpretation", "unresolved": "unresolved_issue",
    "contradiction": "unresolved_issue",
}
ASSISTANT_PROMPT = """You answer questions about ONE clinical study using ONLY the numbered evidence provided.
Return JSON: {"answer": "<concise answer with [E#] citations after each factual statement>",
"claims": [{"text": "...", "citations": ["E1"], "interpretation": false}],
"limitations": "<what is missing, unclear or contradictory, or empty>"}
Rules:
- Every factual statement must cite evidence ids that support it. Never cite ids that are not listed.
- If the evidence does not answer the question, say so plainly in "answer", leave "claims" empty and explain in "limitations".
- Never invent protocol details, numbers, citations or analyses that are not in the evidence.
- Mark a claim "interpretation": true when it goes beyond restating the evidence.
- If evidence items contradict each other, report the contradiction and cite both."""


def _review_items(question: str, hits: list[tuple[float, dict]], corpus: list[dict]) -> list[dict]:
    """Contradictory or missing evidence relevant to the question, each with the source that needs review."""
    items = []
    for _, c in hits:
        if c["type"] == "contradiction":
            items.append({"type": "contradictory", "detail": _quote(c["text"], 400), "source_to_review": c.get("review") or c["ref"]})
        elif c["type"] == "unresolved" and c.get("review") and "not specified" in c["text"].lower():
            items.append({"type": "missing", "detail": c["text"], "source_to_review": c["review"]})
    # Two verified/pending field statements that share a label but state different values
    seen = {}
    for _, c in hits:
        if c["type"] in ("verified_field", "pending_field") and ":" in c["text"]:
            label, value = c["text"].split(":", 1)
            if label in seen and seen[label][0].strip().lower() != value.strip().lower():
                items.append({"type": "contradictory", "detail": f"Different values for {label}: '{_quote(seen[label][0], 120)}' vs '{_quote(value, 120)}'",
                              "source_to_review": f"{seen[label][1]} and {c['ref']}"})
            seen.setdefault(label, (value, c["ref"]))
    if not hits:
        missing = [c for c in retrieve(question, [c for c in corpus if c["type"] == "unresolved"], k=3)]
        for _, c in missing:
            if c.get("review"):
                items.append({"type": "missing", "detail": c["text"], "source_to_review": c["review"]})
        if not items:
            items.append({"type": "missing", "detail": "No passage of the selected protocol version or saved analyses matches the question.",
                          "source_to_review": "The source protocol document (relevant section not found by search)"})
    out, keys = [], set()
    for it in items:
        k = (it["type"], it["source_to_review"])
        if k not in keys:
            keys.add(k)
            out.append(it)
    return out[:6]


def _limitations_text(base: str, review_items: list[dict]) -> str:
    parts = [base] if base else []
    for it in review_items:
        parts.append(f"{'Contradictory' if it['type'] == 'contradictory' else 'Missing'} evidence: {it['detail']} — review {it['source_to_review']}.")
    return " ".join(parts)


async def answer(question: str, corpus: list[dict], min_score: float = 1.0) -> dict:
    hits = [h for h in retrieve(question, corpus) if h[0] >= min_score]
    evidence = [{"id": f"E{i + 1}", "type": c["type"], "ref": c["ref"], "text": _quote(c["text"], 900), "score": round(s, 2)}
                for i, (s, c) in enumerate(hits)]
    review_items = _review_items(question, hits, corpus)
    if not evidence:
        return {"outcome": "insufficient_evidence", "answer": (
            "The selected protocol version and saved analyses do not contain information that answers this question. "
            "Nothing has been inferred; consider checking the source protocol or running the relevant DESIGN capability."),
            "claims": [], "evidence": [], "review_items": review_items,
            "limitations": _limitations_text("No relevant evidence retrieved.", review_items)}
    if not ai_available():
        return {"outcome": "evidence_only", "answer": "The AI assistant is not configured (no API key). The most relevant study evidence is listed below.",
                "claims": [], "evidence": evidence, "review_items": review_items,
                "limitations": _limitations_text("Answer synthesis unavailable.", review_items)}
    payload = "\n\n".join(f"[{e['id']}] ({e['type']}; {e['ref']}) {e['text']}" for e in evidence)
    raw = await chat_completion_json(ASSISTANT_PROMPT, f"QUESTION: {question}\n\nEVIDENCE:\n{payload}", max_tokens=2000)
    ids = {e["id"]: e for e in evidence}
    claims, unsupported = [], []
    for c in raw.get("claims") or []:
        if not isinstance(c, dict) or not c.get("text"):
            continue
        cits = [x for x in (c.get("citations") or []) if x in ids]
        if not cits:
            unsupported.append(str(c["text"]))
            continue
        types = {ids[x]["type"] for x in cits}
        if c.get("interpretation") or "ai_analysis" in types:
            category = "ai_interpretation"
        elif "unresolved" in types or "contradiction" in types:
            category = "unresolved_issue"
        elif "calculated" in types:
            category = "calculated_result"
        elif types <= {"verified_field"}:
            category = "verified_fact"
        else:
            category = "source_fact_pending"
        claims.append({"text": str(c["text"]), "citations": cits, "category": category})
    text = str(raw.get("answer") or "")
    invalid = sorted(set(re.findall(r"\[(E\d+)\]", text)) - set(ids))
    for bad in invalid:
        text = text.replace(f"[{bad}]", "[citation removed]")
    limitations = str(raw.get("limitations") or "")
    if unsupported:
        limitations = (limitations + " " if limitations else "") + f"{len(unsupported)} statement(s) without valid citations were removed."
    if invalid:
        limitations = (limitations + " " if limitations else "") + f"Invalid citation ids removed: {', '.join(invalid)}."
    outcome = "answered" if claims else "insufficient_evidence"
    return {"outcome": outcome, "answer": text, "claims": claims, "evidence": evidence, "review_items": review_items,
            "limitations": _limitations_text(limitations, review_items)}


def assistant_payload_for_audit(result: dict) -> dict:
    return {"outcome": result["outcome"], "evidence_count": len(result["evidence"]), "claims": len(result["claims"])}

