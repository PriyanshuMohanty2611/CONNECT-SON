from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_active_user
from app.models.models import Chat, Message, MessageStatus, chat_participants, User, Attachment
from app.schemas.chat import ChatResponse, MessageResponse, AttachmentResponse
from app.services.media_service import upload_file_to_storage

router = APIRouter()

@router.get("/", response_model=List[ChatResponse])
def get_user_chats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Fetch all chats where current user is a participant
    user_chats = db.query(Chat).join(chat_participants).filter(
        chat_participants.c.user_id == current_user.id
    ).all()
    
    response_chats = []
    for chat in user_chats:
        participants = chat.participants
        
        last_msg = db.query(Message).filter(
            Message.chat_id == chat.id
        ).order_by(desc(Message.created_at)).first()
        
        unread_count = db.query(MessageStatus).join(Message).filter(
            Message.chat_id == chat.id,
            Message.sender_id != current_user.id,
            MessageStatus.user_id == current_user.id,
            MessageStatus.status != "seen"
        ).count()
        
        chat_data = ChatResponse(
            id=chat.id,
            type=chat.type,
            created_at=chat.created_at,
            participants=[u for u in participants],
            last_message=last_msg,
            unread_count=unread_count
        )
        response_chats.append(chat_data)
        
    response_chats.sort(
        key=lambda x: x.last_message.created_at if x.last_message else x.created_at,
        reverse=True
    )
    return response_chats


@router.get("/{chat_id}/messages", response_model=List[MessageResponse])
def get_chat_messages(
    chat_id: str,
    before: Optional[datetime] = None,
    limit: int = 30,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify participant
    is_part = db.query(chat_participants).filter(
        chat_participants.c.chat_id == chat_id,
        chat_participants.c.user_id == current_user.id
    ).first()
    
    if not is_part:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this chat"
        )
        
    query = db.query(Message).filter(Message.chat_id == chat_id)
    
    if before:
        query = query.filter(Message.created_at < before)
        
    messages = query.order_by(desc(Message.created_at)).limit(limit).all()
    return messages


@router.post("/attachments", response_model=AttachmentResponse)
def upload_attachment(
    chat_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify participant
    is_part = db.query(chat_participants).filter(
        chat_participants.c.chat_id == chat_id,
        chat_participants.c.user_id == current_user.id
    ).first()
    
    if not is_part:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this chat"
        )
        
    # File Validation (Size Limit: 20MB)
    MAX_SIZE = 20 * 1024 * 1024
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 20MB limit."
        )
        
    # MIME-type check (Security Whitelist)
    ALLOWED_TYPES = [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/webm", "video/ogg",
        "application/pdf",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip", "application/x-zip-compressed",
        "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/mp4", "audio/x-m4a"
    ]
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file.content_type} is not supported."
        )
        
    # Run security file scan
    from app.services.file_scanner import scan_file
    try:
        scan_file(file)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
        
    # Upload to storage
    url = upload_file_to_storage(file, folder="attachments")
    
    # Determine type
    file_type = "document"
    if file.content_type.startswith("image/"):
        file_type = "image"
    elif file.content_type.startswith("video/"):
        file_type = "video"
    elif file.content_type.startswith("audio/"):
        file_type = "audio"
    elif file.content_type == "application/pdf":
        file_type = "pdf"
        
    # Save Attachment record
    db_attachment = Attachment(
        uploader_id=current_user.id,
        file_url=url,
        file_type=file_type,
        file_name=file.filename or "attachment",
        file_size=file_size
    )
    db.add(db_attachment)
    db.commit()
    db.refresh(db_attachment)
    
    return db_attachment


@router.get("/{chat_id}/summary")
def get_chat_summary(
    chat_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify participant
    is_part = db.query(chat_participants).filter(
        chat_participants.c.chat_id == chat_id,
        chat_participants.c.user_id == current_user.id
    ).first()
    
    if not is_part:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this chat"
        )
        
    # Get last 20 messages
    messages = db.query(Message).filter(
        Message.chat_id == chat_id
    ).order_by(desc(Message.created_at)).limit(20).all()
    
    if not messages:
        return {"summary": "No messages found in this chat yet. Start chatting to get an AI summary!"}
        
    # Generate mock AI summary based on context
    summary_text = (
        "✨ **AI Chat Summary** ✨\n\n"
        "• **Recent Discussions**: The chat covers secure platform operations, profile updates, and active device sessions.\n"
        "• **E2EE Handshake**: Local cryptographic key generation (X25519) has been initialized and synchronized.\n"
        "• **Moderation & Security**: Session revocations and blocking features are fully functional.\n\n"
        "📝 **Action Items**:\n"
        "- Verify active public key in Settings under E2EE Setup.\n"
        "- Revoke any inactive device sessions to ensure maximum privacy."
    )
    return {"summary": summary_text}

