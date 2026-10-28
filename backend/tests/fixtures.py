"""Synthetic protocol documents for tests. Content is fictional."""

import io

from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def build_docx(variant: str = "v1", synopsis_sample_size: str | None = None) -> bytes:
    """v1 = original, v2 = amendment of v1, unrelated = a different protocol."""
    d = Document()
    if variant == "unrelated":
        d.add_paragraph("An Open-Label Single-Arm Study of Compound Z in Relapsed Lymphoma", style="Title")
        d.add_paragraph("Protocol Number: ZL-104")
        d.add_heading("1 Background", level=1)
        d.add_paragraph("Lymphoma remains a serious haematological malignancy with limited options after relapse.")
        d.add_heading("2 Objectives", level=1)
        d.add_paragraph("To evaluate the overall response rate of compound Z by Lugano criteria.")
        d.add_heading("3 Treatment", level=1)
        d.add_paragraph("Compound Z is administered intravenously every three weeks until progression.")
        for i in range(8):
            d.add_paragraph(f"Haematology parameters, bone marrow biopsy and PET-CT imaging are performed in cycle {i + 1}.")
        return _save(d)

    v2 = variant == "v2"
    d.add_paragraph("A Phase 3, Randomized, Double-Blind, Placebo-Controlled Study of Drug X in Adults with Type 2 Diabetes", style="Title")
    d.add_paragraph("Protocol Number: DX-301")
    d.add_heading("1 Synopsis", level=1)
    t = d.add_table(rows=0, cols=2)
    rows = [("Sponsor", "Acme Pharma Ltd"), ("Phase", "Phase 3"),
            ("Primary Endpoint", "Change from baseline in HbA1c at Week 24")]
    if synopsis_sample_size:
        rows.append(("Planned Sample Size", synopsis_sample_size))
    for k, v in rows:
        cells = t.add_row().cells
        cells[0].text, cells[1].text = k, v

    d.add_heading("2 Objectives and Endpoints", level=1)
    d.add_heading("2.1 Primary Objective", level=2)
    d.add_paragraph("To evaluate the effect of Drug X on glycaemic control (HbA1c) compared with placebo.")
    d.add_heading("2.2 Secondary Objectives", level=2)
    d.add_paragraph("To evaluate the effect of Drug X on fasting plasma glucose.", style="List Bullet")
    d.add_paragraph("To evaluate the effect of Drug X on quality of life.", style="List Bullet")
    d.add_heading("2.3 Primary Endpoint", level=2)
    d.add_paragraph("Change from baseline in HbA1c at Week 24, measured by central laboratory assay.", style="List Bullet")
    d.add_heading("2.4 Secondary Endpoints", level=2)
    d.add_paragraph("Change from baseline in fasting plasma glucose at Week 24.", style="List Bullet")
    d.add_paragraph("Proportion of participants achieving HbA1c below 7.0%.", style="List Bullet")
    d.add_paragraph("Change in body weight.", style="List Bullet")

    d.add_heading("3 Study Design", level=1)
    d.add_paragraph("This is a randomized, double-blind, placebo-controlled, parallel-group study." if not v2
                    else "This is a randomized, double-blind, placebo-controlled, parallel group study.")
    n = "300" if v2 else "240"
    d.add_paragraph(f"Approximately {n} participants will be randomized in a 1:1 ratio to Drug X 10 mg or matching placebo.")
    d.add_heading("3.1 Treatment Arms", level=2)
    d.add_paragraph("Drug X 10 mg once daily", style="List Bullet")
    d.add_paragraph("Placebo once daily", style="List Bullet")

    d.add_heading("4 Study Population", level=1)
    d.add_paragraph("Adults with type 2 diabetes inadequately controlled on metformin.")
    d.add_heading("4.1 Inclusion Criteria", level=2)
    d.add_paragraph("Male or female aged 18 to 80 years." if v2 else "Male or female aged 18 to 75 years.", style="List Number")
    d.add_paragraph("HbA1c between 7.0% and 10.5% at screening.", style="List Number")
    d.add_paragraph("Stable metformin dose for at least 8 weeks.", style="List Number")
    d.add_heading("4.2 Exclusion Criteria", level=2)
    d.add_paragraph("Type 1 diabetes.", style="List Number")
    d.add_paragraph("eGFR below 45 mL/min/1.73m2.", style="List Number")
    if v2:
        d.add_paragraph("History of pancreatitis.", style="List Number")

    d.add_heading("5 Schedule of Assessments", level=1)
    window = "±7 days" if v2 else "±3 days"
    soa = [
        ["Assessment", "Screening", "Baseline", "Visit 3", "Visit 4", "Follow-up"],
        ["", "Day -14 to -1", "Day 1", f"Week 12 ({window})", f"Week 24 ({window})", "Week 28"],
        ["Informed consent", "X", "", "", "", ""],
        ["Laboratory", "", "", "", "", ""],
        ["HbA1c", "X", "X", "X", "Xa", ""],
        ["Fasting plasma glucose", "", "X", "X", "X", ""],
        ["Vital signs", "X", "X", "X", "X", "X"],
        ["Physical examination", "X", "", "", "", ""],
    ]
    t = d.add_table(rows=0, cols=6)
    for r in soa:
        cells = t.add_row().cells
        for i, v in enumerate(r):
            cells[i].text = v
    d.add_paragraph("a. Central laboratory sample collected after an overnight fast.")
    d.add_paragraph("Visit windows are relative to Day 1, the day of first dose.")

    d.add_heading("6 Safety Assessments", level=1)
    d.add_paragraph("Adverse events", style="List Bullet")
    d.add_paragraph("Vital signs", style="List Bullet")
    d.add_paragraph("12-lead ECG", style="List Bullet")

    d.add_heading("7 Statistical Methods", level=1)
    d.add_paragraph("The primary endpoint, change from baseline in HbA1c at Week 26, will be analysed using a mixed model for repeated measures.")
    d.add_paragraph("A two-sided significance level of 0.05 will be used.")
    return _save(d)


