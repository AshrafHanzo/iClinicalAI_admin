"""
Protocol Processing
Validates protocol files and extracts an ordered block structure (headings, paragraphs,
list items, tables, footnotes) with page and section references for source traceability.
"""

import hashlib
import io
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree

import PyPDF2
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

PROTOCOL_EXTENSIONS = {".pdf", ".docx"}
MIN_TEXT_CHARS = 200

_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_NUMBERED_HEADING = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){0,4})\.?\s+([A-Z][^\n]{2,90})$")
_LIST_START = re.compile(r"^(\d{1,2}[\.\)]|[a-z][\.\)]|[ivx]{1,4}[\.\)]|[•\-–▪●○◦])\s+")
_FOOTNOTE_START = re.compile(r"^(?:[a-z]|\d{1,2}|\*{1,3}|†|‡|§)[\.\):]?\s+\S|^(?:Note|Notes|Footnote)s?\s*[:.]", re.I)


class ProtocolValidationError(ValueError):
    """Raised when an uploaded protocol fails validation. The message is safe to show to users."""


@dataclass
class ProcessedDocument:
    blocks: list[dict]
    page_count: int | None
    text: str
    sha256: str
    warnings: list[str] = field(default_factory=list)


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


# ─── Validation ──────────────────────────────────────────────────────

def validate_protocol_file(filename: str, content: bytes, max_mb: int) -> str:
    """Check type, size and container integrity. Returns the normalised extension."""
    ext = Path(filename or "").suffix.lower()
    if ext not in PROTOCOL_EXTENSIONS:
        raise ProtocolValidationError(f"Unsupported file type '{ext or 'none'}'. Protocols must be PDF or DOCX.")
    if not content:
        raise ProtocolValidationError("The uploaded file is empty.")
    if len(content) > max_mb * 1024 * 1024:
        raise ProtocolValidationError(f"File too large. Maximum size is {max_mb} MB.")

    if ext == ".pdf":
        if not content.lstrip()[:5].startswith(b"%PDF-"):
            raise ProtocolValidationError("The file does not look like a valid PDF (missing PDF header).")
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            if reader.is_encrypted and not reader.decrypt(""):
                raise ProtocolValidationError("The PDF is password protected. Upload an unprotected copy.")
            if len(reader.pages) == 0:
                raise ProtocolValidationError("The PDF has no pages.")
        except ProtocolValidationError:
            raise
        except Exception as e:
            raise ProtocolValidationError(f"The PDF appears to be damaged and could not be read ({type(e).__name__}).")
    else:
        if not content.startswith(b"PK\x03\x04"):
            raise ProtocolValidationError("The file does not look like a valid DOCX (not a Word package).")
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                if "word/document.xml" not in zf.namelist():
                    raise ProtocolValidationError("The DOCX package is missing its main document part.")
                if zf.testzip() is not None:
                    raise ProtocolValidationError("The DOCX package is corrupted.")
        except ProtocolValidationError:
            raise
        except zipfile.BadZipFile:
            raise ProtocolValidationError("The DOCX package is corrupted.")
    return ext


# ─── Structure extraction ────────────────────────────────────────────

def _clean(s: str) -> str:
    return re.sub(r"[ \t ]+", " ", s or "").strip()


class _BlockBuilder:
    def __init__(self):
        self.blocks: list[dict] = []
        self.section = "Front matter"

    def add(self, kind: str, text: str, page: int | None, table: list[list[str]] | None = None):
        text = _clean(text) if kind != "table" else text
        if not text:
            return
        if kind == "heading":
            self.section = text
        block = {"id": f"b{len(self.blocks) + 1}", "kind": kind, "page": page,
                 "section": self.section, "text": text}
        if table is not None:
            block["table"] = table
        self.blocks.append(block)
        return block


def _is_numbered_heading(line: str) -> bool:
    """'5.1 Inclusion Criteria' or '6 STUDY POPULATION', but not a numbered criterion like '1. Male aged 18'."""
    m = _NUMBERED_HEADING.match(line)
    if not m or line.rstrip().endswith((".", ";", ",")) or len(line.split()) > 14:
        return False
    title = m.group(2)
    if "." in m.group(1).strip("."):
        return True  # multi-level numbering (5.1, 6.2.3) is a heading convention
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z\-]*", title) if len(w) > 3]
    return title.isupper() or (len(title.split()) <= 8 and all(w[0].isupper() for w in words))


_TOC_LINE = re.compile(r"(\.{4,}|…{2,}|\. \. \. )\s*\d{1,3}\s*$|^(table of )?contents$", re.I)
# Symbol-font bullets that PDF text extraction returns as private-use characters or "(cid:N)"
_PDF_BULLETS = re.compile(r"\s*(?:[\x00]|\(cid:\d+\))\s*")


