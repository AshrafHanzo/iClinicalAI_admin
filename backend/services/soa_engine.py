"""
Schedule of Assessments
Detects SoA tables in the processed protocol and turns them into an editable visit × assessment
matrix with source references. Timing and visit windows are taken only from the protocol text;
anything not stated stays "Not specified" and is listed as an issue for review.
"""

import re

from services.openai_service import ai_available, chat_completion_json
from services.protocol_intelligence import evidence, find_quote, norm, _quote

METHOD_VERSION = "soa/1.0"

VISIT_HINT = re.compile(r"\b(screen\w*|baseline|visit|v\d+|day|week|wk|month|follow[- ]?up|end of|eot|eos|"
                        r"randomi[sz]\w*|treatment|early (termination|discontinuation)|unscheduled|d-?\d+|w\d+)\b", re.I)
MARK = re.compile(r"^\s*([xX✓✔√•●■]|yes|y)\s*(?:[\(\[]?\s*([a-z](?:\s*,\s*[a-z])*|\d{1,2}(?:\s*,\s*\d{1,2})*)\s*[\)\]]?)?\s*$")
TIMING = re.compile(r"\b(day|week|wk|month|year|d|w|m)s?\s*\.?\s*(-?\d+)(?:\s*(?:to|through|–|-)\s*(?:(?:day|week|wk|month|d|w)\s*)?(-?\d+))?", re.I)
WINDOW = re.compile(r"(?:±|\+/-|\+/−|\+-)\s*(\d+)\s*(days?|d|weeks?|wks?|w|hours?|h)\b"
                    r"|\(\s*-\s*(\d+)\s*(?:/|,|to)\s*\+\s*(\d+)\s*(days?|d|weeks?|w|hours?|h)\s*\)"
                    r"|-\s*(\d+)\s*/\s*\+\s*(\d+)\s*(days?|d|weeks?|w|hours?|h)\b", re.I)
VISIT_NO = re.compile(r"\b(?:visit|v)\s*\.?\s*(\d+[a-z]?)\b", re.I)
UNIT = {"d": "day", "day": "day", "days": "day", "w": "week", "wk": "week", "wks": "week", "week": "week", "weeks": "week",
        "m": "month", "month": "month", "year": "year", "h": "hour", "hour": "hour", "hours": "hour"}
DAYS_PER = {"day": 1, "week": 7, "month": 30.4375, "year": 365.25}


# ─── Parsing helpers ─────────────────────────────────────────────────

def parse_timing(text: str) -> dict | None:
    m = TIMING.search(text or "")
    if not m:
        return None
    unit = UNIT.get(m.group(1).lower(), m.group(1).lower())
    value = int(m.group(2))
    end = int(m.group(3)) if m.group(3) else None
    label = f"{unit.capitalize()} {value}" + (f" to {unit.capitalize()} {end}" if end is not None else "")
    return {"unit": unit, "value": value, "end": end, "text": m.group(0).strip(), "label": label}


def parse_window(text: str) -> dict | None:
    m = WINDOW.search(text or "")
    if not m:
        return None
    if m.group(1):
        n, unit = int(m.group(1)), m.group(2)
        minus, plus = n, n
    elif m.group(3):
        minus, plus, unit = int(m.group(3)), int(m.group(4)), m.group(5)
    else:
        minus, plus, unit = int(m.group(6)), int(m.group(7)), m.group(8)
    unit = UNIT.get(unit.lower().rstrip("s") if unit.lower() not in UNIT else unit.lower(), unit.lower())
    return {"minus": minus, "plus": plus, "unit": unit, "text": m.group(0).strip()}


def visit_phase(label: str) -> str:
    l = label.lower()
    if re.search(r"screen", l):
        return "screening"
    if re.search(r"baseline|randomi[sz]", l):
        return "baseline"
    if re.search(r"follow", l):
        return "follow-up"
    if re.search(r"end of (study|trial)|\beos\b|early (termination|discontinuation)|\bet\b", l):
        return "end of study"
    if re.search(r"end of treatment|\beot\b", l):
        return "end of treatment"
    if re.search(r"treatment|dosing", l):
        return "treatment"
    if re.search(r"unscheduled", l):
        return "unscheduled"
    return "Not specified"


