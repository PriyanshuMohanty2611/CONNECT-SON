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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./connect_on.db")
    # For migrations/schema changes that require direct (non-pooled) connection
    MIGRATION_DATABASE_URL: str = os.getenv("MIGRATION_DATABASE_URL", os.getenv("DATABASE_URL", "").replace("-pooler", ""))
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = []
    
    # Cloudinary Credentials (Optional fallbacks for local dev)
    CLOUDINARY_CLOUD_NAME: str = os.getenv("CLOUDINARY_CLOUD_NAME", "CONNECT-SON")
    CLOUDINARY_API_KEY: str = os.getenv("CLOUDINARY_API_KEY", "939893696595212")
    CLOUDINARY_API_SECRET: str = os.getenv("CLOUDINARY_API_SECRET", "F2m0FEO4jbTqECN9cGBg_PI9q2U")
    
    # Local Storage Fallback
    UPLOAD_DIR: str = "static/uploads"
    
    # Redis caching (optional, falls back to memory if empty)
    REDIS_URL: str = os.getenv("REDIS_URL", "rediss://default:gQAAAAAAAYBSAAIgcDIzNDQwNTBiZjBhYzQ0MTVlYWE5MWJmN2YzNmJiZjJjZA@complete-albacore-98386.upstash.io:6379")

    # Mailer (Gmail SMTP)
    EMAIL_USER: str = os.getenv("EMAIL_USER", "chat.end2end@gmail.com")
    EMAIL_PASS: str = os.getenv("EMAIL_PASS", "fgsd xfpy oazb fcyu")

    # Cookie & CSRF Security Settings
    COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "lax")
    COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "False").lower() in ("true", "1")
    CSRF_COOKIE_NAME: str = "csrf_token"
    ACCESS_TOKEN_COOKIE_NAME: str = "access_token"
    REFRESH_TOKEN_COOKIE_NAME: str = "refresh_token"

    def __init__(self, **values):
        super().__init__(**values)
        
        # Configure CORS Origins with defaults and environments
        cors_env = os.getenv("BACKEND_CORS_ORIGINS")
        default_origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "https://connect-son-pp.onrender.com",
            "https://connect-son-pp.onrender.com/",
            "https://connect-son-pm18.onrender.com",
            "https://connect-son-pm18.onrender.com/",
            "https://connect-son-back.onrender.com",
            "https://connect-son-back.onrender.com/",
            "https://connect-son.onrender.com",
            "https://connect-son.onrender.com/"
        ]
        if cors_env:
            try:
                import json
                self.BACKEND_CORS_ORIGINS = json.loads(cors_env)
            except Exception:
                self.BACKEND_CORS_ORIGINS = [x.strip() for x in cors_env.split(",") if x.strip()]
        else:
            self.BACKEND_CORS_ORIGINS = default_origins
            
        if self.DATABASE_URL and self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgres://", "postgresql://", 1)
        if self.MIGRATION_DATABASE_URL and self.MIGRATION_DATABASE_URL.startswith("postgres://"):
            self.MIGRATION_DATABASE_URL = self.MIGRATION_DATABASE_URL.replace("postgres://", "postgresql://", 1)

    class Config:
        case_sensitive = True

settings = Settings()
