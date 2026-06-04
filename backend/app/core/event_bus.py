import json
from sqlalchemy.orm import Session
from app.models.models import EventLog

def publish_event(db: Session, event_type: str, payload: dict):
    """
    Publishes an event to the Event Store (event_logs table) and triggers related tasks.
    """
    try:
        # Create immutable record in Event Store
        event = EventLog(
            event_type=event_type,
            payload=json.dumps(payload)
        )
        db.add(event)
        db.commit()
        print(f"[EVENT STORE] Logged '{event_type}' successfully.")
    except Exception as e:
        print(f"[WARNING] Failed to save event log to Event Store: {e}")
        db.rollback()
        
    # Hook tasks asynchronously based on events
    # (E.g., notifying FCM dispatchers, processing logs, etc.)
    if event_type == "MESSAGE_SENT":
        # Can route to push worker or notification dispatcher
        pass
    elif event_type == "MESSAGE_DELIVERED":
        pass
    elif event_type == "MESSAGE_SEEN":
        pass
    elif event_type == "FRIEND_REQUEST_SENT":
        pass
    elif event_type == "FRIEND_ACCEPTED":
        pass
    elif event_type == "STORY_POSTED":
        pass
    elif event_type == "MEMORY_CREATED":
        pass