def sort_day(timing: dict | None) -> float | None:
    """Approximate study day used only for ordering the timeline; the stated timing is kept as is."""
    if not timing or timing["unit"] not in DAYS_PER:
        return None
    return timing["value"] * DAYS_PER[timing["unit"]]


def _is_mark(cell: str) -> tuple[bool, list[str]]:
    m = MARK.match(cell or "")
    if not m:
        return False, []
    refs = [r.strip() for r in (m.group(2) or "").split(",") if r.strip()]
    return True, refs


_LABEL_MARKER = re.compile(r"^([a-z])\s+(?=[A-Z])|(?<=\w)\s([a-z])\s(?=[A-Z])")


def split_marker(label: str) -> tuple[str, list[str]]:
    """'b Medical history' -> ('Medical history', ['b']); 'End of Study a Visit' -> ('End of Study Visit', ['a'])."""
    refs = [m.group(1) or m.group(2) for m in _LABEL_MARKER.finditer(label)]
    return _LABEL_MARKER.sub(lambda m: "" if m.group(1) else " ", label).strip(), refs


def _shading_mode(rows: list[list[str]], shaded: list[list[bool]] | None) -> bool:
    """Schedules that mark 'not performed' by grey shading instead of X marks."""
    if not shaded or len(shaded) < 3:
        return False
    body = [f for r in shaded[1:] for f in r[1:]]
    marks = sum(1 for r in rows[1:] for c in r[1:] if _is_mark(c)[0])
    return bool(body) and 0.15 <= sum(body) / len(body) <= 0.9 and marks < 0.05 * len(body)


WEEKDAY = re.compile(r"^(m|t|w|th|f|s|sa|su|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\.?$", re.I)


def _header_start(rows: list[list[str]]) -> int:
    """Index of the visit header row; leading title rows ('Table 1: Schedule of …') are skipped."""
    for i, r in enumerate(rows[:3]):
        if sum(1 for c in r[1:] if VISIT_HINT.search(c or "")) >= 2:
            return i
    return 0


def _score_table(rows: list[list[str]], shaded: list[list[bool]] | None = None) -> float:
    start = _header_start(rows)
    rows = rows[start:]
    shaded = shaded[start:] if shaded else shaded
    if len(rows) < 3 or len(rows[0]) < 3:
        return 0.0
    header_hits = sum(1 for c in rows[0][1:] if VISIT_HINT.search(c or ""))
    if header_hits < 2:
        return 0.0
    if _shading_mode(rows, shaded):
        return header_hits + 2
    body = [c for r in rows[1:] for c in r[1:]]
    marks = sum(1 for c in body if _is_mark(c)[0])
    if not body or marks / len(body) < 0.1:
        return 0.0
    return header_hits + marks / len(body) * 10


# ─── Table → matrix ──────────────────────────────────────────────────

