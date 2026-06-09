from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from app.models.models import Chat, Message, MessageStatus, MessageReaction, Attachment, User, chat_participants, Notification, ChatSequence

def check_chat_participation(db: Session, user_id: str, chat_id: str) -> bool:
    # Check if user is a participant of the chat room
    participant = db.query(chat_participants).filter(
        chat_participants.c.chat_id == chat_id,
        chat_participants.c.user_id == user_id
    ).first()
    return participant is not None

def get_next_chat_sequence(db: Session, chat_id: str) -> int:
    """
    Fetches, locks, and increments the sequence counter for a chat.
    If no record exists, fall back to max message sequence in messages table.
    """
    chat_seq = db.query(ChatSequence).filter(ChatSequence.chat_id == chat_id).with_for_update().first()
    if not chat_seq:
        max_seq = db.query(func.max(Message.message_sequence)).filter(Message.chat_id == chat_id).scalar()
        max_seq = max_seq if max_seq is not None else 0
        chat_seq = ChatSequence(chat_id=chat_id, last_sequence=max_seq + 1)
        db.add(chat_seq)
    else:
        chat_seq.last_sequence += 1
    db.commit()
    return chat_seq.last_sequence

def store_message(
    db: Session, 
    sender_id: str, 
    chat_id: str, 
    encrypted_content: str, 
    nonce: str,
    is_encrypted: bool = True,
    reply_to_id: str = None,
    attachment_ids: list = None,
    client_msg_id: str = None,
    message_sequence: int = None
) -> dict:
    import datetime

    # Deduplication check for client_msg_id
    if client_msg_id:
        existing = db.query(Message).filter(Message.client_msg_id == client_msg_id).first()
        if existing:
            return {
                "id": existing.id,
                "chat_id": existing.chat_id,
                "sender_id": existing.sender_id,
                "encrypted_content": existing.encrypted_content,
                "nonce": existing.nonce,
                "is_encrypted": existing.is_encrypted,
                "reply_to_id": existing.reply_to_id,
                "client_msg_id": str(existing.client_msg_id) if existing.client_msg_id else None,
                "message_sequence": existing.message_sequence,
                "message_status": existing.message_status,
                "created_at": existing.created_at.isoformat(),
                "attachments": [
                    {
                        "id": att.id,
                        "file_url": att.file_url,
                        "file_type": att.file_type,
                        "file_name": att.file_name,
                        "file_size": att.file_size
                    } for att in existing.attachments
                ]
            }

    # Spam check: last message in this chat by the same sender in the last 2 seconds with the same content
    two_seconds_ago = datetime.datetime.utcnow() - datetime.timedelta(seconds=2)
    last_msg = db.query(Message).filter(
        Message.chat_id == chat_id,
        Message.sender_id == sender_id,
        Message.created_at >= two_seconds_ago
    ).order_by(Message.created_at.desc()).first()

    if last_msg and last_msg.encrypted_content == encrypted_content and not client_msg_id:
        raise ValueError("Spam detected: Duplicate message sent too quickly")

    # Create the message
    msg = Message(
        chat_id=chat_id,
        sender_id=sender_id,
        encrypted_content=encrypted_content,
        nonce=nonce,
        is_encrypted=is_encrypted,
        reply_to_id=reply_to_id,
        client_msg_id=client_msg_id,
        message_sequence=message_sequence,
        message_status="SENT"
    )
    db.add(msg)
    
    # Sync persistent ChatSequence record
    if message_sequence:
        seq_record = db.query(ChatSequence).filter(ChatSequence.chat_id == chat_id).first()
        if not seq_record:
            seq_record = ChatSequence(chat_id=chat_id, last_sequence=message_sequence)
            db.add(seq_record)
        else:
            if message_sequence > seq_record.last_sequence:
                seq_record.last_sequence = message_sequence

    db.flush()
    
    # Attach files if provided
    if attachment_ids:
        db.query(Attachment).filter(
            Attachment.id.in_(attachment_ids),
            Attachment.uploader_id == sender_id
        ).update({Attachment.message_id: msg.id}, synchronize_session=False)
        
    # Create message statuses for participants
    participants = db.query(chat_participants.c.user_id).filter(
        chat_participants.c.chat_id == chat_id
    ).all()
    
    for (p_id,) in participants:
        status_val = "sent" if p_id != sender_id else "seen"
        status_record = MessageStatus(
            message_id=msg.id,
            user_id=p_id,
            status=status_val
        )
        db.add(status_record)
        
        # Add notification for other participants
        if p_id != sender_id:
            notif = Notification(
                user_id=p_id,
                type="new_message",
                sender_id=sender_id,
                target_id=msg.id,
                is_read=False
            )
            db.add(notif)
        
    db.commit()
    
    # Return structured dict for easy frontend JSON broadcasting
    return {
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
        "attachments": [
            {
                "id": att.id,
                "file_url": att.file_url,
                "file_type": att.file_type,
                "file_name": att.file_name,
                "file_size": att.file_size
            } for att in msg.attachments
        ]
    }

