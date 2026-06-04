from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.schemas.user import UserProfileResponse

class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: str  # friend_request, friend_accept, new_message, reaction, profile_visit
    sender_id: Optional[str] = None
    target_id: Optional[str] = None
    is_read: bool
    created_at: datetime
    sender: Optional[UserProfileResponse] = None

    class Config:
        from_attributes = True