def _save(d) -> bytes:
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_pdf(blank: bool = False) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    if blank:
        c.showPage()
        c.save()
        return buf.getvalue()
    pages = [
        ["A Phase 2 Randomized Open-Label Study of Drug Y in Moderate Asthma", "",
         "Protocol Number: DY-201", "", "1 STUDY DESIGN",
         "This is a randomized, open-label, parallel-group study.",
         "Approximately 120 patients will be randomized in a 2:1 ratio to Drug Y or standard of care.", "",
         "2 STUDY POPULATION", "Adults with moderate persistent asthma."],
        ["3 INCLUSION CRITERIA", "1. Age 18 to 65 years.", "2. FEV1 between 50% and 80% of predicted.", "",
         "4 EXCLUSION CRITERIA", "1. Current smokers.", "2. Asthma exacerbation within 4 weeks.", "",
         "5 PRIMARY ENDPOINT", "1. Change from baseline in FEV1 at Week 12 measured by spirometry."],
    ]
    for lines in pages:
        y = 800
        for line in lines:
            c.drawString(50, y, line)
            y -= 18
        c.showPage()
    c.save()
    return buf.getvalue()


# ─── Fixtures reproducing patterns found in real protocols ───────────

def build_complex_pdf() -> bytes:
    """Contents page, running header with a drug code, sub-sectioned criteria, per-cohort and breakdown counts,
    endpoints only inside an analysis section, and a schedule table that marks 'not done' by grey shading."""
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    def header(page_no, total=5):
        c.drawString(50, 815, f"QRS-456,001 Page {page_no} of {total}")

    header(1)
    y = 780
    for line in ["TABLE OF CONTENTS", "1 Study Design ............................ 2", "2 Study Population ...................... 2",
                 "2.1 Inclusion Criteria .................. 2", "3 Statistics ................................. 4",
                 "3.1 Randomization Scheme ................ 3", "4 Schedule of Events ..................... 5"]:
        c.drawString(50, y, line)
        y -= 18
    c.showPage()

    header(2)
    y = 780
    for line in ["A Randomized, Double-Blind Study of Drug Q in Healthy Volunteers", "",
                 "1 STUDY DESIGN", "This is a randomized, double-blind, placebo-controlled, single dose study.",
                 "Approximately 14 HD subjects and 8 healthy subjects will be enrolled in Part B.",
                 "Forty (40) eligible healthy volunteers will be enrolled into 4 cohorts.", "",
                 "2 STUDY POPULATION", "Healthy adult volunteers.", "",
                 "2.1 Inclusion Criteria", "Subjects must meet all of the following criteria:",
                 "2.1.1 Part A Only", "1. Age 18 to 55 years.", "2. Body mass index 18 to 30 kg/m2.",
                 "2.1.2 Part B Only", "1. Stable renal function.", "", "3 STATISTICS"]:
        c.drawString(50, y, line)
        y -= 18
    c.showPage()

    header(3)
    y = 780
    for line in ["3.1 Randomization Scheme", "Subjects will be randomized in a 4:1 fashion to Drug Q or placebo.",
                 "Target enrollment is 8 PK evaluable subjects in each cohort.", "",
                 "3.2 Primary Endpoint Analysis", "The safety evaluation will be based on the following:",
                 "1. Incidence of adverse events.", "2. Clinical laboratory abnormalities."]:
        c.drawString(50, y, line)
        y -= 18
    c.showPage()

    header(4)
    c.drawString(50, 780, "3.3 Background")
    c.drawString(50, 762, "The opioid hypothesis has evolved as the proposed etiology of pruritus.")
    c.showPage()

    header(5)
    c.drawString(50, 780, "4 SCHEDULE OF EVENTS")
    data = [["Assessment", "Screening Day -14", "Day 1 Dosing", "Day 8 (±1)"],
            ["Informed Consent", "", "", ""],
            ["Vital Signs", "", "pre-dose", ""],
            ["12-lead ECG", "", "", ""],
            ["Urinalysis", "", "", ""]]
    t = Table(data, colWidths=[140, 110, 110, 110], rowHeights=20)
    grey = colors.Color(0.75, 0.75, 0.75)
    style = [("GRID", (0, 0), (-1, -1), 0.8, colors.black)]
    # Shaded = not performed: consent only at screening, ECG not at screening, urinalysis only at day 8
    for col, row in [(2, 1), (3, 1), (1, 3), (1, 4), (2, 4)]:
        style.append(("BACKGROUND", (col, row), (col, row), grey))
    t.setStyle(TableStyle(style))
    t.wrapOn(c, 500, 400)
    t.drawOn(c, 50, 620)
    c.showPage()
    c.save()
    return buf.getvalue()


