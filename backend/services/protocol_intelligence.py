"""
Protocol Intelligence
Turns processed protocol blocks into a fixed field schema. Every value carries source evidence
(block, page, section, quote), a confidence score and flags. Rule-based extraction always runs;
AI extraction runs when configured and is accepted only with evidence that exists in the source.
Missing information is reported as "Not specified" and never filled in.
"""

import re
from difflib import SequenceMatcher

from services.openai_service import ai_available, chat_completion_json

METHOD_VERSION = "protocol-intelligence/1.1"
NOT_SPECIFIED = "Not specified"
NOT_REQUESTED = "Not extracted (excluded by extraction preferences)"
AI_CHAR_BUDGET = 100000
DEFAULT_REVIEW_THRESHOLD = 0.8

# key, label, category, multi-valued, section/label pattern
FIELD_SPECS = [
    ("study_title", "Study title", "Study identification", False, r"(protocol|study|full|official)?\s*title"),
    ("sponsor", "Sponsor", "Study identification", False, r"sponsor"),
    ("phase", "Study phase", "Design", False, r"(study |clinical )?phase"),
    ("study_design", "Study design", "Design", False, r"(study design|overall (study )?design|trial design|general design|design of the study|investigational plan)"),
    ("primary_objectives", "Primary objectives", "Objectives", True, r"primary objectives?"),
    ("secondary_objectives", "Secondary objectives", "Objectives", True, r"secondary objectives?"),
    ("exploratory_objectives", "Exploratory objectives", "Objectives", True, r"(exploratory|tertiary|other) objectives?"),
    ("hypotheses", "Study hypotheses", "Objectives", False, r"(study |statistical )?hypothes[ie]s"),
    ("population", "Study population", "Population", False, r"((study|target|patient|subject) population|selection of (the )?(study )?(population|subjects|patients)|study subjects|subject selection)"),
    ("sample_size", "Planned sample size", "Population", False, r"(sample size|number of (participants|subjects|patients)|planned enrol?lment)"),
    ("treatment_arms", "Treatment arms", "Design", True, r"(treatment (arms|groups|cohorts)|study arms|arms|(study |dose |dosing )?cohorts|dose (levels|groups)|study treatments?( administered)?|treatments? administered|study interventions?|investigational (medicinal )?products?)"),
    ("comparator", "Comparator", "Design", False, r"(comparator|control (group|arm)|reference therapy)"),
    ("randomization", "Randomization", "Design", False, r"randomi[sz]ation"),
    ("blinding", "Blinding", "Design", False, r"(blinding|masking)"),
    ("inclusion_criteria", "Inclusion criteria", "Eligibility", True, r"inclusion criteria"),
    ("exclusion_criteria", "Exclusion criteria", "Eligibility", True, r"exclusion criteria"),
    ("primary_endpoints", "Primary endpoints", "Endpoints", True, r"primary (efficacy )?(end ?points?|outcomes?( measures?)?)"),
    ("secondary_endpoints", "Secondary endpoints", "Endpoints", True, r"secondary (efficacy )?(end ?points?|outcomes?( measures?)?)"),
    ("exploratory_endpoints", "Exploratory endpoints", "Endpoints", True, r"(exploratory|tertiary) (end ?points?|outcomes?)"),
    ("unclassified_endpoints", "Endpoints (priority not stated)", "Endpoints", True, r"((pharmacokinetic|pharmacodynamic|efficacy|study|clinical|pk|pd) (end ?points?|outcomes?)|end ?points?|outcome measures?)"),
    ("assessment_methods", "Measurement and assessment methods", "Endpoints", True, r"((efficacy|pharmacokinetic|pharmacodynamic|clinical) (assessments?|evaluations?|measurements?)|study assessments?( and procedures)?|assessments? and procedures|assessment methods)"),
    ("visits", "Study visits", "Schedule", True, r"(study visits?|visit schedule|schedule of (visits|activities|assessments|events)|study procedures by visit)"),
    ("study_duration", "Study duration", "Schedule", False, r"(study duration|duration of (the )?(study|participation|treatment)|total duration)"),
    ("safety_assessments", "Safety assessments", "Safety & statistics", True, r"safety (assessments?|evaluations?|monitoring|variables|parameters|measurements)"),
    ("statistical_methods", "Statistical methods", "Safety & statistics", False, r"(statistical (methods|analysis|analyses|considerations)|statistics)"),
]
SPEC = {s[0]: s for s in FIELD_SPECS}

