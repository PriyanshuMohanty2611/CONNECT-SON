from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.schemas.user import UserResponse

class StoryCreate(BaseModel):
    caption: Optional[str] = None
    filter_preset: Optional[str] = "none"

class StoryViewResponse(BaseModel):
    id: str
    story_id: str
    viewer_id: str
    created_at: datetime
    viewer: UserResponse

    class Config:
        from_attributes = True

class StoryResponse(BaseModel):
    id: str
    user_id: str
    media_url: str
    media_type: str
    filter_preset: str
    caption: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    user: UserResponse
    views: List[StoryViewResponse] = []

    class Config:
        from_attributes = True