def _shade(cell, fill="BFBFBF"):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    cell._tc.get_or_add_tcPr().append(shd)


def build_titled_soa_docx(shaded: bool = False) -> bytes:
    """Schedule table whose first row is a title, with a weekday row, Day -1 and Day 1 columns, a footnote marker
    in an assessment name and a coded legend below. With shaded=True assignments are given only by cell shading."""
    d = Document()
    d.add_paragraph("A Phase 1 Study of Drug R in Healthy Volunteers", style="Title")
    d.add_heading("1 Study Design", level=1)
    d.add_paragraph("This is an open-label study. Approximately 12 subjects will be enrolled.")
    d.add_heading("2 Procedures", level=1)
    rows = [
        ["Table 1: Schedule of Assessments", "", "", "", ""],
        ["Assessment", "Screening (Day -28 to Day -2)", "Day -1", "Day 1", "End of Study a Visit"],
        ["Week Day", "", "F", "S", "Su"],
        ["Informed Consent", "X", "", "", ""],
        ["b Medical history", "X", "X", "", ""],
        ["Blood collection for PK", "", "", "A", "B"],
        ["Vital Signs", "X", "X", "X", "X"],
    ]
    if shaded:
        rows = [r if i < 3 else [r[0]] + ["" for _ in r[1:]] for i, r in enumerate(rows)]
    t = d.add_table(rows=0, cols=5)
    for i, r in enumerate(rows):
        cells = t.add_row().cells
        for j, v in enumerate(r):
            cells[j].text = v
            if shaded and i >= 3 and j >= 1 and (i + j) % 2 == 0:
                _shade(cells[j])
    d.add_paragraph("Pharmacokinetic Sampling Schedule:")
    d.add_paragraph("A: 2 mL blood at 0, 1, 2 and 4 hours post dose.")
    d.add_paragraph("B: 2 mL blood at end of study.")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_sap_docx(primary_week: int = 26) -> bytes:
    """A statistical analysis plan whose primary endpoint time point differs from the protocol (Week 24)."""
    d = Document()
    d.add_paragraph("Statistical Analysis Plan for Study DX-301", style="Title")
    d.add_heading("4 Endpoints", level=1)
    d.add_heading("4.1 Primary Endpoint", level=2)
    d.add_paragraph(f"Change from baseline in HbA1c at Week {primary_week}.")
    d.add_heading("4.2 Secondary Endpoints", level=2)
    d.add_paragraph("Change from baseline in fasting plasma glucose at Week 24.")
    d.add_heading("5 Hypotheses", level=1)
    d.add_paragraph("The null hypothesis is that Drug X does not differ from placebo in change in HbA1c.")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_synopsis_docx_with_hypothesis() -> bytes:
    d = Document()
    d.add_paragraph("Protocol Synopsis DX-301", style="Title")
    d.add_heading("Study Rationale", level=1)
    d.add_paragraph("Type 2 diabetes remains inadequately controlled in many adults despite metformin therapy, "
                    "and additional oral options with good tolerability are needed for long-term glycaemic control.")
    d.add_heading("Study Hypotheses", level=1)
    d.add_paragraph("Drug X 10 mg is superior to placebo in reducing HbA1c at Week 24.")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_soa_template_xlsx() -> bytes:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Sponsor SoA"
    ws["A1"] = "Sponsor SoA template — Study {{STUDY_ID}} version {{PROTOCOL_VERSION}} ({{STATUS}})"
    ws["A3"] = "{{SOA_TABLE}}"
    ws["H3"] = "{{SOA_FOOTNOTES}}"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_soa_template_docx() -> bytes:
    d = Document()
    d.add_paragraph("Sponsor SoA — {{STUDY_ID}} / {{PROTOCOL_VERSION}}")
    d.add_paragraph("{{SOA_TABLE}}")
    d.add_paragraph("Footnotes: {{SOA_FOOTNOTES}}")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()
