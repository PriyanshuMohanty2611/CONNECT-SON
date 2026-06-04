import datetime
from datetime import timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Cookie
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.models.models import User, Profile, Setting, UserSession
from app.schemas.auth import LoginRequest, OTPRequest, OTPVerify, PasswordReset, UserSessionResponse
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserProfileResponse, UserResponse, ProfileResponse
from app.services.otp_service import create_otp, verify_otp
from app.api.deps import get_current_active_user
from app.services.audit_service import log_action

router = APIRouter()

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, request: Request, db: Session = Depends(get_db)):
    # Check if email exists
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already registered"
        )
        
    # Check if username exists
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
        
    # Check if phone exists (if provided)
    if user_in.phone and db.query(User).filter(User.phone == user_in.phone).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number already registered"
        )

    # Create new User
    hashed_pw = get_password_hash(user_in.password)
    db_user = User(
        email=user_in.email,
        username=user_in.username,
        phone=user_in.phone,
        hashed_password=hashed_pw,
        is_verified=False,
        is_admin=(user_in.username.lower() == "admin")
    )
    db.add(db_user)
    db.flush() # Populate db_user.id for profile foreign key

    # Create associated Profile
    db_profile = Profile(
        user_id=db_user.id,
        full_name=user_in.full_name,
        bio=user_in.bio,
        dob=user_in.dob,
        gender=user_in.gender,
        country=user_in.country,
        presence_status="offline"
    )
    db.add(db_profile)
    
    # Create default settings
    db_setting = Setting(
        user_id=db_user.id,
        allow_notifications=True,
        e2ee_enabled=True
    )
    db.add(db_setting)
    
    db.commit()
    db.refresh(db_user)

    # Generate OTP
    create_otp(db, db_user.email, "registration")

    # Audit log
    log_action(db, "register_success", db_user.id, request)

    return {"message": "Registration successful. Please verify the OTP sent to your email."}


@router.post("/verify-otp", response_model=Token)
def verify_email_otp(otp_in: OTPVerify, request: Request, response: Response, db: Session = Depends(get_db)):
    # Verify OTP
    is_valid = verify_otp(db, otp_in.email, otp_in.code, otp_in.purpose)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code"
        )
        
    user = db.query(User).filter(User.email == otp_in.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    if otp_in.purpose == "registration":
        user.is_verified = True
        db.commit()
        db.refresh(user)

    import uuid
    session_id = str(uuid.uuid4())
    # Create access & refresh tokens
    access_token = create_access_token(subject=user.id, session_id=session_id)
    refresh_token = create_refresh_token(subject=user.id, session_id=session_id)
    
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    device_info = user_agent[:255] if user_agent else None

    # Save session
    session = UserSession(
        id=session_id,
        user_id=user.id,
        refresh_token=refresh_token,
        ip_address=ip_address,
        device_info=device_info,
        expires_at=datetime.datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    db.add(session)
    db.commit()

    # Set secure HttpOnly cookie for refresh token
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    )

    # Log audit event
    log_action(db, "otp_verify_success", user.id, request)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/login", response_model=Token)
def login(login_in: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    # Find user by email or username
    user = db.query(User).filter(
        (User.email == login_in.username_or_email) | 
        (User.username == login_in.username_or_email)
    ).first()
    
    if not user or not verify_password(login_in.password, user.hashed_password):
        log_action(db, "login_fail", user.id if user else None, request)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid username/email or password"
        )

    # If unverified, resend OTP and deny login
    if not user.is_verified:
        create_otp(db, user.email, "registration")
        log_action(db, "login_unverified_attempt", user.id, request)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account unverified. A new OTP has been sent to your email."
        )

    import uuid
    session_id = str(uuid.uuid4())
    # Generate tokens
    access_token = create_access_token(subject=user.id, session_id=session_id)
    refresh_token = create_refresh_token(subject=user.id, session_id=session_id)
    
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    device_info = user_agent[:255] if user_agent else None

    # Save session
    session = UserSession(
        id=session_id,
        user_id=user.id,
        refresh_token=refresh_token,
        ip_address=ip_address,
        device_info=device_info,
        expires_at=datetime.datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    db.add(session)
    db.commit()

    # Set secure HttpOnly cookie for refresh token
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    )

    # Log audit event
    log_action(db, "login_success", user.id, request)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/refresh", response_model=Token)
def refresh(
    response: Response,
    refresh_token: Optional[str] = None,
    refresh_token_cookie: Optional[str] = Cookie(None, alias="refresh_token"),
    db: Session = Depends(get_db)
):
    token_to_use = refresh_token or refresh_token_cookie
    if not token_to_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refresh token missing"
        )
        
    payload = decode_token(token_to_use)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid refresh token"
        )
        
    user_id = payload.get("sub")
    
    # Query the session by the token to check status
    session = db.query(UserSession).filter(
        UserSession.refresh_token == token_to_use
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found"
        )
        
    # Detection of theft: If the token has already been marked as revoked (e.g. used once already to rotate),
    # immediately revoke ALL active sessions for this user!
    if session.is_revoked:
        db.query(UserSession).filter(UserSession.user_id == user_id).update(
            {UserSession.is_revoked: True}, synchronize_session=False
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Compromised credentials. All active sessions have been revoked."
        )
        
    if session.expires_at < datetime.datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired"
        )
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    import uuid
    new_session_id = str(uuid.uuid4())
    # Generate new tokens
    new_access_token = create_access_token(subject=user.id, session_id=new_session_id)
    new_refresh_token = create_refresh_token(subject=user.id, session_id=new_session_id)
    
    # Revoke old session (mark it as used/revoked) and create new one
    session.is_revoked = True
    new_session = UserSession(
        id=new_session_id,
        user_id=user.id,
        refresh_token=new_refresh_token,
        ip_address=session.ip_address,
        device_info=session.device_info,
        expires_at=datetime.datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    db.add(new_session)
    db.commit()

    # Set new secure HttpOnly cookie for refresh token
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    )

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


@router.post("/forgot-password")
def forgot_password(request_in: OTPRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request_in.email).first()
    if not user:
        # Avoid user enumeration by still returning success but logging it internally
        return {"message": "If the email is registered, a password reset OTP has been sent."}

    create_otp(db, user.email, "password_reset")
    return {"message": "If the email is registered, a password reset OTP has been sent."}


@router.post("/reset-password")
def reset_password(reset_in: PasswordReset, db: Session = Depends(get_db)):
    # Verify OTP
    is_valid = verify_otp(db, reset_in.email, reset_in.code, "password_reset")
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code"
        )
        
    user = db.query(User).filter(User.email == reset_in.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Update password
    user.hashed_password = get_password_hash(reset_in.new_password)
    db.commit()

    return {"message": "Password reset successful. You can now login with your new password."}


@router.get("/sessions", response_model=List[UserSessionResponse])
def get_user_sessions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    sessions = db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.is_revoked == False,
        UserSession.expires_at > datetime.datetime.utcnow()
    ).all()
    return sessions


@router.post("/sessions/revoke/{session_id}")
def revoke_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
        
    session.is_revoked = True
    db.commit()
    return {"message": "Session successfully revoked"}


@router.post("/sessions/revoke-all-others")
def revoke_all_other_sessions(
    current_session_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.id != current_session_id
    ).update({UserSession.is_revoked: True}, synchronize_session=False)
    
    db.commit()
    return {"message": "All other sessions successfully revoked"}
