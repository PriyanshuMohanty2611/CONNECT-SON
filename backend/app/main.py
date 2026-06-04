import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.api.v1.api import api_router
from app.sockets.sio import sio_app

# Create upload directories if they don't exist (local disk storage fallback)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.include_router(api_router, prefix=settings.API_V1_STR)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/ws", sio_app)

# Set CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.middleware.rate_limiter import RateLimiterMiddleware
app.add_middleware(RateLimiterMiddleware, capacity=40, refill_rate=0.5)

@app.get("/")
def read_root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME} API",
        "status": "online",
        "docs_url": "/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}
