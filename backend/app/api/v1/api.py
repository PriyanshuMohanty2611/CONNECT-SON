from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, friends, chats, stories, notifications, admin, hubs, ai_memory, sync, upload, copilot

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(friends.router, prefix="/friends", tags=["friends"])
api_router.include_router(chats.router, prefix="/chats", tags=["chats"])
api_router.include_router(stories.router, prefix="/stories", tags=["stories"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(ai_memory.router, prefix="/relationship/ai-memory", tags=["ai_memory"])
api_router.include_router(sync.router, prefix="/chats/sync", tags=["sync"])
api_router.include_router(upload.router, prefix="/upload", tags=["upload"])
api_router.include_router(copilot.router, prefix="/copilot", tags=["copilot"])
api_router.include_router(hubs.router, tags=["hubs"])
