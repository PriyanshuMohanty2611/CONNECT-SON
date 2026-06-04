from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import jwt
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(reusable_oauth2)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_token(token)
    if not payload:
        raise credentials_exception
        
    user_id: str = payload.get("sub")
    token_type: str = payload.get("type")
    session_id: str = payload.get("sid")
    
    if user_id is None or token_type != "access" or session_id is None:
        raise credentials_exception
        
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
            headers={"WWW-Authenticate": "Bearer"},
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