def _matrix_from_table(block: dict, start_v: int = 1, start_a: int = 1) -> dict:
    rows = block["table"]
    ncols = max(len(r) for r in rows)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    shaded = block.get("shaded")
    # Row indices below stay relative to the source table for traceability
    start = _header_start(rows)
    offset, rows = start, rows[start:]
    shaded = shaded[start:] if shaded else shaded
    by_shading = _shading_mode(rows, shaded)
    header_rows = []
    if by_shading:
        # First row plus continuation header rows (empty first cell, e.g. a timing row)
        header_rows.append(rows[0])
        for r in rows[1:]:
            rest = [c.strip() for c in r[1:] if c and c.strip()]
            weekday_row = bool(rest) and all(WEEKDAY.match(c) for c in rest)
            if (r[0] or "").strip() and not weekday_row:
                break
            header_rows.append(r)
    else:
        for r in rows:
            if any(_is_mark(c)[0] for c in r[1:]):
                break
            header_rows.append(r)
    body = rows[len(header_rows):]
    visits = []
    col_to_visit = {}
    for col in range(1, ncols):
        parts = []
        for hr in header_rows:
            t = (hr[col] or "").strip()
            if t and t not in parts and not WEEKDAY.match(t):  # calendar weekday rows are not visit labels
                parts.append(t)
        if not parts:
            continue
        label, label_refs = split_marker(" / ".join(parts))
        timing = None
        for p in parts:
            timing = parse_timing(p)
            if timing:
                break
        window = parse_window(label)
        if not window and timing:
            # "Day 8 (±1)": the window is stated without a unit; it is read in the visit's own unit and marked as such
            m = re.search(r"(?:±|\+/-)\s*(\d+)(?!\s*(?:days?|d|weeks?|wks?|w|hours?|h)\b)", label, re.I)
            if m:
                window = {"minus": int(m.group(1)), "plus": int(m.group(1)), "unit": timing["unit"],
                          "text": m.group(0).strip(), "unit_from_visit_timing": True}
        vno = VISIT_NO.search(label)
        vid = f"V{start_v + len(visits)}"
        col_to_visit[col] = vid
        visits.append({
            "id": vid, "label": label, "footnotes": label_refs, "visit_number": vno.group(1) if vno else None,
            "phase": visit_phase(label), "timing": timing, "window": window,
            "source": {"block_id": block["id"], "page": block.get("page"), "section": block.get("section"), "column": col},
        })
    assessments, cells, category = [], {}, None
    for ri, r in enumerate(body, start=offset + len(header_rows)):
        name, name_refs = split_marker((r[0] or "").strip())
        others = [c.strip() for c in r[1:]]
        if not name:
            continue
        row_shading = shaded[ri - offset] if by_shading and ri - offset < len(shaded) else None
        if not by_shading and (not any(others) or all(o == name for o in others)):
            category = name  # section row such as "Laboratory assessments"
            continue
        aid = f"A{start_a + len(assessments)}"
        assessments.append({"id": aid, "name": name, "category": category, "footnotes": name_refs,
                             "source": {"block_id": block["id"], "page": block.get("page"),
                                        "section": block.get("section"), "row": ri}})
        for col, vid in col_to_visit.items():
            raw = (r[col] or "").strip()
            if row_shading is not None:
                if col < len(row_shading) and row_shading[col]:
                    continue  # shaded cell: not performed at this visit
                is_mark, refs = _is_mark(raw)
                cells[f"{aid}|{vid}"] = {
                    "mark": "X" if (not raw or is_mark) else raw,
                    "conditional": bool(raw) and not is_mark,
                    "footnotes": refs,
                    "inferred_from_shading": True,
                    "source": {"block_id": block["id"], "row": ri, "column": col, "text": raw or "(unshaded cell)"},
                }
                continue
            if not raw:
                continue
            is_mark, refs = _is_mark(raw)
            cells[f"{aid}|{vid}"] = {
                "mark": "X" if is_mark else raw,
                "conditional": not is_mark,
                "footnotes": refs,
                "source": {"block_id": block["id"], "row": ri, "column": col, "text": raw},
            }
    return {"visits": visits, "assessments": assessments, "cells": cells, "by_shading": by_shading}


_FOOTNOTE = re.compile(r"^(?:([a-z]|[A-Z]{1,3}|\d{1,2}|\*{1,3}|†|‡)[\.\):]|(Note|Notes)\s*[:.])\s+(\S.*)$", re.S)


def _footnotes_after(blocks: list[dict], table_idx: int) -> list[dict]:
    """Footnotes and legends under a table ('a. …', 'A: 2 mL blood at …'). A short caption line is skipped."""
    notes, skipped = [], 0
    for b in blocks[table_idx + 1:]:
        if b["kind"] in ("heading", "table"):
            break
        m = _FOOTNOTE.match(b["text"])
        if b["kind"] == "footnote" or m:
            marker = m.group(1) if m and m.group(1) else "note"
            notes.append({"marker": marker, "text": (m.group(3) if m else b["text"]).strip(), "evidence": [evidence(b)]})
        elif notes or skipped >= 2:
            break
        else:
            skipped += 1
    return notes


