"""
Protocol Version Comparison
Matches a new protocol version to its predecessor, aligns sections, classifies block-level
additions / removals / modifications (separating formatting-only edits), and attaches
potential downstream impacts as recommendations for reviewers.
"""

import re
from difflib import SequenceMatcher

from services.protocol_intelligence import norm, similarity, _strip_numbering, field_text

METHOD_VERSION = "version-compare/1.0"

IMPACT_RULES = [
    ("eligibility", "Eligibility criteria", r"inclusion|exclusion|eligib|criteri|\baged?\b|\bbmi\b|egfr|contracept|pregnan"),
    ("endpoints", "Study objectives and endpoints", r"end ?points?|objectives?|outcome measure|hypothes"),
    ("schedule", "Visit schedule and assessments", r"schedule of|\bvisits?\b|\bweek \d|\bday -?\d|assessments?|procedures?|window"),
    ("sample_size", "Sample-size assumptions", r"sample size|\bpower\b|enrol|randomi[sz]|\bparticipants\b|dropout|attrition|alpha|effect size|standard deviation|hazard ratio"),
    ("feasibility", "Study feasibility", r"\bsites?\b|countr|recruit|duration|burden|biops|hospitali|overnight|enrol"),
    ("safety", "Safety monitoring and dosing", r"adverse|safety|\bsae\b|\bdos(e|es|ing)\b|discontinu|stopping rule|dsmb"),
    ("data_specs", "Linked documents and data specifications", r"\bcrf\b|case report|data (collection|management)|\bedc\b|sdtm|adam|coding|meddra"),
]
LINKED_KINDS = {
    "eligibility": ["protocol_intelligence"],
    "endpoints": ["endpoint_intelligence", "protocol_intelligence"],
    "schedule": ["soa", "endpoint_intelligence"],
    "sample_size": ["sample_size"],
    "feasibility": [],
    "safety": ["soa"],
    "data_specs": [],
}
EXISTING_ANALYSIS_LINKS = {"eligibility": "eligibility_review", "feasibility": "feasibility", "endpoints": "summary"}


# ─── Matching ────────────────────────────────────────────────────────

_PROTO_NO = re.compile(r"\bprotocol\s*(?:no\.?|number|id|code)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_/\.]{2,})", re.I)


def _protocol_numbers(blocks: list[dict]) -> set[str]:
    out = set()
    for b in blocks[:80]:
        for m in _PROTO_NO.finditer(b["text"]):
            out.add(m.group(1).upper().rstrip("."))
        if b.get("table"):
            for row in b["table"]:
                if len(row) >= 2 and re.match(r"^\s*protocol\s*(no\.?|number|id|code)\s*:?\s*$", row[0] or "", re.I):
                    out.add(row[1].strip().upper().rstrip("."))
    return {n for n in out if n}


def _vocab(blocks: list[dict]) -> set[str]:
    return {w for b in blocks for w in norm(b["text"]).split() if len(w) > 3 and not w.isdigit()}


def _title(blocks: list[dict], pi: dict | None) -> str:
    t = field_text(pi or {}, "study_title")
    if isinstance(t, str) and t:
        return t
    for b in blocks[:10]:
        if len(b["text"].split()) >= 5:
            return b["text"]
    return ""


def match_versions(old_blocks, new_blocks, old_pi=None, new_pi=None) -> dict:
    reasons = []
    title_sim = similarity(_title(old_blocks, old_pi), _title(new_blocks, new_pi))
    reasons.append(f"Title similarity {title_sim:.0%}")
    va, vb = _vocab(old_blocks), _vocab(new_blocks)
    vocab = len(va & vb) / max(1, len(va | vb))
    reasons.append(f"Shared vocabulary {vocab:.0%}")
    na, nb = _protocol_numbers(old_blocks), _protocol_numbers(new_blocks)
    proto = 0.5
    if na and nb:
        proto = 1.0 if na & nb else 0.0
        reasons.append("Protocol number matches" if na & nb else f"Protocol numbers differ ({', '.join(sorted(na))} vs {', '.join(sorted(nb))})")
    else:
        reasons.append("Protocol number not found in one or both documents")
    score = 0.4 * title_sim + 0.4 * min(1.0, vocab / 0.6) + 0.2 * proto
    if na and nb and not (na & nb):
        score = min(score, 0.45)
    level = "confident" if score >= 0.65 else "uncertain" if score >= 0.4 else "unlikely"
    return {"score": round(score, 2), "level": level, "reasons": reasons}


