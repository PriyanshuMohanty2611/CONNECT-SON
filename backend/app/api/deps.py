from typing import Optional
from fastapi import Depends, HTTPException, status, Cookie, Request, Header
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import User

def get_current_user(
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(None, alias="access_token")
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    
    if not access_token:
        raise credentials_exception
        
    payload = decode_token(access_token)
    if not payload:
        raise credentials_exception
        
    user_id: str = payload.get("sub")
    token_type: str = payload.get("type")
    session_id: str = payload.get("sid")
    
    if user_id is None or token_type != "access" or session_id is None:
        raise credentials_exception
        
    # Check session in Redis first
    from app.services.session_service import get_redis_session
    redis_session = get_redis_session(session_id)
    
    if redis_session:
        # Update activity in Redis
        from app.services.session_service import update_redis_session_activity
        update_redis_session_activity(session_id)
    else:
        # Fallback to DB
        from app.models.models import UserSession
        import datetime
        session = db.query(UserSession).filter(
            UserSession.id == session_id,
            UserSession.is_revoked == False,
            UserSession.expires_at > datetime.datetime.utcnow()
        ).first()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been revoked or has expired",
            )
            
        # Re-populate Redis session
        from app.services.session_service import create_redis_session
        expires_left = (session.expires_at - datetime.datetime.utcnow()).total_seconds()
        if expires_left > 0:
            create_redis_session(
                session_id=session.id,
                user_id=session.user_id,
                device_info=session.device_info,
                ip_address=session.ip_address,
                expires_in_days=int(expires_left / (24 * 3600)) or 1
            )
        
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
        
    return user

def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive or unverified account. Please verify email OTP.",
        )
    return current_user

def get_current_admin_user(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user does not have enough privileges",
        )
    return current_user

def verify_csrf_token(
    request: Request,
    csrf_token_cookie: Optional[str] = Cookie(None, alias="csrf_token"),
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token")
):
    # Only validate state-changing requests
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
        
    if not csrf_token_cookie or not x_csrf_token or csrf_token_cookie != x_csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token validation failed"
        )
