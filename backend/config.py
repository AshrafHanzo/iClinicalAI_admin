import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# OpenAI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = "gpt-4o-mini"

# File upload settings
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE_MB = 20
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".csv", ".xlsx"}

# Registration toggle
ALLOW_REGISTRATION = True

# ─── Email settings (Titan Email / GoDaddy) ───────────────────────
# The Titan mailbox password is read from EMAIL_PASSWORD in the root .env.
# Leave it blank until the client provides it — the API will accept form
# submissions and store them, but skip the SMTP send until a password is set.
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "Titan Email (GoDaddy)")
EMAIL_ADDRESS = os.getenv("EMAIL", "info@iclinical.ai")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
CONTACT_RECIPIENT = os.getenv("CONTACT_RECIPIENT") or EMAIL_ADDRESS
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.titan.email")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "true").lower() in ("1", "true", "yes")

# Safety cap: maximum number of form emails the server will send per day
MAX_EMAILS_PER_DAY = int(os.getenv("MAX_EMAILS_PER_DAY", "200"))

# True once a mailbox password has been configured
EMAIL_ENABLED = bool(EMAIL_PASSWORD)

