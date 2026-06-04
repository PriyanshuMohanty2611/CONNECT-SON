from fastapi import BackgroundTasks
from sqlalchemy.orm import Session
from app.models.models import Notification, User
from app.schemas.notification import NotificationResponse
import asyncio

async def dispatch_socket_notification(user_id: str, notif_json: dict):
    try:
        from app.sockets.sio import sio
        # Emit to the user's personal room (which matches their user_id)
        await sio.emit("new_notification", notif_json, room=user_id)
        print(f"Dispatched notification to user {user_id} via WebSocket")
    except Exception as e:
        print(f"Error dispatching socket notification: {e}")

def create_notification(
    db: Session,
    user_id: str,
    type: str,
    sender_id: str = None,
    target_id: str = None,
    background_tasks: BackgroundTasks = None
):
    # 1. Create notification in database
    db_notif = Notification(
        user_id=user_id,
        type=type,
        sender_id=sender_id,
        target_id=target_id,
        is_read=False
    )
    db.add(db_notif)
    db.commit()
    db.refresh(db_notif)
    
    # 2. Serialize notification for response
    # We must format it properly
    # Fetch sender user if sender_id exists
    sender_data = None
    if sender_id:
        sender_user = db.query(User).filter(User.id == sender_id).first()
        if sender_user:
            # We construct a simple dict to avoid loading relationships synchronously in background thread
            from app.schemas.user import UserProfileResponse, ProfileResponse
            profile_data = None
            if sender_user.profile:
                profile_data = ProfileResponse.model_validate(sender_user.profile).model_dump()
            
            sender_data = UserProfileResponse(
                id=sender_user.id,
                username=sender_user.username,
                email=sender_user.email,
                phone=sender_user.phone,
                is_verified=sender_user.is_verified,
                created_at=sender_user.created_at,
                profile=profile_data
            ).model_dump()

    # Model validate notification response
    notif_res = NotificationResponse(
        id=db_notif.id,
        user_id=db_notif.user_id,
        type=db_notif.type,
        sender_id=db_notif.sender_id,
        target_id=db_notif.target_id,
        is_read=db_notif.is_read,
        created_at=db_notif.created_at,
        sender=sender_data
    )
    
    notif_json = notif_res.model_dump(mode="json")
    
    # 3. Queue socket emit
    if background_tasks:
        background_tasks.add_task(dispatch_socket_notification, user_id, notif_json)
    else:
        # Fallback if no background tasks provided (e.g. running in socket events where we are already in async context)
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(dispatch_socket_notification(user_id, notif_json))
        except Exception:
            pass
            
    return db_notif
