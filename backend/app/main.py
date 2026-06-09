import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.api.v1.api import api_router
from app.sockets.sio import sio_app

# Create upload directories if they don't exist (local disk storage fallback)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs("static", exist_ok=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Mount static files (safe: directory created above)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount Socket.IO
app.mount("/ws", sio_app)

# Rate limiter middleware (added first = runs outermost = last in middleware chain)
from app.middleware.rate_limiter import RateLimiterMiddleware
app.add_middleware(RateLimiterMiddleware, capacity=40, refill_rate=0.5)

# CORS middleware — must be added LAST so it wraps everything (runs innermost first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
