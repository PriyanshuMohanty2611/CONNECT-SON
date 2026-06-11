from datetime import datetime, timedelta
from typing import Any, Union, Optional
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

# Explicitly use passlib with bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(
    subject: Union[str, Any], expires_delta: Optional[timedelta] = None, session_id: Optional[str] = None
) -> str:
    import uuid
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject), "type": "access", "jti": str(uuid.uuid4())}
    if session_id:
        to_encode["sid"] = str(session_id)
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(
    subject: Union[str, Any], expires_delta: Optional[timedelta] = None, session_id: Optional[str] = None
) -> str:
    import uuid
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
    to_encode = {"exp": expire, "sub": str(subject), "type": "refresh", "jti": str(uuid.uuid4())}
    if session_id:
        to_encode["sid"] = str(session_id)
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    try:
        decoded_payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[ALGORITHM]
        )
        return decoded_payload
    except jwt.JWTError:
        return {}

def set_auth_cookies(response, access_token: str, refresh_token: str, csrf_token: str):
    samesite = settings.COOKIE_SAMESITE
    secure = settings.COOKIE_SECURE
    if samesite.lower() == "none":
        secure = True
        
    response.set_cookie(
        key=settings.ACCESS_TOKEN_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    )
    
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        secure=secure,
        samesite=samesite,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    )

def clear_auth_cookies(response):
    samesite = settings.COOKIE_SAMESITE
    secure = settings.COOKIE_SECURE
    if samesite.lower() == "none":
        secure = True
        
    response.delete_cookie(
        key=settings.ACCESS_TOKEN_COOKIE_NAME,
        secure=secure,
        samesite=samesite
    )
    response.delete_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        secure=secure,
        samesite=samesite
    )
    response.delete_cookie(
        key=settings.CSRF_COOKIE_NAME,
        secure=secure,
        samesite=samesite
    )