# ─── Diff ────────────────────────────────────────────────────────────

def _fmt_norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _sections(blocks: list[dict]) -> list[tuple[str, list[dict]]]:
    out, cur_key, cur = [], None, []
    for b in blocks:
        key = b.get("section") or "Front matter"
        if key != cur_key:
            if cur:
                out.append((cur_key, cur))
            cur_key, cur = key, []
        if b["kind"] != "heading":
            cur.append(b)
    if cur:
        out.append((cur_key, cur))
    # Merge repeated section names (continued across pages)
    merged = {}
    order = []
    for k, bl in out:
        if k not in merged:
            merged[k] = []
            order.append(k)
        merged[k] += bl
    return [(k, merged[k]) for k in order]


def _align_sections(old: list, new: list) -> list[tuple[str | None, str | None]]:
    old_keys = {norm(_strip_numbering(k)): k for k, _ in old}
    new_keys = {norm(_strip_numbering(k)): k for k, _ in new}
    pairs, used_old = [], set()
    for nk, new_name in new_keys.items():
        if nk in old_keys:
            pairs.append((old_keys[nk], new_name))
            used_old.add(nk)
    unmatched_old = [k for k in old_keys if k not in used_old]
    for nk, new_name in new_keys.items():
        if any(p[1] == new_name for p in pairs):
            continue
        best = max(unmatched_old, key=lambda ok: SequenceMatcher(None, ok, nk).ratio(), default=None)
        if best and SequenceMatcher(None, best, nk).ratio() >= 0.75:
            pairs.append((old_keys[best], new_name))
            unmatched_old.remove(best)
        else:
            pairs.append((None, new_name))
    pairs += [(old_keys[k], None) for k in unmatched_old]
    return pairs


def _loc(b: dict | None) -> dict | None:
    if not b:
        return None
    return {"block_id": b["id"], "page": b.get("page"), "section": b.get("section"), "kind": b["kind"], "text": b["text"]}


def _word_diff(a: str, b: str) -> list[dict]:
    aw, bw = a.split(), b.split()
    segs = []
    for op, i1, i2, j1, j2 in SequenceMatcher(None, aw, bw, autojunk=False).get_opcodes():
        if op == "equal":
            segs.append({"op": "equal", "text": " ".join(aw[i1:i2])})
        else:
            if i2 > i1:
                segs.append({"op": "delete", "text": " ".join(aw[i1:i2])})
            if j2 > j1:
                segs.append({"op": "insert", "text": " ".join(bw[j1:j2])})
    return segs


def _table_detail(a: dict, b: dict) -> dict:
    ra = [" | ".join(r) for r in a.get("table", [])]
    rb = [" | ".join(r) for r in b.get("table", [])]
    added = [r for r in rb if r not in ra]
    removed = [r for r in ra if r not in rb]
    return {"rows_added": added[:50], "rows_removed": removed[:50]}


def _impacts(*texts: str) -> list[dict]:
    blob = " ".join(t or "" for t in texts)
    out = []
    for area, label, rx in IMPACT_RULES:
        m = re.search(rx, blob, re.I)
        if m:
            out.append({"area": area, "label": label, "trigger": m.group(0),
                        "note": "Potential impact — recommendation for review, not a confirmed consequence."})
    return out


