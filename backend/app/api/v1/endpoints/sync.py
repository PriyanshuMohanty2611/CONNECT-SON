from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.models import User, Message, MessageReaction, MessageStatus
from pydantic import BaseModel

router = APIRouter()

class SyncDeltaResponse(BaseModel):
    messages: List[dict]
    reactions: List[dict]
    statuses: List[dict]
    next_cursor: Optional[str]
    has_more: bool

@router.get("/", response_model=SyncDeltaResponse)
def delta_sync(
    cursor: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Fetch all user's chat IDs
    chat_ids = [c.id for c in current_user.chats]
    if not chat_ids:
        return {
            "messages": [],
            "reactions": [],
            "statuses": [],
            "next_cursor": None,
            "has_more": False
        }
        
    cursor_dt = None
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid cursor format. Must be ISO datetime."
            )

    # 1. Fetch Messages modified since cursor
    msg_query = db.query(Message).filter(Message.chat_id.in_(chat_ids))
    if cursor_dt:
        msg_query = msg_query.filter(Message.last_modified_at > cursor_dt)
    messages = msg_query.order_by(Message.last_modified_at.asc()).limit(limit).all()
    
    # 2. Fetch Reactions on user's chats
    react_query = db.query(MessageReaction).join(Message).filter(Message.chat_id.in_(chat_ids))
    if cursor_dt:
        react_query = react_query.filter(MessageReaction.created_at > cursor_dt)
    reactions = react_query.order_by(MessageReaction.created_at.asc()).limit(limit).all()

    # 3. Fetch Statuses on user's chats
    status_query = db.query(MessageStatus).join(Message).filter(
        Message.chat_id.in_(chat_ids),
        MessageStatus.user_id == current_user.id
    )
    if cursor_dt:
        status_query = status_query.filter(MessageStatus.updated_at > cursor_dt)
    statuses = status_query.order_by(MessageStatus.updated_at.asc()).limit(limit).all()

    # Calculate next cursor
    next_cursor = None
    has_more = False
    
    if messages:
        next_cursor = messages[-1].last_modified_at.isoformat()
        if len(messages) == limit:
            has_more = True
    elif reactions:
        next_cursor = reactions[-1].created_at.isoformat()
    elif statuses:
        next_cursor = statuses[-1].updated_at.isoformat()
        
    # Serialize payloads
    serialized_messages = []
    for msg in messages:
        serialized_messages.append({
            "id": msg.id,
            "chat_id": msg.chat_id,
            "sender_id": msg.sender_id,
            "encrypted_content": msg.encrypted_content,
            "nonce": msg.nonce,
            "is_encrypted": msg.is_encrypted,
            "reply_to_id": msg.reply_to_id,
            "client_msg_id": str(msg.client_msg_id) if msg.client_msg_id else None,
            "message_sequence": msg.message_sequence,
            "message_status": msg.message_status,
            "created_at": msg.created_at.isoformat(),
            "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
            "deleted_at": msg.deleted_at.isoformat() if msg.deleted_at else None,
            "last_modified_at": msg.last_modified_at.isoformat()
        })
        
    serialized_reactions = []
    for r in reactions:
        serialized_reactions.append({
            "id": r.id,
            "message_id": r.message_id,
            "user_id": r.user_id,
            "reaction": r.reaction,
            "created_at": r.created_at.isoformat()
        })
        
    serialized_statuses = []
    for s in statuses:
        serialized_statuses.append({
            "id": s.id,
            "message_id": s.message_id,
            "user_id": s.user_id,
            "status": s.status,
            "updated_at": s.updated_at.isoformat()
        })
        
    return {
        "messages": serialized_messages,
        "reactions": serialized_reactions,
        "statuses": serialized_statuses,
        "next_cursor": next_cursor,
        "has_more": has_more
    }