# Headings that match a field pattern but describe something else (analysis plans, drug supply, ...)
EXCLUDE_HEADINGS = {
    "primary_endpoints": r"analys|statistic|power|sample size",
    "secondary_endpoints": r"analys|statistic|power|sample size",
    "exploratory_endpoints": r"analys|statistic|power|sample size",
    "unclassified_endpoints": r"primary|secondary|exploratory|tertiary|analys|statistic|objective",
    "treatment_arms": r"identity|packag|stor|label|accountab|supply|handling|dispens|preparation|destruction|description|formulation|assign|method",
    "safety_assessments": r"analys|statistic",
    "hypotheses": r"background|introduction|rationale",
    "study_design": r"rationale|justification",
}
BACKGROUND = re.compile(r"background|introduction|rationale|literature|nonclinical|non-clinical|previous", re.I)
VISIT_LIKE = re.compile(r"\b(visit|screening|baseline|day|week|month|follow[- ]?up|end of (treatment|study)|randomi[sz]ation|discharge|termination|v\d+)\b", re.I)

PER_GROUP = re.compile(r"\b(each|per)\s+(co\s?hort|arm|group|dose|dosing|site|country)|in each\b", re.I)


def _in_parentheses(text: str, pos: int) -> bool:
    """True when pos sits inside an open parenthesis of its sentence (a breakdown such as '(14 HD, 8 healthy)')."""
    if pos > 0 and text[pos - 1] == "(" and re.match(r"[\d,]+\)", text[pos:]):
        return False  # "Forty (40)": a number restated in brackets is not a breakdown
    sentence_start = max(text.rfind(". ", 0, pos), 0)
    before = text[sentence_start:pos]
    return before.count("(") > before.count(")")


def _joined_count(text: str, pos: int) -> bool:
    """True for the second group of a breakdown such as '14 HD subjects and 8 healthy subjects'."""
    return bool(re.search(r"\d+\s+(?:[A-Za-z-]+\s+){0,3}(?:participants|subjects|patients|volunteers)\s*(?:and|,|plus|\+)\s*$",
                          text[max(0, pos - 60):pos], re.I))


def planned_total(text: str) -> str | None:
    """The planned number of participants in a statement, skipping per-cohort and parenthesised breakdowns."""
    for m in re.finditer(r"\(?(?<![\w,-])(\d{1,3}(?:,\d{3})+|\d+)\)?\s+(?:[a-zA-Z-]+\s+){0,3}(?:participants|subjects|patients|volunteers)", text, re.I):
        if _in_parentheses(text, m.start(1)) and not text[m.start(1) - 1:m.start(1)] == "(":
            continue
        if PER_GROUP.search(text[m.end():m.end() + 30]):
            continue
        return m.group(1).replace(",", "")
    return None
ENDPOINT_KEYS = ("primary_endpoints", "secondary_endpoints", "exploratory_endpoints", "unclassified_endpoints")

# Extraction preference groups (the field categories)
FIELD_GROUPS = sorted({s[2] for s in FIELD_SPECS})


# ─── Text helpers ────────────────────────────────────────────────────

def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, norm(a), norm(b)).ratio()


def _strip_numbering(heading: str) -> str:
    return re.sub(r"^\s*(\d+(\.\d+)*\.?|[A-Z]\.|[IVX]+\.)\s+", "", heading or "").strip()


def _quote(text: str, limit: int = 300) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + " …"


def evidence(block: dict, quote: str | None = None, verified: bool = True) -> dict:
    return {
        "block_id": block["id"],
        "page": block.get("page"),
        "section": block.get("section"),
        "quote": _quote(quote if quote is not None else block["text"]),
        "verified": verified,
    }


def _split_items(text: str) -> list[str]:
    parts = [p.strip(" ;•-–\t") for p in re.split(r"\n+", text) if p.strip(" ;•-–\t")]
    if len(parts) == 1:
        numbered = re.split(r"\s(?=\(?\d{1,2}[\.\)]\s)", parts[0])
        if len(numbered) > 1:
            parts = [p.strip() for p in numbered if p.strip()]
    return [re.sub(r"^\(?\d{1,2}[\.\)]\s*", "", p).strip() for p in parts]


def find_quote(blocks: list[dict], quote: str, prefer_id: str | None = None) -> dict | None:
    """Locate a quote in the source blocks (normalised containment). Returns the block or None."""
    q = norm(quote)
    if len(q) < 4:
        return None
    by_id = {b["id"]: b for b in blocks}
    if prefer_id in by_id and q in norm(by_id[prefer_id]["text"]):
        return by_id[prefer_id]
    for b in blocks:
        if q in norm(b["text"]):
            return b
    return None


# ─── Rule-based candidates ───────────────────────────────────────────

def heading_level(text: str) -> int | None:
    """Numbering depth of a heading ('5' -> 1, '5.1.2' -> 3); None when un-numbered."""
    m = re.match(r"^\s*(\d+(?:\.\d+)*)\.?\s+\S", text or "")
    return len(m.group(1).split(".")) if m else None


