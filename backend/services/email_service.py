"""
Email service — Titan Email (GoDaddy) SMTP.

Sends website contact / enquiry / partnership / newsletter submissions to the
iClinicalAI inbox (info@iclinical.ai). The notification's Reply-To is set to the
person who submitted the form, so pressing "Reply" in the mailbox responds
straight back to them.

The Titan mailbox password is read from EMAIL_PASSWORD in the root .env. Until
that is set, send_contact_email() returns False (the API stores the submission
either way, so nothing is lost — it just isn't emailed yet).
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr, formatdate
from html import escape

from config import (
    EMAIL_ADDRESS,
    EMAIL_PASSWORD,
    EMAIL_ENABLED,
    CONTACT_RECIPIENT,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USE_SSL,
)

BRAND = "iClinicalAI"
PRIMARY = "#4f46e5"
ACCENT = "#ec4899"

# Human-friendly labels for each form type
KIND_LABELS = {
    "enquiry": "New Website Enquiry",
    "partnership": "New Partnership Enquiry",
    "subscribe": "New Newsletter Subscriber",
}


def _row(label: str, value: str) -> str:
    """A single label/value row in the HTML email body."""
    if not value:
        return ""
    return f"""
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef0f5;vertical-align:top;width:150px;
                     font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">
            {escape(label)}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #eef0f5;font-size:15px;color:#0f172a;">
            {escape(value).replace(chr(10), '<br>')}
          </td>
        </tr>"""


def _build_html(kind: str, data: dict) -> str:
    title = KIND_LABELS.get(kind, "New Website Submission")
    rows = "".join([
        _row("Name", data.get("name", "")),
        _row("Email", data.get("email", "")),
        _row("Organization", data.get("organization", "")),
        _row("Subject", data.get("subject", "")),
        _row("Message", data.get("message", "")),
        _row("Source page", data.get("source_page", "")),
    ])

    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 10px 40px rgba(15,23,42,.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,{PRIMARY} 0%,{ACCENT} 100%);padding:32px 40px;">
              <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-.5px;">{BRAND}</div>
              <div style="font-size:12px;color:rgba(255,255,255,.85);margin-top:2px;
                          text-transform:uppercase;letter-spacing:1px;">Powered by IDDCR Global Research</div>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td style="padding:32px 40px 8px 40px;">
              <div style="display:inline-block;background:rgba(79,70,229,.1);color:{PRIMARY};
                          font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;
                          text-transform:uppercase;letter-spacing:.5px;">{escape(title)}</div>
              <h1 style="margin:16px 0 4px 0;font-size:22px;color:#0f172a;">You have a new message</h1>
              <p style="margin:0;font-size:14px;color:#64748b;">
                Submitted via the iClinicalAI website. Reply to this email to respond directly.
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:16px 40px 32px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:24px 40px;">
              <div style="font-size:13px;color:#cbd5e1;">
                &copy; 2026 {BRAND}. All rights reserved. Powered by IDDCR Global Research.
              </div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">Hyderabad, India &middot; info@iclinical.ai</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


def _build_plain(kind: str, data: dict) -> str:
    title = KIND_LABELS.get(kind, "New Website Submission")
    lines = [title, "=" * len(title), ""]
    for label, key in [
        ("Name", "name"), ("Email", "email"), ("Organization", "organization"),
        ("Subject", "subject"), ("Message", "message"), ("Source page", "source_page"),
    ]:
        val = data.get(key)
        if val:
            lines.append(f"{label}: {val}")
    lines += ["", "— Submitted via the iClinicalAI website (info@iclinical.ai)"]
    return "\n".join(lines)


def send_contact_email(kind: str, data: dict) -> bool:
    """
    Send a form submission to the iClinicalAI inbox.

    Returns True if the email was dispatched, False if email is not yet
    configured (no mailbox password) or the send failed. Callers should still
    persist the submission regardless of the return value.
    """
    if not EMAIL_ENABLED:
        print("[email] EMAIL_PASSWORD not set — submission stored but not emailed.")
        return False

    reply_to = (data.get("email") or "").strip()
    subject_label = KIND_LABELS.get(kind, "New Website Submission")
    who = data.get("name") or reply_to or "Website visitor"
    subject = f"{subject_label} — {who}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((f"{BRAND} Website", EMAIL_ADDRESS))
    msg["To"] = CONTACT_RECIPIENT
    msg["Date"] = formatdate(localtime=True)
    if reply_to:
        # Pressing "Reply" in the mailbox goes straight to the enquirer.
        msg["Reply-To"] = reply_to

    msg.attach(MIMEText(_build_plain(kind, data), "plain", "utf-8"))
    msg.attach(MIMEText(_build_html(kind, data), "html", "utf-8"))

    try:
        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as server:
                server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
                server.starttls()
                server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
                server.send_message(msg)
        print(f"[email] Sent '{kind}' notification to {CONTACT_RECIPIENT}.")
        return True
    except Exception as e:
        print(f"[email] Send failed: {e}")
        return False
