from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.schemas.user import UserProfileResponse

class AttachmentResponse(BaseModel):
    id: str
    message_id: Optional[str] = None
    uploader_id: str
    file_url: str
    file_type: str
    file_name: str
    file_size: int
    created_at: datetime

    class Config:
        from_attributes = True

class ReactionResponse(BaseModel):
    id: str
    message_id: str
    user_id: str
    reaction: str
    created_at: datetime

    class Config:
        from_attributes = True

class StatusResponse(BaseModel):
    id: str
    message_id: str
    user_id: str
    status: str
    updated_at: datetime

    class Config:
        from_attributes = True

class MessageResponse(BaseModel):
    id: str
    chat_id: str
    sender_id: str
    encrypted_content: Optional[str] = None
    nonce: Optional[str] = None
    is_encrypted: bool
    reply_to_id: Optional[str] = None
    created_at: datetime
    edited_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    attachments: List[AttachmentResponse] = []
    reactions: List[ReactionResponse] = []
    statuses: List[StatusResponse] = []

    class Config:
        from_attributes = True

class ChatResponse(BaseModel):
    id: str
    type: str
    created_at: datetime
    participants: List[UserProfileResponse] = []
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0

    class Config:
        from_attributes = True