CONVENTION = re.compile(r"[^.]*\b(visit window|window of|±\s*\d+|day 1 is (defined|the day)|relative to (the )?(first dose|randomi[sz]ation|day 1)|"
                        r"study day|time ?points? (are|is) relative)[^.]*\.", re.I)


def _conventions(blocks: list[dict]) -> list[dict]:
    out, seen = [], set()
    for b in blocks:
        if b["kind"] == "table":
            continue
        for m in CONVENTION.finditer(b["text"]):
            s = m.group(0).strip()
            if norm(s) not in seen and len(s) < 500:
                seen.add(norm(s))
                out.append({"text": s, "evidence": [evidence(b, s)]})
    return out[:20]


def _label_key(label: str) -> str:
    """Comparison key that keeps signs: 'Day -1' and 'Day 1' are different visits."""
    return re.sub(r"\s+", " ", (label or "").lower()).strip()


def _merge(target: dict, part: dict) -> None:
    """Append a continuation table: new visits are added, assessments matched by name."""
    vmap = {}
    for v in part["visits"]:
        existing = next((x for x in target["visits"] if _label_key(x["label"]) == _label_key(v["label"])), None)
        if existing:
            vmap[v["id"]] = existing["id"]
        else:
            nv = dict(v, id=f"V{len(target['visits']) + 1}")
            vmap[v["id"]] = nv["id"]
            target["visits"].append(nv)
    amap = {}
    for a in part["assessments"]:
        existing = next((x for x in target["assessments"] if _label_key(x["name"]) == _label_key(a["name"])), None)
        if existing:
            amap[a["id"]] = existing["id"]
        else:
            na = dict(a, id=f"A{len(target['assessments']) + 1}")
            amap[a["id"]] = na["id"]
            target["assessments"].append(na)
    for key, cell in part["cells"].items():
        aid, vid = key.split("|")
        nk = f"{amap[aid]}|{vmap[vid]}"
        if nk in target["cells"] and target["cells"][nk]["mark"] != cell["mark"]:
            target.setdefault("_conflicts", []).append((nk, target["cells"][nk], cell))
        target["cells"][nk] = cell


SOA_SECTION = re.compile(r"schedule of (assessments|events|activities|procedures|visits)|time and events|flow ?chart|study calendar", re.I)


def _select_tables(scored: list[tuple[int, dict, float]]) -> list[tuple[int, dict, float]]:
    """Tables in schedule-titled sections; otherwise the best table and its continuation pages."""
    in_section = [s for s in scored if SOA_SECTION.search(s[1].get("section") or "")
                  or SOA_SECTION.search(" ".join(s[1]["table"][0][:2]))]  # titled tables: "Table 1: Schedule of …"
    if in_section:
        return sorted(in_section, key=lambda s: s[0])
    best = max(scored, key=lambda s: s[2])
    chosen, width = [best], len(best[1]["table"][0])
    for s in sorted(scored, key=lambda s: s[0]):
        last = chosen[-1][1]
        if s[0] > chosen[-1][0] and len(s[1]["table"][0]) == width and last.get("page") and s[1].get("page") \
                and s[1]["page"] - last["page"] == 1:
            chosen.append(s)
    return chosen


def _header_signature(rows: list[list[str]]) -> str:
    return norm(" ".join(rows[_header_start(rows)]))


def generate_from_tables(blocks: list[dict]) -> dict | None:
    tables = [(i, b) for i, b in enumerate(blocks) if b["kind"] == "table" and b.get("table")]
    scored = [(i, b, _score_table(b["table"], b.get("shaded"))) for i, b in tables]
    scored = [s for s in scored if s[2] > 0]
    if not scored:
        return None
    selected = _select_tables(scored)
    # Continuation pages repeat the header row but may carry few marks; include them
    signatures = {_header_signature(b["table"]) for _, b, _ in selected}
    chosen_ids = {b["id"] for _, b, _ in selected}
    for i, b in tables:
        if b["id"] not in chosen_ids and _header_signature(b["table"]) in signatures:
            selected.append((i, b, 0.0))
    selected.sort(key=lambda s: s[0])
    matrix = {"visits": [], "assessments": [], "cells": {}, "footnotes": [], "source_tables": [], "assignment_basis": "marks"}
    for idx, block, _ in selected:
        part = _matrix_from_table(block)
        if part.pop("by_shading", False):
            matrix["assignment_basis"] = "shading"
        _merge(matrix, part)
        matrix["footnotes"] += _footnotes_after(blocks, idx)
        matrix["source_tables"].append(block["id"])
    matrix["generated_by"] = "table"
    return matrix