def update_status(db: Session, user_id: str, message_id: str, status_str: str) -> dict:
    status_record = db.query(MessageStatus).filter(
        MessageStatus.message_id == message_id,
        MessageStatus.user_id == user_id
    ).first()
    
    if not status_record:
        # Fallback create if missing
        status_record = MessageStatus(
            message_id=message_id,
            user_id=user_id,
            status=status_str
        )
        db.add(status_record)
    else:
        # Check to only move status forward (sent -> delivered -> seen)
        status_levels = {"sent": 1, "delivered": 2, "seen": 3}
        current_lvl = status_levels.get(status_record.status, 0)
        new_lvl = status_levels.get(status_str, 0)
        
        if new_lvl > current_lvl:
            status_record.status = status_str
            
    db.commit()
    
    # Fetch chat_id
    msg = db.query(Message).filter(Message.id == message_id).first()
    chat_id = msg.chat_id if msg else None
    
    return {
        "message_id": message_id,
        "user_id": user_id,
        "status": status_record.status,
        "chat_id": chat_id
    }

def store_reaction(db: Session, user_id: str, message_id: str, reaction_emoji: str) -> dict:
    # Check if reaction already exists
    existing = db.query(MessageReaction).filter(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == user_id
    ).first()
    
    if existing:
        if existing.reaction == reaction_emoji:
            # Toggle reaction off if clicked twice
            db.delete(existing)
            db.commit()
            return {
                "message_id": message_id,
                "user_id": user_id,
                "reaction": None,
                "removed": True
            }
        else:
            existing.reaction = reaction_emoji
            db.commit()
            reaction_val = existing.reaction
    else:
        new_reaction = MessageReaction(
            message_id=message_id,
            user_id=user_id,
            reaction=reaction_emoji
        )
        db.add(new_reaction)
        db.commit()
        reaction_val = new_reaction.reaction
        
    msg = db.query(Message).filter(Message.id == message_id).first()
    chat_id = msg.chat_id if msg else None
    
    # Trigger notification to the message owner if the reaction wasn't removed and it's not self-reacted
    if msg and not reaction_emoji is None and msg.sender_id != user_id:
        # Check if notification already exists to prevent duplicate spam
        existing_notif = db.query(Notification).filter(
            Notification.user_id == msg.sender_id,
            Notification.type == "reaction",
            Notification.sender_id == user_id,
            Notification.target_id == msg.id
        ).first()
        if not existing_notif:
            notif = Notification(
                user_id=msg.sender_id,
                type="reaction",
                sender_id=user_id,
                target_id=msg.id,
                is_read=False
            )
            db.add(notif)
            db.commit()
    
    return {
        "message_id": message_id,
        "user_id": user_id,
        "reaction": reaction_val if reaction_val is not None else None,
        "chat_id": chat_id,
        "removed": False
    }

def get_notifications_by_target(db: Session, target_id: str, type: str) -> list:
    from app.schemas.notification import NotificationResponse
    from app.schemas.user import UserProfileResponse, ProfileResponse
    
    notifications = db.query(Notification).filter(
        Notification.target_id == target_id,
        Notification.type == type
    ).all()
    
    results = []
    for notif in notifications:
        sender_data = None
        if notif.sender:
            profile_data = None
            if notif.sender.profile:
                profile_data = ProfileResponse.model_validate(notif.sender.profile).model_dump()
            sender_data = UserProfileResponse(
                id=notif.sender.id,
                username=notif.sender.username,
                email=notif.sender.email,
                phone=notif.sender.phone,
                is_verified=notif.sender.is_verified,
                created_at=notif.sender.created_at,
                profile=profile_data
            ).model_dump()
            
        res = NotificationResponse(
            id=notif.id,
            user_id=notif.user_id,
            type=notif.type,
            sender_id=notif.sender_id,
            target_id=notif.target_id,
            is_read=notif.is_read,
            created_at=notif.created_at,
            sender=sender_data
        )
        results.append(res.model_dump(mode="json"))
    return results