def expand_bullets(lines: list[str]) -> list[str]:
    """Split lines holding several symbol-font bullets ('\\x00 Deaths \\x00 AEs') into separate '• ' list lines."""
    out = []
    for line in lines:
        parts = _PDF_BULLETS.split(line) if _PDF_BULLETS.search(line) else [line]
        if len(parts) > 1:
            if parts[0].strip():
                out.append(parts[0])
            out += ["• " + p for p in parts[1:] if p.strip()]
        else:
            out.append(line)
    return out


def _looks_like_heading(line: str) -> bool:
    if _TOC_LINE.search(line):
        return False
    if _is_numbered_heading(line):
        return True
    letters = [c for c in line if c.isalpha()]
    return (4 <= len(line) <= 80 and letters and all(c.isupper() for c in letters)
            and len(line.split()) <= 10 and not line.rstrip().endswith((".", ";", ",")))


def _repeated_lines(pages_lines: list[list[str]]) -> set[str]:
    """Running headers/footers: lines (digits ignored) present on at least 40% of pages."""
    if len(pages_lines) < 4:
        return set()
    counts: dict[str, int] = {}
    for lines in pages_lines:
        for key in {re.sub(r"\d+", "#", ln) for ln in lines[:4] + lines[-4:] if ln}:
            counts[key] = counts.get(key, 0) + 1
    return {k for k, n in counts.items() if n >= max(3, 0.4 * len(pages_lines))}


def _is_grey(color) -> bool:
    if not isinstance(color, (tuple, list)) or not color:
        return False
    vals = list(color)
    if len(vals) == 4:  # CMYK: grey has no colour components and partial black
        return max(vals[:3]) < 0.05 and 0.05 < vals[3] < 0.6
    return all(0.4 < v < 0.95 for v in vals) and max(vals) - min(vals) < 0.08


def _pdf_tables(content: bytes) -> dict[int, list[dict]]:
    """Tables per page with cell text and grey shading (some schedules mark 'not done' by shading)."""
    try:
        import pdfplumber
    except ImportError:
        return {}
    out: dict[int, list[dict]] = {}
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            try:
                tables = page.find_tables()
            except Exception:
                continue
            if not tables:
                continue
            fills = [r for r in page.rects if r.get("fill") and _is_grey(r.get("non_stroking_color"))
                     and r["width"] > 3 and r["height"] > 3]
            for t in tables:
                rows, shaded = [], []
                for row, cells in zip(t.extract(), t.rows):
                    rows.append([_clean((c or "").replace("\n", " ")) for c in row])
                    flags = []
                    for bbox in cells.cells:
                        if not bbox:
                            flags.append(False)
                            continue
                        x0, top, x1, bottom = bbox
                        area = max(1.0, (x1 - x0) * (bottom - top))
                        cover = sum(max(0, min(x1, r["x1"]) - max(x0, r["x0"])) * max(0, min(bottom, r["bottom"]) - max(top, r["top"]))
                                    for r in fills)
                        flags.append(cover / area >= 0.6)
                    shaded.append(flags)
                if len(rows) >= 2 and max(len(r) for r in rows) >= 2:
                    out.setdefault(page_no, []).append({"rows": rows, "shaded": shaded if any(any(r) for r in shaded) else None})
    return out


def _extract_pdf(content: bytes) -> tuple[list[dict], int]:
    reader = PyPDF2.PdfReader(io.BytesIO(content))
    if reader.is_encrypted:
        reader.decrypt("")
    pages_lines = [[_clean(ln) for ln in (page.extract_text() or "").splitlines()] for page in reader.pages]
    repeated = _repeated_lines(pages_lines)
    tables = _pdf_tables(content)
    b = _BlockBuilder()
    for page_no, lines in enumerate(pages_lines, start=1):
        lines = [ln for ln in lines if re.sub(r"\d+", "#", ln) not in repeated]
        toc_page = sum(1 for ln in lines if _TOC_LINE.search(ln)) >= 5
        para: list[str] = []
        para_kind = "paragraph"

        def flush():
            nonlocal para, para_kind
            if para:
                b.add(para_kind, " ".join(para), page_no)
            para, para_kind = [], "paragraph"

        if toc_page:
            # Contents pages are kept for completeness but never used as evidence
            b.add("toc", "\n".join(ln for ln in lines if ln), page_no)
            continue

        for line in expand_bullets(lines):
            line = _clean(line)
            if not line:
                flush()
                continue
            if _TOC_LINE.search(line):
                flush()
                b.add("toc", line, page_no)
                continue
            if _looks_like_heading(line):
                flush()
                b.add("heading", line, page_no)
                continue
            if _LIST_START.match(line):
                flush()
                para_kind = "list_item"
            elif re.match(r"^(Note|Notes|Footnote)s?\s*[:.]", line, re.I):
                flush()
                para_kind = "footnote"
            elif re.match(r"^[A-Z][A-Za-z /()]{2,40}:\s+\S", line):
                flush()  # "Label: value" lines (title pages, synopses) start their own block
            para.append(line)
            if line.endswith((".", ":", ";")) and para_kind == "paragraph":
                flush()
        flush()
        for t in tables.get(page_no, []):
            blk = b.add("table", "\n".join(" | ".join(r) for r in t["rows"]), page_no, table=t["rows"])
            if blk is not None and t["shaded"]:
                blk["shaded"] = t["shaded"]
    return b.blocks, len(reader.pages)