AI_SOA_PROMPT = """Extract the Schedule of Assessments from the protocol blocks.
Return JSON: {"visits": [{"label": "...", "timing_text": "<exact text or empty>", "window_text": "<exact text or empty>", "block_id": "..."}],
"assessments": [{"name": "...", "category": "...", "visits": ["<visit label>"], "block_id": "...", "quote": "<exact text naming the assessment>"}]}
Rules: copy visit labels, timing and windows verbatim from the text; leave timing_text/window_text empty when not stated.
Never invent visits, timings or windows."""


async def generate_with_ai(blocks: list[dict]) -> dict | None:
    if not ai_available():
        return None
    text = "\n".join(f"[{b['id']} | {(b.get('section') or '')[:50]}] {_quote(b['text'], 800)}" for b in blocks)[:60000]
    raw = await chat_completion_json(AI_SOA_PROMPT, text)
    by_id = {b["id"]: b for b in blocks}
    matrix = {"visits": [], "assessments": [], "cells": {}, "footnotes": [], "source_tables": [], "generated_by": "ai"}
    label_to_id = {}
    for v in raw.get("visits") or []:
        if not isinstance(v, dict) or not v.get("label"):
            continue
        b = find_quote(blocks, v["label"], v.get("block_id"))
        timing = parse_timing(v.get("timing_text") or "") if b and v.get("timing_text") and find_quote(blocks, v["timing_text"]) else None
        window = parse_window(v.get("window_text") or "") if v.get("window_text") and find_quote(blocks, v["window_text"]) else None
        vid = f"V{len(matrix['visits']) + 1}"
        label_to_id[norm(v["label"])] = vid
        matrix["visits"].append({
            "id": vid, "label": v["label"], "visit_number": (VISIT_NO.search(v["label"]) or [None, None])[1],
            "phase": visit_phase(v["label"]), "timing": timing, "window": window,
            "source": {"block_id": b["id"], "page": b.get("page"), "section": b.get("section")} if b else None,
            "unverified": b is None,
        })
    for a in raw.get("assessments") or []:
        if not isinstance(a, dict) or not a.get("name"):
            continue
        b = find_quote(blocks, a.get("quote") or a["name"], a.get("block_id"))
        aid = f"A{len(matrix['assessments']) + 1}"
        matrix["assessments"].append({"id": aid, "name": a["name"], "category": a.get("category") or None,
                                      "source": {"block_id": b["id"], "page": b.get("page"), "section": b.get("section")} if b else None,
                                      "unverified": b is None})
        for vl in a.get("visits") or []:
            vid = label_to_id.get(norm(str(vl)))
            if vid:
                matrix["cells"][f"{aid}|{vid}"] = {"mark": "X", "conditional": False, "footnotes": [],
                                                   "source": {"block_id": b["id"]} if b else None}
    return matrix if matrix["visits"] or matrix["assessments"] else None


# ─── Checks ──────────────────────────────────────────────────────────