def _section_blocks(blocks: list[dict], pattern: str, exclude: str | None = None) -> list[tuple[dict, list[dict]]]:
    """Headings matching the pattern, each with the content under it including numbered sub-sections."""
    out = []
    rx = re.compile(pattern, re.I)
    ex = re.compile(exclude, re.I) if exclude else None
    for i, b in enumerate(blocks):
        if b["kind"] != "heading":
            continue
        title = _strip_numbering(b["text"])
        if len(title.split()) > 12 or not rx.search(title) or (ex and ex.search(title)):
            continue
        level = heading_level(b["text"])
        body = []
        for nb in blocks[i + 1:]:
            if nb["kind"] == "heading":
                nl = heading_level(nb["text"])
                # Deeper-numbered headings (5.1.1 under 5.1) belong to this section
                if level is None or nl is None or nl <= level:
                    break
                continue
            if nb["kind"] != "toc":
                body.append(nb)
            if len(body) >= 150:
                break
        if body:
            out.append((b, body))
    return out


def _label_candidates(blocks: list[dict], pattern: str, multi: bool, exclude: str | None = None) -> list[dict]:
    """'Label: value' paragraphs and two-column 'Label | value' table rows (typical synopsis layout)."""
    prefix = r"(?:planned|total|target|overall|proposed|expected)?\s*"
    rx_cell = re.compile(rf"^\s*{prefix}{pattern}\s*:?\s*$", re.I)
    rx_inline = re.compile(rf"^\s*{prefix}{pattern}\s*[:\-–]\s*(.{{3,}})$", re.I | re.S)
    ex = re.compile(exclude, re.I) if exclude else None
    cands = []
    for b in blocks:
        if b["kind"] == "table":
            for row in b.get("table", []):
                if len(row) >= 2 and rx_cell.match(row[0] or "") and not (ex and ex.search(row[0])) and any(c.strip() for c in row[1:]):
                    value = next(c for c in row[1:] if c.strip())
                    cands.append({"value": _split_items(value) if multi else value.strip(),
                                  "evidence": [evidence(b, value)], "method": "label", "score": 0.85})
        elif b["kind"] in ("paragraph", "list_item"):
            m = rx_inline.match(b["text"])
            if m and not (ex and ex.search(b["text"].split(":")[0])):
                value = m.group(m.lastindex).strip()
                cands.append({"value": _split_items(value) if multi else value,
                              "evidence": [evidence(b, b["text"])], "method": "label", "score": 0.85})
    return cands


def _section_candidates(blocks: list[dict], pattern: str, multi: bool, key: str = "", exclude: str | None = None) -> list[dict]:
    cands = []
    for heading, body in _section_blocks(blocks, pattern, exclude):
        if multi:
            items = [b for b in body if b["kind"] == "list_item"] or [b for b in body if b["kind"] == "paragraph"]
            items = [b for b in items if len(b["text"]) > 3]
            if key == "visits":
                # Only visit-like entries; narrative paragraphs describing procedures are not visits
                items = [b for b in items if len(b["text"]) < 150 and VISIT_LIKE.search(b["text"])]
            elif key == "assessment_methods":
                items = items[:25]
            if not items:
                continue
            values = [re.sub(r"^(\d{1,2}[\.\)]|[a-z][\.\)]|[•\-–▪●○◦])\s*", "", b["text"]).strip() for b in items]
            cands.append({"value": values, "evidence": [dict(evidence(b), item=i) for i, b in enumerate(items)],
                          "method": "section", "score": 0.8, "heading": heading["text"]})
        else:
            paras = [b for b in body if b["kind"] in ("paragraph", "list_item")][:3]
            if key == "blinding":
                paras = [b for b in body if re.search(r"blind|mask|open[- ]label", b["text"], re.I)][:2]
            elif key == "randomization":
                paras = [b for b in body if re.search(r"randomi[sz]", b["text"], re.I)][:2]
            if not paras:
                continue
            value = " ".join(b["text"] for b in paras)
            if len(value) > 900:
                value = _quote(value, 900)
            cands.append({"value": value, "evidence": [evidence(b) for b in paras],
                          "method": "section", "score": 0.75, "heading": heading["text"]})
    return cands


_PHASE_RX = re.compile(r"\bphase\s*(1|2|3|4|i{1,3}|iv)\s*([ab])?(?:\s*/\s*(1|2|3|4|i{1,3}|iv)\s*([ab])?)?\b", re.I)
_ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4"}


def _phase_norm(m) -> str:
    def one(n, s):
        return "Phase " + _ROMAN.get(n.lower(), n) + (s or "").lower()
    first = one(m.group(1), m.group(2))
    if m.group(3):
        return first + "/" + _ROMAN.get(m.group(3).lower(), m.group(3)) + (m.group(4) or "").lower()
    return first


