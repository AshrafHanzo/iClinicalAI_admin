import csv
from pathlib import Path
import PyPDF2
from docx import Document



def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from a PDF file."""
    text_parts = []
    reader = PyPDF2.PdfReader(file_path)
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)
    return "\n\n".join(text_parts)


def extract_text_from_docx(file_path: str) -> str:
    """Extract text from a DOCX file, including tables."""
    doc = Document(file_path)
    text_parts = []

    # Extract paragraphs
    for para in doc.paragraphs:
        if para.text.strip():
            text_parts.append(para.text)

    # Extract tables
    for table in doc.tables:
        table_rows = []
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            table_rows.append(" | ".join(cells))
        if table_rows:
            text_parts.append("\n".join(table_rows))

    return "\n\n".join(text_parts)


def extract_text_from_txt(file_path: str) -> str:
    """Extract text from a plain text file."""
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def extract_text_from_csv(file_path: str) -> str:
    """Extract text from a CSV file."""
    rows_text = []
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if i < 500:
                rows_text.append(" | ".join(row))
            else:
                rows_text.append("... [truncated due to length]")
                break
    return "\n".join(rows_text)


def extract_text_from_xlsx(file_path: str) -> str:
    """Extract text from an Excel file using pandas."""
    try:
        import pandas as pd
        excel_data = pd.read_excel(file_path, sheet_name=None)
        text_parts = []
        for sheet_name, df in excel_data.items():
            text_parts.append(f"### Sheet: {sheet_name} ###")
            text_parts.append(" | ".join(map(str, df.columns)))
            for i, row in df.head(100).iterrows():
                row_str = " | ".join(map(str, row.values))
                text_parts.append(row_str)
            if len(df) > 100:
                text_parts.append("... [truncated due to length]")
        return "\n".join(text_parts)
    except Exception as e:
        return f"[Excel Extraction Error: {str(e)}]"


def extract_text(file_path: str) -> str:
    """
    Extract text from a document based on its file extension.
    Supports: .pdf, .docx, .doc, .txt, .csv, .xlsx
    """
    ext = Path(file_path).suffix.lower()

    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext in (".docx", ".doc"):
        return extract_text_from_docx(file_path)
    elif ext == ".txt":
        return extract_text_from_txt(file_path)
    elif ext == ".csv":
        return extract_text_from_csv(file_path)
    elif ext == ".xlsx":
        return extract_text_from_xlsx(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")



def get_document_stats(text: str) -> dict:
    """Get basic statistics about the extracted text."""
    words = text.split()
    sentences = text.count(".") + text.count("!") + text.count("?")
    paragraphs = len([p for p in text.split("\n\n") if p.strip()])

    return {
        "word_count": len(words),
        "sentence_count": sentences,
        "paragraph_count": paragraphs,
        "character_count": len(text),
    }