def _docx_cell_shaded(cell) -> bool:
    """True when a Word table cell has a grey background fill."""
    tc_pr = cell._tc.tcPr
    shd = tc_pr.find(_W_NS + "shd") if tc_pr is not None else None
    fill = (shd.get(_W_NS + "fill") if shd is not None else None) or ""
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", fill):
        return False
    r, g, b = (int(fill[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return _is_grey((r, g, b))


def _iter_docx_body(doc):
    for child in doc.element.body.iterchildren():
        if child.tag == _W_NS + "p":
            yield Paragraph(child, doc)
        elif child.tag == _W_NS + "tbl":
            yield Table(child, doc)


def _docx_footnotes(content: bytes) -> list[str]:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            if "word/footnotes.xml" not in zf.namelist():
                return []
            root = ElementTree.fromstring(zf.read("word/footnotes.xml"))
    except Exception:
        return []
    notes = []
    for fn in root.findall(_W_NS + "footnote"):
        if int(fn.get(_W_NS + "id", "0")) <= 0:
            continue  # separators
        text = "".join(t.text or "" for t in fn.iter(_W_NS + "t"))
        if text.strip():
            notes.append(text.strip())
    return notes


def _extract_docx(content: bytes) -> list[dict]:
    doc = Document(io.BytesIO(content))
    b = _BlockBuilder()
    after_table = False
    for item in _iter_docx_body(doc):
        if isinstance(item, Table):
            # Merged cells repeat their text in each grid column, which keeps columns aligned
            rows = [[_clean(cell.text) for cell in row.cells] for row in item.rows]
            if rows:
                flat = "\n".join(" | ".join(r) for r in rows)
                blk = b.add("table", flat, None, table=rows)
                shaded = [[_docx_cell_shaded(cell) for cell in row.cells] for row in item.rows]
                if blk is not None and any(any(r) for r in shaded):
                    blk["shaded"] = shaded
                after_table = True
            continue
        text = _clean(item.text)
        if not text:
            continue
        style = (item.style.name if item.style is not None else "") or ""
        if style.startswith("Heading") or style == "Title" or ("List" not in style and _is_numbered_heading(text)):
            b.add("heading", text, None)
            after_table = False
        elif after_table and _FOOTNOTE_START.match(text) and len(text) < 600:
            b.add("footnote", text, None)
        elif "List" in style or _LIST_START.match(text):
            b.add("list_item", text, None)
            after_table = False
        else:
            b.add("paragraph", text, None)
            after_table = False
    for note in _docx_footnotes(content):
        b.section = "Footnotes"
        b.add("footnote", note, None)
    return b.blocks


def blocks_to_text(blocks: list[dict]) -> str:
    return "\n\n".join(bl["text"] for bl in blocks)


def process_protocol(filename: str, content: bytes) -> ProcessedDocument:
    """Extract ordered, referenceable blocks. Raises ProtocolValidationError if the text is unreadable."""
    ext = Path(filename).suffix.lower()
    warnings = []
    try:
        if ext == ".pdf":
            blocks, pages = _extract_pdf(content)
        else:
            blocks, pages = _extract_docx(content), None
    except Exception as e:
        raise ProtocolValidationError(f"Text extraction failed ({type(e).__name__}).")

    text = blocks_to_text(blocks)
    letters = sum(c.isalpha() for c in text)
    if len(text) < MIN_TEXT_CHARS or letters < MIN_TEXT_CHARS * 0.5:
        raise ProtocolValidationError(
            "No readable text could be extracted. The document may be a scanned image; OCR is not supported, "
            "so upload a text-based PDF or DOCX."
        )
    if not any(bl["kind"] == "heading" for bl in blocks):
        warnings.append("No section headings were detected; section references will be limited.")
    if ext == ".docx":
        warnings.append("DOCX files carry no fixed pagination; evidence is referenced by section and paragraph.")
    return ProcessedDocument(blocks=blocks, page_count=pages, text=text, sha256=sha256_bytes(content), warnings=warnings)


def block_ref(block: dict) -> str:
    """Human readable source location for a block."""
    parts = []
    if block.get("page"):
        parts.append(f"p. {block['page']}")
    if block.get("section"):
        parts.append(f"§ {block['section']}")
    parts.append(block["id"])
    return ", ".join(parts)