def check_matrix(matrix: dict, endpoint_data: dict | None = None, previous_issues: list[dict] | None = None) -> list[dict]:
    """Recompute scheduling issues. Resolutions recorded on earlier issues with the same key are carried over."""
    issues = []

    def add(key, typ, severity, description, refs):
        issues.append({"key": key, "type": typ, "severity": severity, "description": description, "refs": refs})

    for v in matrix["visits"]:
        if not v.get("timing"):
            add(f"timing:{v['id']}", "missing_timing", "warning",
                f"Visit '{v['label']}' has no study day/week stated in the protocol table.", [v["id"]])
        if not v.get("window") and v.get("phase") not in ("screening", "unscheduled"):
            add(f"window:{v['id']}", "window_not_specified", "info",
                f"No visit window is stated for '{v['label']}' (shown as Not specified; not assumed).", [v["id"]])
        if (v.get("window") or {}).get("unit_from_visit_timing"):
            add(f"windowunit:{v['id']}", "window_unit_not_stated", "warning",
                f"The window '{v['window']['text']}' for '{v['label']}' has no unit in the protocol; it is read as {v['window']['unit']}s from the visit timing. Confirm.",
                [v["id"]])
        if v.get("unverified"):
            add(f"unverified:{v['id']}", "not_in_source", "conflict",
                f"Visit '{v['label']}' could not be found in the source protocol text.", [v["id"]])

    seen_timing = {}
    for v in matrix["visits"]:
        t = v.get("timing")
        if not t:
            continue
        k = (t["unit"], t["value"], t.get("end"))
        if k in seen_timing and visit_phase(seen_timing[k]["label"]) == v["phase"] and v["phase"] != "unscheduled":
            add(f"dup:{seen_timing[k]['id']}:{v['id']}", "conflicting_visit", "conflict",
                f"Visits '{seen_timing[k]['label']}' and '{v['label']}' share the same timing ({t['label']}).",
                [seen_timing[k]["id"], v["id"]])
        seen_timing.setdefault(k, v)

    ordered = [(v, sort_day(v.get("timing"))) for v in matrix["visits"] if sort_day(v.get("timing")) is not None
               and v["phase"] not in ("unscheduled", "end of study")]
    for (a, da), (b, db) in zip(ordered, ordered[1:]):
        if db < da:
            add(f"order:{a['id']}:{b['id']}", "timing_order", "conflict",
                f"Visit '{b['label']}' ({b['timing']['label']}) is scheduled before the preceding visit '{a['label']}' ({a['timing']['label']}).",
                [a["id"], b["id"]])

    for a in matrix["assessments"]:
        if not any(k.startswith(a["id"] + "|") for k in matrix["cells"]):
            add(f"novisit:{a['id']}", "assessment_without_visit", "warning",
                f"Assessment '{a['name']}' is not assigned to any visit.", [a["id"]])
        if a.get("unverified"):
            add(f"unverified:{a['id']}", "not_in_source", "conflict",
                f"Assessment '{a['name']}' could not be found in the source protocol text.", [a["id"]])

    markers = {f["marker"].lower() for f in matrix.get("footnotes", [])}
    for k, c in matrix["cells"].items():
        for ref in c.get("footnotes", []):
            if ref.lower() not in markers:
                add(f"footnote:{ref}", "missing_footnote", "warning",
                    f"Footnote '{ref}' is referenced in the table but its text was not found.", [k])

    if any(c.get("inferred_from_shading") for c in matrix["cells"].values()):
        add("shading_convention", "shading_convention", "conflict",
            "Visit assignments were read from cell shading (shaded = not performed, unshaded = performed). "
            "The protocol does not state this convention in text; confirm it against the source table before approval.",
            [])

    for nk, old, new in matrix.pop("_conflicts", []):
        add(f"cellconflict:{nk}", "conflicting_assignment", "conflict",
            f"Conflicting entries for {nk}: '{old['mark']}' vs '{new['mark']}' in different source tables.", [nk])

    if endpoint_data:
        # Match against this matrix, not the visit ids stored when endpoints were analysed
        scheduled = {(v["timing"]["unit"], v["timing"]["value"]) for v in matrix["visits"] if v.get("timing")}
        for row in endpoint_data.get("timepoint_map", []):
            stated = {(t["unit"], t["value"]) for t in [parse_timing(row["time_point"])] if t}
            if stated and not (stated & scheduled):
                add(f"ep:{row['endpoint_id']}:{norm(row['time_point'])}", "endpoint_timepoint_unscheduled", "warning",
                    f"Endpoint {row['endpoint_id']} time point '{row['time_point']}' has no matching visit.", [row["endpoint_id"]])

    if not matrix["visits"]:
        add("novisits", "no_schedule", "conflict", "No Schedule of Assessments could be identified in the protocol.", [])

    prev = {i["key"]: i for i in (previous_issues or [])}
    for n, iss in enumerate(issues, start=1):
        iss["id"] = f"S{n}"
        p = prev.get(iss["key"])
        iss["status"] = p["status"] if p else "open"
        iss["resolution"] = p.get("resolution") if p else None
    return issues