def _change(n, typ, old_b, new_b, section_old, section_new):
    old_t = old_b["text"] if old_b else ""
    new_t = new_b["text"] if new_b else ""
    formatting = typ == "modified" and _fmt_norm(old_t) == _fmt_norm(new_t)
    ch = {
        "id": f"C{n}",
        "type": typ,
        "substantive": not formatting,
        "category": "formatting" if formatting else "content",
        "section_old": section_old,
        "section_new": section_new,
        "old": _loc(old_b),
        "new": _loc(new_b),
        "impacts": [] if formatting else _impacts(section_old or "", section_new or "", old_t, new_t),
        "review": {"status": "pending", "by": None, "at": None},
        "comments": [],
        "actions": [],
    }
    if typ == "modified":
        ch["word_diff"] = _word_diff(old_t, new_t)
        if (old_b or {}).get("table") and (new_b or {}).get("table"):
            ch["table_diff"] = _table_detail(old_b, new_b)
    return ch


def compare(old_blocks: list[dict], new_blocks: list[dict]) -> dict:
    old_s, new_s = _sections(old_blocks), _sections(new_blocks)
    old_map, new_map = dict(old_s), dict(new_s)
    changes, summary = [], []
    for so, sn in _align_sections(old_s, new_s):
        a = old_map.get(so, []) if so else []
        b = new_map.get(sn, []) if sn else []
        counts = {"added": 0, "removed": 0, "modified": 0, "formatting": 0}
        start = len(changes)
        sm = SequenceMatcher(None, [_fmt_norm(x["text"]) for x in a], [_fmt_norm(x["text"]) for x in b], autojunk=False)
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == "equal":
                # Identical after normalisation, so any raw difference is formatting only
                for x, y in zip(a[i1:i2], b[j1:j2]):
                    if x["text"] != y["text"]:
                        changes.append(_change(len(changes) + 1, "modified", x, y, so, sn))
                continue
            olds, news = a[i1:i2], b[j1:j2]
            paired = set()
            for x in olds:
                best_j, best_s = None, 0.0
                for j, y in enumerate(news):
                    if j in paired:
                        continue
                    s = similarity(x["text"], y["text"])
                    if s > best_s:
                        best_j, best_s = j, s
                if best_j is not None and best_s >= 0.5:
                    paired.add(best_j)
                    changes.append(_change(len(changes) + 1, "modified", x, news[best_j], so, sn))
                else:
                    changes.append(_change(len(changes) + 1, "removed", x, None, so, sn))
            for j, y in enumerate(news):
                if j not in paired:
                    changes.append(_change(len(changes) + 1, "added", None, y, so, sn))
        for c in changes[start:]:
            counts["formatting" if not c["substantive"] else c["type"]] += 1
        status = "added" if not so else "removed" if not sn else "renamed" if norm(_strip_numbering(so)) != norm(_strip_numbering(sn)) else "matched"
        if any(counts.values()) or status != "matched":
            summary.append({"section_old": so, "section_new": sn, "status": status, **counts,
                            "substantive": counts["added"] + counts["removed"] + counts["modified"]})
    totals = {k: sum(s[k] for s in summary) for k in ("added", "removed", "modified", "formatting")}
    areas = {}
    for c in changes:
        for imp in c["impacts"]:
            areas.setdefault(imp["area"], {"area": imp["area"], "label": imp["label"], "change_ids": []})["change_ids"].append(c["id"])
    return {"changes": changes, "section_summary": summary, "totals": totals, "impact_areas": list(areas.values())}


def link_artifacts(impact_areas: list[dict], artifacts: list[dict], doc_analyses: dict) -> None:
    """Attach the study deliverables that may need follow-up for each impact area."""
    for area in impact_areas:
        kinds = LINKED_KINDS.get(area["area"], [])
        area["linked_deliverables"] = [
            {"artifact_id": a["id"], "kind": a["kind"], "revision": a["revision"], "status": a["status"]}
            for a in artifacts if a["kind"] in kinds
        ]
        existing = EXISTING_ANALYSIS_LINKS.get(area["area"])
        if existing and doc_analyses.get(existing):
            area["linked_deliverables"].append({"existing_analysis": existing})
