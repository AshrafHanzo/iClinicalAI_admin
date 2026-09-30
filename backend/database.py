import os
import json
from datetime import datetime, timedelta
from pathlib import Path
from sqlalchemy import create_engine, Column, String, Integer, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import config  # noqa: F401 — loads the root .env before DATABASE_URL is read

# Resolve DATABASE_URL from environment (set it in the root .env — see .env.example)
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

# Handle standard postgresql adapter name mapping for SQLAlchemy 1.4+
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Configure database engine
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    # SQLite requires check_same_thread disablement for multithreading in FastAPI
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL, 
    pool_pre_ping=True, 
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ──────────────────────────────────────────────────────────────────────
# Database Models
# ──────────────────────────────────────────────────────────────────────

class DocumentDB(Base):
    __tablename__ = "documents"

    id = Column(String(50), primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    safe_filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(Integer, nullable=False)
    upload_time = Column(String(100), nullable=False)
    extracted_text = Column(Text, nullable=False)
    word_count = Column(Integer, nullable=False)
    status = Column(String(50), nullable=False, default="processed")
    stats_json = Column(Text, nullable=True)  # JSON string
    analysis_results_json = Column(Text, nullable=True)  # JSON string
    user_id = Column(String(50), nullable=True, index=True)

class TrialDB(Base):
    __tablename__ = "trials"

    id = Column(String(50), primary_key=True, index=True)
    title = Column(Text, nullable=False)
    indication = Column(String(255), nullable=False, default="")
    therapeutic_area = Column(String(255), nullable=False, default="")
    phase = Column(String(100), nullable=False, default="")
    sponsor = Column(String(255), nullable=False, default="")
    drug_name = Column(String(255), nullable=False, default="")
    status = Column(String(100), nullable=False, default="")
    study_design = Column(Text, nullable=False, default="")
    mechanism_of_action = Column(Text, nullable=False, default="")
    countries_json = Column(Text, nullable=False, default="[]")  # JSON string of country list
    raw_data_json = Column(Text, nullable=False)  # Complete raw trial JSON


class UserDB(Base):
    __tablename__ = "users"

    id = Column(String(50), primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    fullname = Column(String(255), nullable=True)
    created_at = Column(String(100), nullable=False)
    is_approved = Column(Integer, nullable=False, default=0)  # 0 = pending, 1 = approved, 2 = rejected
    role = Column(String(50), nullable=False, default="user")  # "user", "admin"
    api_tokens_used = Column(Integer, nullable=False, default=0)
    last_login = Column(String(100), nullable=True)  # ISO timestamp of last login
    is_online = Column(Integer, nullable=False, default=0)  # 0 = offline, 1 = online
    last_heartbeat = Column(String(100), nullable=True)  # ISO timestamp of last heartbeat

class ApiUsageLogDB(Base):
    __tablename__ = "api_usage_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(50), index=True, nullable=False)
    module = Column(String(50), nullable=False)  # "DESIGN", "FIND", "MANAGE", "ANALYSE", "SAFETY"
    tokens = Column(Integer, nullable=False, default=0)
    timestamp = Column(DateTime, default=datetime.utcnow)


class ContactMessageDB(Base):
    """Website contact / enquiry / newsletter form submissions."""
    __tablename__ = "contact_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String(30), nullable=False, default="enquiry")  # "enquiry", "partnership", "subscribe"
    name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=False, index=True)
    organization = Column(String(255), nullable=True)
    subject = Column(String(255), nullable=True)
    message = Column(Text, nullable=True)
    source_page = Column(String(100), nullable=True)  # page the form was submitted from
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    email_sent = Column(Integer, nullable=False, default=0)  # 0 = not sent (queued), 1 = delivered

def init_db():
    Base.metadata.create_all(bind=engine)
    
    from sqlalchemy import text
    db = SessionLocal()
    
    # 1. Migrate user_id to documents
    try:
        db.execute(text("SELECT user_id FROM documents LIMIT 1"))
    except Exception:
        db.rollback()
        try:
            print("Migration: Adding user_id column to documents table...")
            db.execute(text("ALTER TABLE documents ADD COLUMN user_id VARCHAR(50)"))
            db.commit()
            print("Migration: user_id column successfully added.")
        except Exception as e:
            print("Migration error user_id:", e)
            db.rollback()

    # 2. Migrate is_approved to users
    try:
        db.execute(text("SELECT is_approved FROM users LIMIT 1"))
    except Exception:
        db.rollback()
        try:
            print("Migration: Adding is_approved column to users table...")
            db.execute(text("ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0"))
            db.commit()
            print("Migration: is_approved column successfully added.")
        except Exception as e:
            print("Migration error is_approved:", e)
            db.rollback()

    # 3. Migrate role to users
    try:
        db.execute(text("SELECT role FROM users LIMIT 1"))
    except Exception:
        db.rollback()
        try:
            print("Migration: Adding role column to users table...")
            db.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'"))
            db.commit()
            print("Migration: role column successfully added.")
        except Exception as e:
            print("Migration error role:", e)
            db.rollback()

    # 4. Migrate api_tokens_used to users
    try:
        db.execute(text("SELECT api_tokens_used FROM users LIMIT 1"))
    except Exception:
        db.rollback()
        try:
            print("Migration: Adding api_tokens_used column to users table...")
            db.execute(text("ALTER TABLE users ADD COLUMN api_tokens_used INTEGER DEFAULT 0"))
            db.commit()
            print("Migration: api_tokens_used column successfully added.")
        except Exception as e:
            print("Migration error api_tokens_used:", e)
            db.rollback()

    # 5. Migrate last_login to users
    try:
        db.execute(text("SELECT last_login FROM users LIMIT 1"))
    except Exception:
        db.rollback()
        try:
            print("Migration: Adding last_login column to users table...")
            db.execute(text("ALTER TABLE users ADD COLUMN last_login VARCHAR(100)"))
            db.commit()
            print("Migration: last_login column successfully added.")
        except Exception as e:
            print("Migration error last_login:", e)
            db.rollback()

    # 6. Seed admin user account if it does not exist
    try:
        admin_email = "imakabeer@gmail.com"
        admin = db.query(UserDB).filter(UserDB.email == admin_email).first()
        if not admin:
            import bcrypt
            import uuid
            print(f"Seeding admin account: {admin_email}...")
            pwd_bytes = "Kabeer@123".encode('utf-8')
            salt = bcrypt.gensalt()
            hashed_pwd = bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')
            new_admin = UserDB(
                id=str(uuid.uuid4())[:8],
                email=admin_email,
                fullname="Kabeer Admin",
                hashed_password=hashed_pwd,
                created_at=datetime.utcnow().isoformat(),
                is_approved=1,
                role="admin",
                api_tokens_used=0
            )
            db.add(new_admin)
            db.commit()
            print("Admin account seeded successfully.")
    except Exception as e:
        print("Seeding admin error:", e)
        db.rollback()

    # 7. Migrate is_online column to users
    try:
        db.execute(text("SELECT is_online FROM users LIMIT 1"))
    except Exception:
        db.rollback()
        try:
            print("Migration: Adding is_online column to users table...")
            db.execute(text("ALTER TABLE users ADD COLUMN is_online INTEGER DEFAULT 0"))
            db.commit()
            print("Migration: is_online column successfully added.")
        except Exception as e:
            print("Migration error is_online:", e)
            db.rollback()

    # 8. Migrate last_heartbeat column to users
    try:
        db.execute(text("SELECT last_heartbeat FROM users LIMIT 1"))
    except Exception:
        db.rollback()
        try:
            print("Migration: Adding last_heartbeat column to users table...")
            db.execute(text("ALTER TABLE users ADD COLUMN last_heartbeat VARCHAR(100)"))
            db.commit()
            print("Migration: last_heartbeat column successfully added.")
        except Exception as e:
            print("Migration error last_heartbeat:", e)
            db.rollback()

    # 9. On startup, mark all users as offline (server restarted, no active sessions)
    try:
        db.execute(text("UPDATE users SET is_online = 0"))
        db.commit()
        print("Startup: All users marked offline (server restarted).")
    except Exception as e:
        print("Startup online reset error:", e)
        db.rollback()
        
    db.close()

# Dependency generator to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