def _pattern_candidates(key: str, blocks: list[dict]) -> list[dict]:
    cands = []
    head = blocks[:60]  # title page and synopsis carry the design statements
    if key == "phase":
        for b in head:
            for m in _PHASE_RX.finditer(b["text"]):
                cands.append({"value": _phase_norm(m), "evidence": [evidence(b, m.group(0))], "method": "pattern", "score": 0.7})
    elif key == "sample_size":
        rx = re.compile(r"(?:approximately|a total of|total of|up to|about)?\s*(?:[A-Za-z-]+\s+)?\(?(?<![\w,-])(\d{1,3}(?:,\d{3})*|\d{1,6})\)?\s+"
                        r"(?:adult |eligible |evaluable |healthy |male |female )*(?:participants|subjects|patients|volunteers)\s+"
                        r"(?:\([^)]*\)\s+)?(?:will be|are planned to be|are to be|to be)\s+(?:\w+\s+){0,2}(?:randomi[sz]ed|enrolled|recruited)", re.I)
        for b in blocks:
            for m in rx.finditer(b["text"]):
                context = b["text"][max(0, m.start() - 60):m.end() + 40]
                if PER_GROUP.search(context) or _in_parentheses(b["text"], m.start(1)) or _joined_count(b["text"], m.start(1)):
                    continue
                cands.append({"value": m.group(1).replace(",", ""), "evidence": [evidence(b, m.group(0).strip())],
                              "method": "pattern", "score": 0.75})
    elif key == "blinding":
        rx = re.compile(r"\b(double[- ]blind(?:ed)?|single[- ]blind(?:ed)?|triple[- ]blind(?:ed)?|open[- ]label|observer[- ]blind(?:ed)?|assessor[- ]blind(?:ed)?)\b", re.I)
        for b in head:
            for m in rx.finditer(b["text"]):
                v = m.group(1).lower().replace(" ", "-").replace("blinded", "blind")
                # The explicit design term outranks a blinding section's procedural text
                cands.append({"value": v, "evidence": [evidence(b, m.group(0))], "method": "pattern", "score": 0.8})
    elif key == "randomization":
        rx = re.compile(r"[^.]*\brandomi[sz]ed\b[^.]*?\b(\d+\s*:\s*\d+(?:\s*:\s*\d+)*)[^.]*\.?", re.I)
        for b in blocks:
            m = rx.search(b["text"])
            if m:
                cands.append({"value": m.group(0).strip(), "evidence": [evidence(b, m.group(0).strip())],
                              "method": "pattern", "score": 0.7, "ratio": re.sub(r"\s", "", m.group(1))})
                break
    elif key == "comparator":
        rx = re.compile(r"[^.]*\b(matching placebo|placebo[- ]controlled|versus placebo|vs\.? placebo|or (?:matching )?placebo|"
                        r"active comparator|active[- ]controlled|standard of care)\b[^.]*\.", re.I)
        for b in head:
            m = rx.search(b["text"])
            if m:
                cands.append({"value": m.group(0).strip(), "evidence": [evidence(b, m.group(0).strip())], "method": "pattern", "score": 0.6})
                break
    elif key == "study_duration":
        rx = re.compile(r"[^.]*\b(duration|last|participate)\b[^.]*\b\d+\s*(weeks?|months?|years?|days?)\b[^.]*\.", re.I)
        for b in head:
            m = rx.search(b["text"])
            if m:
                cands.append({"value": m.group(0).strip(), "evidence": [evidence(b, m.group(0).strip())], "method": "pattern", "score": 0.6})
                break
    elif key == "hypotheses":
        rx = re.compile(r"[^.]*\bhypothes[ie]s\b[^.]*\.", re.I)
        for b in blocks:
            if BACKGROUND.search(b.get("section") or ""):
                continue  # background discussion of a scientific "hypothesis" is not the study hypothesis
            m = rx.search(b["text"])
            if m and b["kind"] != "heading":
                cands.append({"value": m.group(0).strip(), "evidence": [evidence(b, m.group(0).strip())], "method": "pattern", "score": 0.6})
                break
    elif key == "study_title":
        for i, b in enumerate(blocks[:15]):
            if b["kind"] in ("heading", "paragraph") and 6 <= len(b["text"].split()) <= 45 and re.search(
                    r"\b(study|trial)\b", b["text"], re.I):
                # A leading title-style heading is the usual title position
                score = 0.7 if i == 0 and b["kind"] == "heading" else 0.55
                cands.append({"value": b["text"], "evidence": [evidence(b)], "method": "pattern", "score": score})
                break
    elif key == "visits":
        from services.soa_engine import generate_from_tables  # local import: soa_engine depends on this module
        matrix = generate_from_tables(blocks)
        if matrix and matrix["visits"]:
            by_id = {b["id"]: b for b in blocks}
            values, evs = [], []
            for i, v in enumerate(matrix["visits"]):
                values.append(v["label"])
                evs.append(dict(evidence(by_id[v["source"]["block_id"]], v["label"]), item=i))
            cands.append({"value": values, "evidence": evs, "method": "table", "score": 0.85})
    return cands


