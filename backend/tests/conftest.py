"""
Test setup: an isolated SQLite database and upload folder, and no OpenAI key, so AI paths are
off unless a test mocks them. Environment variables are set before the app is imported.
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="iclinical_tests_"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["OPENAI_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import routes.design as design_routes  # noqa: E402
from database import SessionLocal, UserDB  # noqa: E402
from main import app  # noqa: E402
from routes.auth import create_access_token  # noqa: E402


@pytest.fixture(autouse=True)
def _uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(design_routes, "UPLOAD_DIR", tmp_path)


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


def make_user(approved: int = 1) -> tuple[str, dict]:
    db = SessionLocal()
    uid = uuid.uuid4().hex[:8]
    db.add(UserDB(id=uid, email=f"{uid}@example.test", hashed_password="x", fullname=f"User {uid}",
                  created_at="2026-01-01T00:00:00", is_approved=approved, role="user"))
    db.commit()
    db.close()
    return f"{uid}@example.test", {"Authorization": f"Bearer {create_access_token(uid)}"}


@pytest.fixture
def owner():
    return make_user()


@pytest.fixture
def other():
    return make_user()