async def generate(blocks: list[dict], endpoint_data: dict | None = None, use_ai: bool = True) -> dict:
    matrix = generate_from_tables(blocks)
    note = None
    if not matrix and use_ai:
        try:
            matrix = await generate_with_ai(blocks)
        except Exception as e:
            note = f"AI extraction failed: {str(e)[:200]}"
    if not matrix:
        matrix = {"visits": [], "assessments": [], "cells": {}, "footnotes": [], "source_tables": [], "generated_by": "none"}
        note = note or "No Schedule of Assessments table was detected in the protocol."
    matrix["conventions"] = _conventions(blocks)
    matrix["issues"] = check_matrix(matrix, endpoint_data)
    matrix["note"] = note
    return matrix


def validate_matrix(matrix: dict) -> None:
    """Basic integrity checks for user-edited matrices. Raises ValueError with a readable message."""
    if not isinstance(matrix.get("visits"), list) or not isinstance(matrix.get("assessments"), list):
        raise ValueError("Matrix must contain 'visits' and 'assessments' lists")
    vids = [v.get("id") for v in matrix["visits"]]
    aids = [a.get("id") for a in matrix["assessments"]]
    if len(set(vids)) != len(vids) or len(set(aids)) != len(aids) or None in vids or None in aids:
        raise ValueError("Visit and assessment ids must be present and unique")
    for v in matrix["visits"]:
        if not str(v.get("label") or "").strip():
            raise ValueError("Every visit needs a label")
    for k in (matrix.get("cells") or {}):
        a, _, v = k.partition("|")
        if a not in aids or v not in vids:
            raise ValueError(f"Cell '{k}' refers to an unknown visit or assessment")


def diff_matrices(base: dict, current: dict) -> list[dict]:
    """Differences between the matrix generated from the protocol and the current (edited) matrix."""
    out = []
    bv = {v["id"]: v for v in base.get("visits", [])}
    cv = {v["id"]: v for v in current.get("visits", [])}
    for vid in cv.keys() - bv.keys():
        out.append({"type": "visit_added", "ref": vid, "detail": f"Visit '{cv[vid]['label']}' is not in the protocol-derived matrix"})
    for vid in bv.keys() - cv.keys():
        out.append({"type": "visit_removed", "ref": vid, "detail": f"Protocol visit '{bv[vid]['label']}' was removed"})
    for vid in bv.keys() & cv.keys():
        for f in ("label", "timing", "window"):
            if (bv[vid].get(f) or None) != (cv[vid].get(f) or None):
                out.append({"type": f"visit_{f}_changed", "ref": vid, "detail": f"{f} of '{cv[vid]['label']}' differs from the protocol"})
    ba = {a["id"]: a for a in base.get("assessments", [])}
    ca = {a["id"]: a for a in current.get("assessments", [])}
    for aid in ca.keys() - ba.keys():
        out.append({"type": "assessment_added", "ref": aid, "detail": f"Assessment '{ca[aid]['name']}' is not in the protocol-derived matrix"})
    for aid in ba.keys() - ca.keys():
        out.append({"type": "assessment_removed", "ref": aid, "detail": f"Protocol assessment '{ba[aid]['name']}' was removed"})
    bc, cc = base.get("cells", {}), current.get("cells", {})
    for k in sorted(set(bc) | set(cc)):
        if (bc.get(k) or {}).get("mark") != (cc.get(k) or {}).get("mark"):
            out.append({"type": "cell_changed", "ref": k,
                        "detail": f"{k}: protocol '{(bc.get(k) or {}).get('mark', '')}' → current '{(cc.get(k) or {}).get('mark', '')}'"})
    return out