def rule_candidates(key: str, blocks: list[dict]) -> list[dict]:
    _, _, _, multi, pattern = SPEC[key]
    exclude = EXCLUDE_HEADINGS.get(key)
    blocks = [b for b in blocks if b["kind"] != "toc"]
    cands = (_label_candidates(blocks, pattern, multi, exclude)
             + _section_candidates(blocks, pattern, multi, key, exclude)
             + _pattern_candidates(key, blocks))
    if key == "unclassified_endpoints":
        # Separate endpoint sections (PK, PD, ...) complement each other: combine them into one list
        sections = [c for c in cands if c["method"] == "section"]
        if len(sections) > 1:
            values, evs, seen = [], [], set()
            for c in sections:
                for i, v in enumerate(c["value"]):
                    if norm(v) in seen:
                        continue
                    seen.add(norm(v))
                    ev = next((e for e in c["evidence"] if e.get("item") == i), c["evidence"][0])
                    evs.append(dict(ev, item=len(values)))
                    values.append(v)
            cands = [c for c in cands if c["method"] != "section"] + [
                {"value": values, "evidence": evs, "method": "section", "score": 0.7}]
    if key in ENDPOINT_KEYS and key != "unclassified_endpoints" and not cands:
        # Some protocols state endpoints only inside the analysis section; use it, flagged for review
        for c in _section_candidates(blocks, pattern, multi, key, None):
            cands.append({**c, "score": 0.5, "fallback": "Taken from an analysis section; confirm the endpoint definition"})
    return cands


# ─── AI candidates ───────────────────────────────────────────────────

AI_PROMPT = """You extract structured information from a clinical trial protocol.
The protocol is given as numbered blocks: [block_id | page | section] text.

Return a JSON object: {"fields": {<field_key>: {"value": ..., "evidence": [{"block_id": "...", "quote": "..."}], "ambiguous": false, "note": ""}}}

Field keys and expected value types:
%s

Rules:
- Use ONLY information stated in the blocks. Never infer, guess or use outside knowledge.
- If a field is not stated, set "value" to null and "evidence" to [].
- "quote" must be copied verbatim from the cited block (a short exact substring, max 200 characters).
- For list fields return a list of strings, one per item, with one evidence entry per item in the same order.
- Set "ambiguous" true and explain in "note" when the protocol is unclear or states conflicting values."""


def _ai_field_list(keys: list[str] | None = None) -> str:
    return "\n".join(f'- {k} ({"list of strings" if multi else "string"}): {label}'
                     for k, label, _, multi, _ in FIELD_SPECS if not keys or k in keys)


def _blocks_for_ai(blocks: list[dict], keys: list[str] | None = None, scope: str = "full") -> tuple[str, bool]:
    """Pack blocks within the AI budget: title pages and field-relevant sections first, then the rest
    (scope "full") in document order. Returns the payload and whether a relevant section was left out."""
    blocks = [b for b in blocks if b["kind"] != "toc"]
    keys = keys or [k for k, *_ in FIELD_SPECS]
    relevant_rx = re.compile("|".join(f"(?:{SPEC[k][4]})" for k in keys), re.I)
    # Title pages and synopsis (first pages, or first blocks of unpaginated DOCX) plus sections relevant to the fields
    relevant = {b["id"] for i, b in enumerate(blocks)
                if (b.get("page") is not None and b["page"] <= 5) or (b.get("page") is None and i < 60)
                or relevant_rx.search(_strip_numbering(b.get("section") or ""))}
    pools = [[b for b in blocks if b["id"] in relevant]]
    if scope == "full":
        pools.append([b for b in blocks if b["id"] not in relevant])
    chosen, total, truncated = set(), 0, False
    for pool in pools:
        for b in pool:
            size = len(b["text"]) + 60
            if total + size > AI_CHAR_BUDGET:
                truncated = truncated or b["id"] in relevant
                continue
            chosen.add(b["id"])
            total += size
    lines = [f"[{b['id']} | p.{b.get('page') or '-'} | {(b.get('section') or '')[:60]}] {b['text']}"
             for b in blocks if b["id"] in chosen]
    return "\n".join(lines), truncated


