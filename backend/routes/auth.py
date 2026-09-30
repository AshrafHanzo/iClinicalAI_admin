import uuid
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
import jwt

from database import get_db, UserDB
from config import ALLOW_REGISTRATION

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# JWT Configuration
JWT_SECRET = "ICLINICAL_SECRET_KEY_2026_SECURE_TOKEN"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

# ─── Pydantic Schemas ─────────────────────────────────────────────

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str
    fullname: Optional[str] = None

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    fullname: Optional[str]
    created_at: str
    is_approved: int
    role: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# ─── Helper Functions ─────────────────────────────────────────────

def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    try:
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": user_id, "exp": expire}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user_from_token(token: str, db: Session) -> UserDB:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
            )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    # Restrict unapproved/suspended users
    if user.role != "admin" and user.is_approved != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account access has been suspended or is pending approval.",
        )
    return user

# ─── Auth Endpoints ───────────────────────────────────────────────

@router.post("/register", response_model=UserResponse)
async def register(req: UserRegisterRequest, db: Session = Depends(get_db)):
    if not ALLOW_REGISTRATION:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is currently disabled.",
        )
    
    # Check if user already exists
    existing_user = db.query(UserDB).filter(UserDB.email == req.email.lower()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )
    
    # Create new user
    user_id = str(uuid.uuid4())[:8]
    hashed_pwd = hash_password(req.password)
    
    new_user = UserDB(
        id=user_id,
        email=req.email.lower(),
        hashed_password=hashed_pwd,
        fullname=req.fullname,
        created_at=datetime.utcnow().isoformat(),
        is_approved=0,  # 0 = pending, 1 = approved, 2 = rejected
        role="user"
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return UserResponse(
        id=new_user.id,
        email=new_user.email,
        fullname=new_user.fullname,
        created_at=new_user.created_at,
        is_approved=new_user.is_approved,
        role=new_user.role
    )


@router.post("/login", response_model=LoginResponse)
async def login(req: UserLoginRequest, db: Session = Depends(get_db)):
    # Find user by email
    user = db.query(UserDB).filter(UserDB.email == req.email.lower()).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    
    # Check if account is approved
    if user.role != "admin":
        if user.is_approved == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your access request is currently pending administrator approval.",
            )
        elif user.is_approved == 2:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account access has been suspended or rejected. Please contact support.",
            )
    
    # Update last_login timestamp and mark user as online
    from datetime import datetime
    now = datetime.utcnow().isoformat() + "Z"
    user.last_login = now
    user.is_online = 1
    user.last_heartbeat = now
    db.commit()
    
    # Create access token
    token = create_access_token(user.id)
    
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            fullname=user.fullname,
            created_at=user.created_at,
            is_approved=user.is_approved,
            role=user.role
        )
    )

def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> UserDB:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
        )
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Use 'Bearer <token>'",
        )
        
    token = parts[1]
    return get_current_user_from_token(token, db)

@router.get("/me", response_model=UserResponse)
async def get_me(user: UserDB = Depends(get_current_user)):
    return UserResponse(
        id=user.id,
        email=user.email,
        fullname=user.fullname,
        created_at=user.created_at,
        is_approved=user.is_approved,
        role=user.role
    )

@router.post("/heartbeat")
async def heartbeat(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """Called periodically by the frontend to signal that the user is still active."""
    from datetime import datetime
    now = datetime.utcnow().isoformat() + "Z"
    user.is_online = 1
    user.last_heartbeat = now
    db.commit()
    return {"status": "ok", "timestamp": now}

@router.post("/logout")
async def logout(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mark the user as offline when they explicitly log out."""
    user.is_online = 0
    db.commit()
    return {"status": "ok", "message": "Logged out successfully."}
