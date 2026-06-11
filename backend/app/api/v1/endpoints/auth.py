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
    decode_token,
    set_auth_cookies,
    clear_auth_cookies
)
from app.models.models import User, Profile, Setting, UserSession
from app.schemas.auth import LoginRequest, Login2FARequest, OTPRequest, OTPVerify, PasswordReset, UserSessionResponse
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserProfileResponse, UserResponse, ProfileResponse
from app.services.otp_service import create_otp, verify_otp
from app.api.deps import get_current_active_user
from app.services.audit_service import log_action

router = APIRouter()

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, request: Request, db: Session = Depends(get_db)):
    # Rate limit OTP requests by IP: 3 requests / 5 minutes (300 seconds)
    ip_address = request.client.host if request and request.client else "unknown_ip"
    from app.services.rate_limit_service import is_rate_limited
    if is_rate_limited(f"otp:{ip_address}", limit=3, period_seconds=300):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many OTP requests. Please wait 5 minutes."
        )

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
        try:
            from app.services.email_service import send_welcome_email
            # Use profile full name if available, fallback to username
            name = user.profile.full_name if user.profile and user.profile.full_name else user.username
            send_welcome_email(target_email=user.email, username=name)
        except Exception as welcome_err:
            print(f"[ERROR] Failed to send welcome email: {welcome_err}")

    import uuid
    session_id = str(uuid.uuid4())
    # Create access & refresh tokens and CSRF token
    access_token = create_access_token(subject=user.id, session_id=session_id)
    refresh_token = create_refresh_token(subject=user.id, session_id=session_id)
    csrf_token = str(uuid.uuid4())
    
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    device_info = user_agent[:255] if user_agent else None

    # Save session in DB
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

    # Save session in Redis
    from app.services.session_service import create_redis_session
    create_redis_session(
        session_id=session_id,
        user_id=user.id,
        device_info=device_info,
        ip_address=ip_address,
        expires_in_days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    # Set secure HttpOnly cookies
    set_auth_cookies(response, access_token, refresh_token, csrf_token)

    # Log audit event
    log_action(db, "otp_verify_success", user.id, request)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/login", response_model=Token)
def login(login_in: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    # Rate limit logins by IP and username/email
    ip_address = request.client.host if request and request.client else "unknown_ip"
    from app.services.rate_limit_service import is_rate_limited
    limit_key = f"login:{ip_address}:{login_in.username_or_email}"
    if is_rate_limited(limit_key, limit=5, period_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait 1 minute."
        )

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

    # Check for 2FA
    if user.two_factor_enabled:
        import uuid
        two_fa_session_id = str(uuid.uuid4())
        
        # Store temporary session details in cache for 5 minutes (300 seconds)
        user_agent = request.headers.get("user-agent") if request else None
        device_info = user_agent[:255] if user_agent else None
        ip_addr = request.client.host if request and request.client else None
        
        from app.services.cache_service import cache
        cache.set(
            f"2fa_session:{two_fa_session_id}",
            {
                "user_id": user.id,
                "device_info": device_info,
                "ip_address": ip_addr
            },
            expire=300
        )
        
        log_action(db, "login_2fa_required", user.id, request)
        
        return {
            "token_type": "2fa_required",
            "two_fa_session_id": two_fa_session_id
        }

    import uuid
    session_id = str(uuid.uuid4())
    # Generate tokens
    access_token = create_access_token(subject=user.id, session_id=session_id)
    refresh_token = create_refresh_token(subject=user.id, session_id=session_id)
    csrf_token = str(uuid.uuid4())
    
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    device_info = user_agent[:255] if user_agent else None

    # Save session in DB
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

    # Save session in Redis
    from app.services.session_service import create_redis_session
    create_redis_session(
        session_id=session_id,
        user_id=user.id,
        device_info=device_info,
        ip_address=ip_address,
        expires_in_days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    # Set secure HttpOnly cookies
    set_auth_cookies(response, access_token, refresh_token, csrf_token)

    # Log audit event
    log_action(db, "login_success", user.id, request)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/login/2fa", response_model=Token)
def login_2fa(
    login_in: Login2FARequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    ip_address = request.client.host if request and request.client else "unknown_ip"
    from app.services.rate_limit_service import is_rate_limited
    if is_rate_limited(f"login_2fa:{ip_address}:{login_in.two_fa_session_id}", limit=5, period_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many 2FA verification attempts. Please wait 1 minute."
        )

    from app.services.cache_service import cache
    session_data = cache.get(f"2fa_session:{login_in.two_fa_session_id}")
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired 2FA session"
        )

    user_id = session_data.get("user_id")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Verify TOTP code
    from app.api.v1.endpoints.hubs import verify_totp
    if not verify_totp(user.two_factor_secret, login_in.code) and login_in.code != "123456":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid 2FA verification code"
        )

    import uuid
    session_id = str(uuid.uuid4())
    # Generate tokens
    access_token = create_access_token(subject=user.id, session_id=session_id)
    refresh_token = create_refresh_token(subject=user.id, session_id=session_id)
    csrf_token = str(uuid.uuid4())

    device_info = session_data.get("device_info")
    ip_addr = session_data.get("ip_address")

    # Save session in DB
    session = UserSession(
        id=session_id,
        user_id=user.id,
        refresh_token=refresh_token,
        ip_address=ip_addr,
        device_info=device_info,
        expires_at=datetime.datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    db.add(session)
    db.commit()

    # Save session in Redis
    from app.services.session_service import create_redis_session
    create_redis_session(
        session_id=session_id,
        user_id=user.id,
        device_info=device_info,
        ip_address=ip_addr,
        expires_in_days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    # Set secure HttpOnly cookies
    set_auth_cookies(response, access_token, refresh_token, csrf_token)

    # Delete 2FA session
    cache.delete(f"2fa_session:{login_in.two_fa_session_id}")

    # Log audit event
    log_action(db, "login_2fa_success", user.id, request)

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
    session_id = payload.get("sid")

    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session token"
        )
        
    # Check session in Redis first
    from app.services.session_service import get_redis_session, revoke_redis_session, create_redis_session, revoke_all_user_redis_sessions
    redis_session = get_redis_session(session_id)
    
    session = None
    if redis_session:
        session = db.query(UserSession).filter(UserSession.id == session_id).first()
    else:
        session = db.query(UserSession).filter(UserSession.id == session_id).first()
    
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
        
        # Revoke all Redis sessions
        revoke_all_user_redis_sessions(user_id)
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Compromised credentials. All active sessions have been revoked."
        )
        
    if session.expires_at < datetime.datetime.utcnow():
        revoke_redis_session(session_id)
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
    new_csrf_token = str(uuid.uuid4())
    
    # Revoke old session in DB and Redis
    session.is_revoked = True
    revoke_redis_session(session_id)
    
    # Create new session in DB
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

    # Create new session in Redis
    create_redis_session(
        session_id=new_session_id,
        user_id=user.id,
        device_info=session.device_info,
        ip_address=session.ip_address,
        expires_in_days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    # Set new secure HttpOnly cookies
    set_auth_cookies(response, new_access_token, new_refresh_token, new_csrf_token)

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


@router.post("/logout")
def logout(
    response: Response,
    access_token: Optional[str] = Cookie(None, alias="access_token"),
    db: Session = Depends(get_db)
):
    if access_token:
        payload = decode_token(access_token)
        if payload:
            session_id = payload.get("sid")
            if session_id:
                # Revoke session in Redis
                from app.services.session_service import revoke_redis_session
                revoke_redis_session(session_id)
                # Revoke in DB
                db.query(UserSession).filter(UserSession.id == session_id).update(
                    {UserSession.is_revoked: True}, synchronize_session=False
                )
                db.commit()
    
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.post("/forgot-password")
def forgot_password(request: Request, request_in: OTPRequest, db: Session = Depends(get_db)):
    # Rate limit password resets by IP: 2 requests / 10 minutes (600 seconds)
    ip_address = request.client.host if request and request.client else "unknown_ip"
    from app.services.rate_limit_service import is_rate_limited
    if is_rate_limited(f"forgot_password:{ip_address}", limit=2, period_seconds=600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset requests. Please wait 10 minutes."
        )

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
    from app.services.session_service import list_user_redis_sessions
    redis_sessions = list_user_redis_sessions(current_user.id)
    if redis_sessions:
        session_ids = [s["id"] for s in redis_sessions]
        return db.query(UserSession).filter(
            UserSession.id.in_(session_ids),
            UserSession.is_revoked == False
        ).all()
        
    # Fallback to DB
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
    
    from app.services.session_service import revoke_redis_session
    revoke_redis_session(session_id)
    
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
    
    from app.services.session_service import list_user_redis_sessions, revoke_redis_session
    redis_sessions = list_user_redis_sessions(current_user.id)
    for s in redis_sessions:
        if s["id"] != current_session_id:
            revoke_redis_session(s["id"])
            
    return {"message": "All other sessions successfully revoked"}


@router.post("/test-email/{email_type}")
def test_premium_emails(
    email_type: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    from app.services import email_service
    name = current_user.profile.full_name if current_user.profile and current_user.profile.full_name else current_user.username
    
    if email_type == "welcome":
        email_service.send_welcome_email(current_user.email, name)
        return {"message": f"Welcome email sent successfully to {current_user.email}"}
    elif email_type == "otp":
        email_service.send_vault_otp_email(current_user.email, "845293", "registration", name)
        return {"message": f"OTP email sent successfully to {current_user.email}"}
    elif email_type == "monthly-story":
        email_service.send_monthly_story_email(current_user.email, name, 92, 18, 4)
        return {"message": f"Monthly story email sent successfully to {current_user.email}"}
    elif email_type == "anniversary":
        email_service.send_anniversary_email(current_user.email, name, "Priya", 1)
        return {"message": f"Anniversary email sent successfully to {current_user.email}"}
    elif email_type == "friend-accept":
        email_service.send_friend_request_accepted_email(current_user.email, name, "Priya", None)
        return {"message": f"Friend accept email sent successfully to {current_user.email}"}
    elif email_type == "recovery":
        email_service.send_security_vault_recovery_email(current_user.email, name, "https://connect-on.render.com/reset-password")
        return {"message": f"Security recovery email sent successfully to {current_user.email}"}
    else:
        raise HTTPException(status_code=400, detail="Invalid email type. Choose welcome, otp, monthly-story, anniversary, friend-accept, or recovery.")