async def ai_candidates(blocks: list[dict], language: str = "en", keys: list[str] | None = None,
                        scope: str = "full") -> tuple[dict, dict]:
    """Returns ({key: candidate}, meta). Evidence quotes are checked against the source blocks."""
    keys = keys or [k for k, *_ in FIELD_SPECS]
    payload, truncated = _blocks_for_ai(blocks, keys, scope)
    raw = await chat_completion_json(
        AI_PROMPT % _ai_field_list(keys),
        f"Document language: {language}\n\nPROTOCOL BLOCKS:\n{payload}",
    )
    fields = raw.get("fields", {}) if isinstance(raw, dict) else {}
    out = {}
    for key in keys:
        f = fields.get(key)
        if not isinstance(f, dict):
            continue
        value = f.get("value")
        multi = SPEC[key][3]
        if multi:
            if isinstance(value, str):
                value = [value]
            value = [str(v).strip() for v in (value or []) if str(v).strip()]
        else:
            value = str(value).strip() if value not in (None, "", []) else ""
        if not value or (not multi and norm(value) in ("not specified", "null", "none", "n a")):
            continue
        if key == "phase":
            value = conflict_key("phase", value) or value
        evs, all_found = [], True
        for i, ev in enumerate(f.get("evidence") or []):
            if not isinstance(ev, dict):
                continue
            quote = str(ev.get("quote") or "")
            block = find_quote(blocks, quote, ev.get("block_id"))
            if block:
                e = evidence(block, quote, verified=True)
            else:
                all_found = False
                e = {"block_id": ev.get("block_id"), "page": None, "section": None, "quote": _quote(quote), "verified": False}
            if multi:
                e["item"] = i
            evs.append(e)
        if not evs:
            all_found = False
        out[key] = {"value": value, "evidence": evs, "method": "ai", "evidence_verified": all_found,
                    "ambiguous": bool(f.get("ambiguous")), "note": str(f.get("note") or "")}
    return out, {"truncated": truncated}


# ─── Merge into field records ────────────────────────────────────────

def _level(conf: float) -> str:
    return "high" if conf >= 0.8 else "medium" if conf >= 0.6 else "low"


def _distinct(values: list[str]) -> list[str]:
    seen, out = set(), []
    for v in values:
        n = norm(v)
        if n and n not in seen:
            seen.add(n)
            out.append(v)
    return out


def _values_agree(a, b) -> bool:
    if isinstance(a, list) or isinstance(b, list):
        a_s = " ".join(a) if isinstance(a, list) else a
        b_s = " ".join(b) if isinstance(b, list) else b
        return similarity(a_s, b_s) >= 0.5
    na, nb = norm(a), norm(b)
    if na == nb or na in nb or nb in na:
        return True
    nums_a, nums_b = re.findall(r"\d+", na), re.findall(r"\d+", nb)
    if nums_a and nums_b and set(nums_a) & set(nums_b) and similarity(a, b) > 0.3:
        return True
    return similarity(a, b) >= 0.6


def conflict_key(key: str, value: str) -> str | None:
    """Comparable core of an explicit value: 'Phase 3', '240', 'double-blind'."""
    if key == "phase":
        m = _PHASE_RX.search(value) or _PHASE_RX.search("phase " + value)
        return _phase_norm(m) if m else None
    if key == "sample_size":
        # The number attached to subjects/participants; numbers inside codes (XYZ-123,001), per-cohort
        # counts and parenthesised breakdowns are not the planned total
        total = planned_total(value)
        if total:
            return total
        if re.search(r"subjects|participants|patients|volunteers", value, re.I):
            return None
        m = re.search(r"(?<![\w,-])(\d{1,3}(?:,\d{3})+|\d+)(?![\w,-])", value)
        return m.group(1).replace(",", "") if m else None
    if key == "blinding":
        m = re.search(r"(double|single|triple|observer|assessor)[- ]blind|open[- ]label", value, re.I)
        return m.group(0).lower().replace(" ", "-") if m else None
    return value


def _lists_consistent(lists: list[dict]) -> bool:
    """True when every shorter list's wording is contained in the longest one (e.g. a synopsis that
    summarises the same criteria in one cell). Different content is a genuine conflict."""
    longest = max(lists, key=lambda c: len(" ".join(c["value"])))
    ref = set(norm(" ".join(longest["value"])).split())
    for c in lists:
        if c is longest:
            continue
        words = set(norm(" ".join(c["value"])).split())
        if not words or len(words & ref) / len(words) < 0.8:
            return False
    return True


