from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.schemas.user import UserResponse

class FriendRequestResponse(BaseModel):
    id: str
    sender_id: str
    receiver_id: str
    status: str
    created_at: datetime
    sender: UserResponse
    receiver: UserResponse

    class Config:
        from_attributes = True

class FriendshipResponse(BaseModel):
    id: str
    user1_id: str
    user2_id: str
    created_at: datetime
    is_blocked: bool
    blocked_by: Optional[str] = None

    class Config:
        from_attributes = True
