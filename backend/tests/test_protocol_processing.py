"""Feature 01 engine: file validation, structure extraction, field extraction, confidence and conflicts."""

import asyncio
import io
import zipfile

import pytest

from services import protocol_intelligence as pi
from services.protocol_processing import ProtocolValidationError, process_protocol, validate_protocol_file
from tests.fixtures import build_docx, build_pdf


def extract(blocks, **kw):
    return asyncio.run(pi.extract_fields(blocks, use_ai=False, **kw))


# ─── Validation ──────────────────────────────────────────────────────

def test_accepts_valid_pdf_and_docx():
    assert validate_protocol_file("p.pdf", build_pdf(), 20) == ".pdf"
    assert validate_protocol_file("p.DOCX", build_docx(), 20) == ".docx"


@pytest.mark.parametrize("name,content,message", [
    ("p.txt", b"hello world", "PDF or DOCX"),
    ("p.pdf", b"", "empty"),
    ("p.pdf", b"not a pdf at all", "PDF header"),
    ("p.pdf", b"%PDF-1.4\n garbage without structure", "damaged"),
    ("p.docx", b"plain text pretending", "Word package"),
])
def test_rejects_invalid_files(name, content, message):
    with pytest.raises(ProtocolValidationError, match=message):
        validate_protocol_file(name, content, 20)


def test_rejects_docx_without_document_part():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hello.txt", "x")
    with pytest.raises(ProtocolValidationError, match="main document part"):
        validate_protocol_file("p.docx", buf.getvalue(), 20)


def test_rejects_oversize_file():
    with pytest.raises(ProtocolValidationError, match="too large"):
        validate_protocol_file("p.pdf", b"%PDF-" + b"0" * (2 * 1024 * 1024), 1)


def test_unreadable_pdf_reports_failure():
    with pytest.raises(ProtocolValidationError, match="No readable text"):
        process_protocol("scan.pdf", build_pdf(blank=True))


# ─── Structure ───────────────────────────────────────────────────────

def test_docx_structure_has_headings_tables_and_footnotes():
    p = process_protocol("p.docx", build_docx())
    kinds = {b["kind"] for b in p.blocks}
    assert {"heading", "paragraph", "list_item", "table", "footnote"} <= kinds
    soa = next(b for b in p.blocks if b["kind"] == "table" and "Screening" in b["text"])
    assert soa["section"] == "5 Schedule of Assessments"
    assert soa["table"][0][:2] == ["Assessment", "Screening"]
    # Numbered criteria are not mistaken for headings
    assert any(b["kind"] == "list_item" and "aged 18 to 75" in b["text"] for b in p.blocks)
    assert len(p.sha256) == 64


def test_pdf_blocks_carry_page_numbers():
    p = process_protocol("p.pdf", build_pdf())
    incl = [b for b in p.blocks if b["section"] == "3 INCLUSION CRITERIA" and b["kind"] == "list_item"]
    assert len(incl) == 2 and all(b["page"] == 2 for b in incl)
    assert any(b["kind"] == "heading" and b["page"] == 1 for b in p.blocks)


# ─── Field extraction ────────────────────────────────────────────────

def test_fields_are_traceable_to_source():
    p = process_protocol("p.docx", build_docx())
    f = pi.field_map(extract(p.blocks))
    assert f["phase"]["value"] == "Phase 3"
    assert f["sample_size"]["value"] == "240"
    ev = f["sample_size"]["evidence"][0]
    assert ev["section"] == "3 Study Design" and "240 participants" in ev["quote"] and ev["verified"]
    incl = f["inclusion_criteria"]
    assert incl["value"][0] == "Male or female aged 18 to 75 years."
    assert [e["item"] for e in incl["evidence"]] == [0, 1, 2]
    assert all(e["section"] == "4.1 Inclusion Criteria" for e in incl["evidence"])
    assert f["blinding"]["value"] == "double-blind"
    assert f["visits"]["value"][0].startswith("Screening")


def test_pdf_fields_cite_pages():
    p = process_protocol("p.pdf", build_pdf())
    f = pi.field_map(extract(p.blocks))
    assert f["phase"]["value"] == "Phase 2"
    assert f["exclusion_criteria"]["evidence"][0]["page"] == 2
    assert f["sample_size"]["value"] == "120"


def test_missing_fields_are_not_specified_not_invented():
    p = process_protocol("p.docx", build_docx())
    f = pi.field_map(extract(p.blocks))
    for key in ("hypotheses", "study_duration", "exploratory_endpoints"):
        assert f[key]["status"] == "missing"
        assert f[key]["evidence"] == []
        assert f[key]["needs_review"]
    assert f["hypotheses"]["value"] == pi.NOT_SPECIFIED


def test_conflicting_values_are_flagged_with_alternatives():
    p = process_protocol("p.docx", build_docx(synopsis_sample_size="Approximately 200 participants"))
    f = pi.field_map(extract(p.blocks))["sample_size"]
    assert f["status"] == "conflict"
    assert "200" in f["flags"][0] and "240" in f["flags"][0]
    assert f["alternatives"] and f["needs_review"]


def test_ai_evidence_is_verified_against_source(monkeypatch):
    p = process_protocol("p.docx", build_docx())

    async def fake_ai(system, user, **kw):
        return {"fields": {
            "hypotheses": {"value": "Drug X is superior to placebo", "evidence": [{"block_id": "b7", "quote": "Drug X is superior to placebo"}]},
            "study_duration": {"value": "28 weeks", "evidence": [{"block_id": "b99", "quote": "total duration of 28 weeks"}], "ambiguous": True,
                               "note": "follow-up length unclear"},
            "phase": {"value": "Phase 3", "evidence": [{"block_id": "b4", "quote": "Phase 3"}]},
        }}
    monkeypatch.setattr(pi, "chat_completion_json", fake_ai)
    monkeypatch.setattr(pi, "ai_available", lambda: True)
    data = asyncio.run(pi.extract_fields(p.blocks, use_ai=True))
    f = pi.field_map(data)
    assert data["extraction"]["ai_used"]
    # Quote not present in the protocol → low confidence and flagged, never silently accepted
    assert f["hypotheses"]["confidence_level"] == "low"
    assert not f["hypotheses"]["evidence"][0]["verified"]
    assert any("could not be found" in x for x in f["hypotheses"]["flags"])
    assert f["study_duration"]["confidence"] <= 0.5
    assert any("Ambiguous" in x for x in f["study_duration"]["flags"])
    # Agreement between rule-based and AI extraction raises confidence
    assert f["phase"]["source"] == "rule+ai" and f["phase"]["confidence_level"] == "high"


def test_ai_failure_falls_back_to_rules(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("network down")
    monkeypatch.setattr(pi, "chat_completion_json", boom)
    monkeypatch.setattr(pi, "ai_available", lambda: True)
    data = asyncio.run(pi.extract_fields(process_protocol("p.docx", build_docx()).blocks, use_ai=True))
    assert not data["extraction"]["ai_used"] and "network down" in data["extraction"]["ai_error"]
    assert pi.field_map(data)["phase"]["value"] == "Phase 3"