def build_field(key: str, rules: list[dict], ai: dict | None, threshold: float = DEFAULT_REVIEW_THRESHOLD) -> dict:
    _, label, category, multi, _ = SPEC[key]
    flags, alternatives = [], []
    status = "extracted"

    # List fields prefer verbatim per-item sources (SoA table, dedicated section) over synopsis summaries
    method_rank = {"table": 3, "section": 2, "label": 1, "pattern": 0} if multi else {}
    rules = sorted(rules, key=lambda c: (-method_rank.get(c["method"], 0), -c["score"],
                                         -(len(c["value"]) if isinstance(c["value"], list) else 0)))
    best_rule = rules[0] if rules else None

    # Conflicting explicit values (e.g. two different phases or sample sizes) are surfaced, not resolved
    if key in ("phase", "sample_size", "blinding") and rules:
        keyed = [(conflict_key(key, c["value"]), c) for c in rules]
        distinct = _distinct([k for k, _ in keyed if k])
        if len(distinct) > 1:
            status = "conflict"
            flags.append(f"Conflicting values found in the protocol: {', '.join(distinct)}")
            best_key = conflict_key(key, best_rule["value"])
            for k, c in keyed:
                if k and norm(k) != norm(best_key or ""):
                    alternatives.append({"value": c["value"], "evidence": c["evidence"], "source": "rule"})
    if multi and len(rules) > 1:
        lists = [c for c in rules if c["method"] in ("section", "label") and isinstance(c["value"], list)]
        counts = {len(c["value"]) for c in lists}
        if len(counts) > 1 and not _lists_consistent(lists):
            status = "conflict"
            where = "; ".join(f"{len(c['value'])} items at {c['evidence'][0].get('section') or c['evidence'][0]['block_id']}" for c in lists)
            flags.append(f"Lists differ between protocol sections ({where})")
            best_rule = max(lists, key=lambda c: (c["method"] == "section", len(c["value"])))
            for c in lists:
                if c is not best_rule:
                    alternatives.append({"value": c["value"], "evidence": c["evidence"], "source": "rule"})

    chosen, source, conf = None, None, 0.0
    if ai and best_rule:
        agree = _values_agree(ai["value"], best_rule["value"])
        # List fields keep the verbatim section items; single fields prefer the AI value when its evidence checks out
        if multi or not ai["evidence_verified"]:
            chosen, other = best_rule, ai
        else:
            chosen, other = ai, best_rule
        source = "rule+ai"
        if agree:
            conf = 0.92 if ai["evidence_verified"] else 0.8
        else:
            conf = 0.55
            if status != "conflict":
                status = "conflict"
            flags.append("Rule-based and AI extraction disagree; review both candidates")
            alternatives.append({"value": other["value"], "evidence": other["evidence"],
                                 "source": "ai" if other is ai else "rule"})
    elif ai:
        chosen, source = ai, "ai"
        conf = 0.72 if ai["evidence_verified"] else 0.35
        if not ai["evidence_verified"]:
            flags.append("AI-cited evidence could not be found in the source document")
    elif best_rule:
        chosen, source, conf = best_rule, "rule", best_rule["score"]
    if chosen is best_rule and best_rule and best_rule.get("fallback"):
        flags.append(best_rule["fallback"])

    if ai and ai.get("ambiguous"):
        conf = min(conf, 0.5)
        flags.append("Ambiguous in protocol" + (f": {ai['note']}" if ai.get("note") else ""))
        if status == "extracted":
            status = "ambiguous"

    if not chosen:
        return {
            "key": key, "label": label, "category": category, "multi": multi,
            "value": [] if multi else NOT_SPECIFIED, "evidence": [], "status": "missing",
            "confidence": 0.0, "confidence_level": "low", "flags": ["Not found in the protocol"],
            "alternatives": [], "source": None, "needs_review": True,
            "verification": {"status": "unverified"}, "history": [],
        }

    if conf < 0.6 and status == "extracted":
        status = "low_confidence"
    return {
        "key": key, "label": label, "category": category, "multi": multi,
        "value": chosen["value"], "evidence": chosen["evidence"], "status": status,
        "confidence": round(conf, 2), "confidence_level": _level(conf), "flags": flags,
        "alternatives": alternatives[:5], "source": source,
        "needs_review": status != "extracted" or conf < threshold,
        "verification": {"status": "unverified"}, "history": [],
    }


def normalize_preferences(prefs: dict | None) -> dict:
    """Extraction preferences chosen at upload. Unknown values fall back to defaults."""
    prefs = prefs or {}
    groups = [g for g in (prefs.get("field_groups") or FIELD_GROUPS) if g in FIELD_GROUPS] or FIELD_GROUPS
    try:
        threshold = float(prefs.get("review_threshold", DEFAULT_REVIEW_THRESHOLD))
    except (TypeError, ValueError):
        threshold = DEFAULT_REVIEW_THRESHOLD
    return {
        "use_ai": prefs.get("use_ai", True) is not False,
        "field_groups": groups,
        "review_threshold": min(0.99, max(0.5, threshold)),
        "ai_scope": prefs.get("ai_scope") if prefs.get("ai_scope") in ("full", "relevant") else "full",
        "include_supporting": prefs.get("include_supporting", True) is not False,
    }


