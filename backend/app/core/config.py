import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from typing import List

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "CONNECT-ON"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super_secret_key_connect_on_1234567890_change_me")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./connect_on.db")
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]
    
    # Cloudinary Credentials (Optional fallbacks for local dev)
    CLOUDINARY_CLOUD_NAME: str = os.getenv("CLOUDINARY_CLOUD_NAME", "")
    CLOUDINARY_API_KEY: str = os.getenv("CLOUDINARY_API_KEY", "")
    CLOUDINARY_API_SECRET: str = os.getenv("CLOUDINARY_API_SECRET", "")
    
    # Local Storage Fallback
    UPLOAD_DIR: str = "static/uploads"
    
    # Redis caching (optional, falls back to memory if empty)
    REDIS_URL: str = os.getenv("REDIS_URL", "")

    # Mailer (Gmail SMTP)
    EMAIL_USER: str = os.getenv("EMAIL_USER", "chat.end2end@gmail.com")
    EMAIL_PASS: str = os.getenv("EMAIL_PASS", "fgsd xfpy oazb fcyu")

    class Config:
        case_sensitive = True

settings = Settings()