def _not_requested(key: str) -> dict:
    _, label, category, multi, _ = SPEC[key]
    return {"key": key, "label": label, "category": category, "multi": multi, "value": [] if multi else NOT_REQUESTED,
            "evidence": [], "status": "not_requested", "confidence": 0.0, "confidence_level": "low",
            "flags": ["Excluded by extraction preferences"], "alternatives": [], "source": None, "needs_review": False,
            "verification": {"status": "unverified"}, "history": []}


CHARACTERISTICS = ["phase", "study_design", "population", "sample_size", "treatment_arms", "comparator",
                   "randomization", "blinding", "study_duration"]


def characteristics(fields: list[dict]) -> list[dict]:
    """Study characteristics summary built only from the extracted fields."""
    fm = {f["key"]: f for f in fields}
    out = []
    for k in CHARACTERISTICS:
        f = fm.get(k)
        if not f:
            continue
        v = f["value"]
        text = "; ".join(v) if isinstance(v, list) else v
        ok = f["status"] not in ("missing", "not_requested") and text
        out.append({"key": k, "label": f["label"], "value": text if ok else NOT_SPECIFIED,
                    "status": f["status"], "verification": f["verification"]["status"]})
    return out


async def extract_fields(blocks: list[dict], language: str = "en", use_ai: bool = True,
                         preferences: dict | None = None) -> dict:
    """Full extraction. Returns the artifact payload for a protocol version."""
    prefs = normalize_preferences(preferences)
    prefs["use_ai"] = prefs["use_ai"] and use_ai
    keys = [k for k, _, cat, _, _ in FIELD_SPECS if cat in prefs["field_groups"]]
    ai_fields, ai_meta, ai_error = {}, {}, None
    ai_used = False
    if prefs["use_ai"] and ai_available() and keys:
        try:
            ai_fields, ai_meta = await ai_candidates(blocks, language, keys, prefs["ai_scope"])
            ai_used = True
        except Exception as e:
            ai_error = str(e)[:300]
    fields = [build_field(key, rule_candidates(key, blocks), ai_fields.get(key), prefs["review_threshold"])
              if key in keys else _not_requested(key) for key, *_ in FIELD_SPECS]
    fm = {f["key"]: f for f in fields}
    # Endpoints whose priority is not stated are kept only when the protocol has no classified endpoints
    classified = any(fm[k]["status"] not in ("missing", "not_requested")
                     for k in ("primary_endpoints", "secondary_endpoints", "exploratory_endpoints"))
    ue = fm["unclassified_endpoints"]
    if ue["status"] not in ("missing", "not_requested"):
        if classified:
            ue.update({"value": [], "evidence": [], "status": "missing", "alternatives": [], "confidence": 0.0,
                       "confidence_level": "low", "needs_review": False, "source": None,
                       "flags": ["Endpoints are classified by priority in the protocol (see primary/secondary/exploratory)"]})
        else:
            ue["flags"] = ue["flags"] + ["Endpoint priority (primary/secondary) is not stated in the protocol; classify during review"]
            ue["needs_review"] = True
            if ue["status"] == "extracted":
                ue["status"] = "ambiguous"
    return {
        "fields": fields,
        "summary": summarize_fields(fields),
        "characteristics": characteristics(fields),
        "preferences": prefs,
        "extraction": {
            "method_version": METHOD_VERSION,
            "ai_used": ai_used,
            "ai_error": ai_error,
            "ai_truncated": ai_meta.get("truncated", False),
            "rule_based": True,
        },
    }


def summarize_fields(fields: list[dict]) -> dict:
    counts = {"total": len(fields), "extracted": 0, "missing": 0, "conflict": 0, "ambiguous": 0,
              "low_confidence": 0, "not_requested": 0, "verified": 0, "needs_review": 0}
    for f in fields:
        counts[f["status"]] = counts.get(f["status"], 0) + 1
        if f["verification"]["status"] == "verified":
            counts["verified"] += 1
        if f.get("needs_review") and f["verification"]["status"] != "verified":
            counts["needs_review"] += 1
    return counts


def field_map(data: dict) -> dict:
    return {f["key"]: f for f in data.get("fields", [])}


def field_text(data: dict, key: str) -> str | list[str] | None:
    """Value of a field, or None when it is missing."""
    f = field_map(data).get(key)
    if not f or f["status"] in ("missing", "not_requested"):
        return None
    return f["value"]
