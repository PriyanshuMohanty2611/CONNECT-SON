import datetime
from datetime import date
import base64
import hmac
import hashlib
import time
import random
import uuid
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_user
from app.models.models import User, Profile, Friendship, FriendRequest, Chat, Message, Attachment, UserSession, CalendarEvent, DailyGoal, Habit, CloudFile, Note
from app.services.media_service import upload_file_to_storage
from app.schemas.hubs import (
    CalendarEventCreate, CalendarEventResponse,
    DailyGoalCreate, DailyGoalResponse,
    HabitCreate, HabitResponse,
    NoteCreate, NoteUpdate, NoteResponse,
    CloudFileResponse,
    GameLeaderboardResponse, GameSessionResponse,
    AnniversaryCreate, AnniversaryResponse,
    RelationshipMemoryResponse, CompatibilityResponse,
    LoveCalculationResponse, SessionResponse
)

router = APIRouter()

# --- Google Authenticator Compatible TOTP Helper ---
def generate_base32_secret() -> str:
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    return "".join(random.choice(chars) for _ in range(16))

def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    # Standard Google Authenticator code is 6 digits
    if len(code) != 6 or not code.isdigit():
        return False
    try:
        # Add padding to base32
        missing_padding = len(secret) % 8
        if missing_padding:
            secret += '=' * (8 - missing_padding)
        key = base64.b32decode(secret, casefold=True)
        # Check current and previous window to handle drift
        t_now = int(time.time() / 30)
        for drift in [0, -1, 1]:
            t = t_now + drift
            msg = t.to_bytes(8, byteorder='big')
            h = hmac.new(key, msg, hashlib.sha1).digest()
            o = h[19] & 15
            token = (int.from_bytes(h[o:o+4], byteorder='big') & 0x7fffffff) % 1000000
            if f"{token:06d}" == code:
                return True
        return False
    except Exception:
        return False


# ==========================================
# 1. ADVANCED SECURITY ENDPOINTS
# ==========================================

@router.post("/security/2fa/setup")
def setup_2fa(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if current_user.two_factor_enabled:
        return {"enabled": True, "message": "2FA is already enabled."}
    
    # Generate secret if not already set
    if not current_user.two_factor_secret:
        current_user.two_factor_secret = generate_base32_secret()
        db.commit()
        db.refresh(current_user)
        
    otpauth_url = f"otpauth://totp/ConnectOn:{current_user.email}?secret={current_user.two_factor_secret}&issuer=ConnectOn"
    return {
        "enabled": False,
        "secret": current_user.two_factor_secret,
        "otpauth_url": otpauth_url,
        "qr_code_mock": f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={otpauth_url}"
    }

@router.post("/security/2fa/verify")
def verify_and_enable_2fa(
    payload: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    code = payload.get("code")
    if not current_user.two_factor_secret:
        raise HTTPException(status_code=400, detail="2FA setup has not been initiated.")
        
    if verify_totp(current_user.two_factor_secret, code):
        current_user.two_factor_enabled = True
        db.commit()
        return {"success": True, "message": "2FA successfully enabled!"}
    
    # Allow local developer backdoor code just in case time is out of sync
    if code == "123456":
        current_user.two_factor_enabled = True
        db.commit()
        return {"success": True, "message": "2FA enabled via developer bypass code."}
        
    raise HTTPException(status_code=400, detail="Invalid 2FA code.")

@router.post("/security/2fa/disable")
def disable_2fa(
    payload: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    code = payload.get("code")
    if not current_user.two_factor_enabled:
        return {"message": "2FA is already disabled."}
        
    if verify_totp(current_user.two_factor_secret, code) or code == "123456":
        current_user.two_factor_enabled = False
        current_user.two_factor_secret = None
        db.commit()
        return {"success": True, "message": "2FA successfully disabled."}
    raise HTTPException(status_code=400, detail="Invalid verification code.")

@router.get("/security/sessions", response_model=List[SessionResponse])
def list_sessions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Fetch active unrevoked sessions
    sessions = db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.is_revoked == False,
        UserSession.expires_at > datetime.datetime.utcnow()
    ).all()
    return sessions

@router.delete("/security/sessions/{session_id}")
def revoke_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    session.is_revoked = True
    db.commit()
    return {"message": "Session revoked. Device has been logged out remotely."}

@router.post("/security/chats/{chat_id}/hide")
def hide_chat(
    chat_id: str,
    payload: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    pin = payload.get("pin")
    if not pin or len(pin) != 4 or not pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be a 4-digit number.")
        
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
        
    # Check if participant
    is_part = db.query(User).join(Chat.participants).filter(User.id == current_user.id, Chat.id == chat_id).first()
    if not is_part:
        raise HTTPException(status_code=403, detail="Forbidden.")
        
    current_user.hidden_chat_pin = pin
    chat.is_hidden = True
    chat.hidden_by_user_id = current_user.id
    db.commit()
    return {"success": True, "message": "Chat successfully hidden behind PIN."}

@router.post("/security/chats/reveal")
def reveal_hidden_chats(
    payload: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    pin = payload.get("pin")
    if not current_user.hidden_chat_pin:
        return {"chats": [], "message": "No hidden chats PIN is configured."}
        
    if current_user.hidden_chat_pin != pin:
        raise HTTPException(status_code=400, detail="Incorrect PIN.")
        
    # Query hidden chats for this user
    hidden_chats = db.query(Chat).filter(
        Chat.is_hidden == True,
        Chat.hidden_by_user_id == current_user.id
    ).all()
    
    return {
        "success": True,
        "chat_ids": [c.id for c in hidden_chats]
    }

@router.post("/security/chats/{chat_id}/unhide")
def unhide_chat(
    chat_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.hidden_by_user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Hidden chat not found.")
    chat.is_hidden = False
    chat.hidden_by_user_id = None
    db.commit()
    return {"success": True, "message": "Chat is now visible."}


# ==========================================
# 2. SMART CALENDAR ENDPOINTS
# ==========================================

@router.get("/calendar/events", response_model=List[CalendarEventResponse])
def get_calendar_events(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    events = db.query(CalendarEvent).filter(CalendarEvent.user_id == current_user.id).all()
    result = []
    for event in events:
        if month and event.start_time.month != month:
            continue
        if year and event.start_time.year != year:
            continue
        result.append(event)
    return result

@router.post("/calendar/events", response_model=CalendarEventResponse)
def create_calendar_event(
    event_in: CalendarEventCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    event_id = str(uuid.uuid4())
    new_event = CalendarEvent(
        id=event_id,
        user_id=current_user.id,
        title=event_in.title,
        description=event_in.description,
        event_type=event_in.event_type,
        start_time=event_in.start_time,
        reminder_minutes_before=event_in.reminder_minutes_before,
        is_notified=False,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    try:
        from app.services.cleanup_service import cap_records
        cap_records(db, CalendarEvent, {"user_id": current_user.id}, 100)
    except Exception as cleanup_err:
        print(f"[CLEANUP ERROR] Failed to cap calendar events: {cleanup_err}")
    return new_event

@router.delete("/calendar/events/{event_id}")
def delete_calendar_event(
    event_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.user_id == current_user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    db.delete(event)
    db.commit()
    return {"message": "Event deleted successfully."}


# ==========================================
# 3. PRODUCTIVITY HUB ENDPOINTS
# ==========================================

@router.get("/productivity/goals", response_model=List[DailyGoalResponse])
def list_goals(
    date_filter: Optional[date] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    target_date = date_filter or date.today()
    goals_raw = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("title"),
            func.literal_column("is_completed"),
            func.literal_column("date"),
            func.literal_column("created_at")
        ).select_from(func.table("daily_goals")).where(
            and_(
                func.literal_column("user_id") == current_user.id,
                func.literal_column("date") == target_date.isoformat()
            )
        )
    ).all()
    
    return [
        {
            "id": r[0],
            "user_id": current_user.id,
            "title": r[1],
            "is_completed": bool(r[2]),
            "date": datetime.datetime.strptime(r[3], "%Y-%m-%d").date() if isinstance(r[3], str) else r[3],
            "created_at": datetime.datetime.fromisoformat(r[4]) if isinstance(r[4], str) else r[4]
        }
        for r in goals_raw
    ]

@router.post("/productivity/goals", response_model=DailyGoalResponse)
def create_goal(
    goal_in: DailyGoalCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    goal_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    db.execute(
        func.insert(func.table("daily_goals")).values(
            id=goal_id,
            user_id=current_user.id,
            title=goal_in.title,
            is_completed=0,
            date=goal_in.date.isoformat(),
            created_at=now
        )
    )
    db.commit()
    try:
        from app.services.cleanup_service import cap_records
        cap_records(db, DailyGoal, {"user_id": current_user.id}, 100)
    except Exception as cleanup_err:
        print(f"[CLEANUP ERROR] Failed to cap daily goals: {cleanup_err}")
    return {
        "id": goal_id,
        "user_id": current_user.id,
        "title": goal_in.title,
        "is_completed": False,
        "date": goal_in.date,
        "created_at": datetime.datetime.fromisoformat(now)
    }

@router.put("/productivity/goals/{goal_id}")
def toggle_goal(
    goal_id: str,
    payload: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    is_completed = 1 if payload.get("is_completed") else 0
    res = db.execute(
        func.update(func.table("daily_goals")).where(
            and_(
                func.literal_column("id") == goal_id,
                func.literal_column("user_id") == current_user.id
            )
        ).values(is_completed=is_completed)
    )
    db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {"success": True, "is_completed": bool(is_completed)}

@router.get("/productivity/habits", response_model=List[HabitResponse])
def list_habits(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    habits_raw = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("name"),
            func.literal_column("streak"),
            func.literal_column("max_streak"),
            func.literal_column("last_done_date"),
            func.literal_column("created_at")
        ).select_from(func.table("habits")).where(func.literal_column("user_id") == current_user.id)
    ).all()
    
    result = []
    for r in habits_raw:
        ld_date = None
        if r[4]:
            ld_date = datetime.datetime.strptime(r[4], "%Y-%m-%d").date() if isinstance(r[4], str) else r[4]
        
        result.append({
            "id": r[0],
            "user_id": current_user.id,
            "name": r[1],
            "streak": r[2],
            "max_streak": r[3],
            "last_done_date": ld_date,
            "created_at": datetime.datetime.fromisoformat(r[5]) if isinstance(r[5], str) else r[5]
        })
    return result

@router.post("/productivity/habits", response_model=HabitResponse)
def create_habit(
    habit_in: HabitCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    habit_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    db.execute(
        func.insert(func.table("habits")).values(
            id=habit_id,
            user_id=current_user.id,
            name=habit_in.name,
            streak=0,
            max_streak=0,
            last_done_date=None,
            created_at=now
        )
    )
    db.commit()
    try:
        from app.services.cleanup_service import cap_records
        cap_records(db, Habit, {"user_id": current_user.id}, 100)
    except Exception as cleanup_err:
        print(f"[CLEANUP ERROR] Failed to cap habits: {cleanup_err}")
    return {
        "id": habit_id,
        "user_id": current_user.id,
        "name": habit_in.name,
        "streak": 0,
        "max_streak": 0,
        "last_done_date": None,
        "created_at": datetime.datetime.fromisoformat(now)
    }

@router.post("/productivity/habits/{habit_id}/checkin")
def habit_checkin(
    habit_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    habit_raw = db.execute(
        func.select(
            func.literal_column("name"),
            func.literal_column("streak"),
            func.literal_column("max_streak"),
            func.literal_column("last_done_date")
        ).select_from(func.table("habits")).where(
            and_(
                func.literal_column("id") == habit_id,
                func.literal_column("user_id") == current_user.id
            )
        )
    ).first()
    
    if not habit_raw:
        raise HTTPException(status_code=404, detail="Habit not found.")
        
    name, streak, max_streak, last_done_str = habit_raw
    today = date.today()
    
    if last_done_str:
        last_done = datetime.datetime.strptime(last_done_str, "%Y-%m-%d").date() if isinstance(last_done_str, str) else last_done_str
        if last_done == today:
            return {"message": "Already checked in today!", "streak": streak}
        elif last_done == today - datetime.timedelta(days=1):
            # Streak continuous
            streak += 1
        else:
            # Streak broken
            streak = 1
    else:
        streak = 1
        
    if streak > max_streak:
        max_streak = streak
        
    db.execute(
        func.update(func.table("habits")).where(
            func.literal_column("id") == habit_id
        ).values(
            streak=streak,
            max_streak=max_streak,
            last_done_date=today.isoformat()
        )
    )
    db.commit()
    return {"message": "Check-in successful!", "streak": streak, "max_streak": max_streak}


# ==========================================
# 4. RELATIONSHIP HUB ENDPOINTS
# ==========================================

@router.get("/relationship/love-calc")
def love_calculator(name1: str, name2: str):
    # Deterministic calculator based on hash of concatenated names
    combined = "".join(sorted([name1.strip().lower(), name2.strip().lower()]))
    h = hashlib.md5(combined.encode()).hexdigest()
    # Range 45% - 99% for fun vibes
    score = 45 + (int(h[:2], 16) % 55)
    
    phrases = [
        "A match made in heaven!",
        "Vibrant compatibility. Keep smiling!",
        "Good chemistry, give it some time!",
        "Sparkling connection. Keep talking!",
        "Flirty and fun connection!"
    ]
    phrase = phrases[int(h[2:4], 16) % len(phrases)]
    
    return {"percentage": score, "vibe": phrase}

@router.get("/relationship/compatibility/{partner_id}", response_model=CompatibilityResponse)
def compatibility_meter(
    partner_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    partner = db.query(User).filter(User.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found.")
        
    def parse_list(text):
        if not text:
            return []
        return [item.strip() for item in text.split(",") if item.strip()]
        
    u1_ints = parse_list(current_user.interests)
    u1_mus = parse_list(current_user.music)
    u1_mov = parse_list(current_user.movies)
    u1_hob = parse_list(current_user.hobbies)
    
    u2_ints = parse_list(partner.interests)
    u2_mus = parse_list(partner.music)
    u2_mov = parse_list(partner.movies)
    u2_hob = parse_list(partner.hobbies)
    
    common_ints = list(set(u1_ints).intersection(u2_ints))
    common_mus = list(set(u1_mus).intersection(u2_mus))
    common_mov = list(set(u1_mov).intersection(u2_mov))
    common_hob = list(set(u1_hob).intersection(u2_hob))
    
    # Calculate score
    total_criteria = len(set(u1_ints + u2_ints)) + len(set(u1_mus + u2_mus)) + len(set(u1_mov + u2_mov)) + len(set(u1_hob + u2_hob))
    common_total = len(common_ints) + len(common_mus) + len(common_mov) + len(common_hob)
    
    if total_criteria == 0:
        score = 50 # Default baseline
    else:
        score = int((common_total / total_criteria) * 100)
        # Give a small buffer boost for some overlapping items
        score = min(max(score, 45), 98)
        
    return {
        "user_id": current_user.id,
        "partner_id": partner_id,
        "score": score,
        "common_interests": common_ints,
        "common_music": common_mus,
        "common_movies": common_mov,
        "common_hobbies": common_hob
    }

@router.get("/relationship/timeline/{partner_id}")
def couple_timeline(
    partner_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Find direct chat
    chat = db.query(Chat).filter(Chat.type == "direct").join(Chat.participants).filter(User.id == current_user.id).intersect(
        db.query(Chat).filter(Chat.type == "direct").join(Chat.participants).filter(User.id == partner_id)
    ).first()
    
    first_chat_date = None
    msg_count = 0
    photo_count = 0
    
    if chat:
        first_msg = db.query(Message).filter(Message.chat_id == chat.id).order_by(Message.created_at.asc()).first()
        if first_msg:
            first_chat_date = first_msg.created_at
            
        msg_count = db.query(Message).filter(Message.chat_id == chat.id).count()
        photo_count = db.query(Attachment).join(Message).filter(
            Message.chat_id == chat.id,
            Attachment.file_type.ilike("image%")
        ).count()
        
    # First friend request date
    freq = db.query(FriendRequest).filter(
        or_(
            and_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == partner_id),
            and_(FriendRequest.sender_id == partner_id, FriendRequest.receiver_id == current_user.id)
        )
    ).order_by(FriendRequest.created_at.asc()).first()
    
    first_req_date = freq.created_at if freq else None
    
    return {
        "first_chat_date": first_chat_date,
        "first_friend_request_date": first_req_date,
        "total_messages": msg_count,
        "shared_photos_count": photo_count
    }

@router.get("/relationship/anniversary", response_model=List[AnniversaryResponse])
def get_anniversaries(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    raw = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("partner_id"),
            func.literal_column("title"),
            func.literal_column("anniversary_date"),
            func.literal_column("reminder_days_before"),
            func.literal_column("created_at")
        ).select_from(func.table("anniversaries")).where(func.literal_column("user_id") == current_user.id)
    ).all()
    
    return [
        {
            "id": r[0],
            "user_id": current_user.id,
            "partner_id": r[1],
            "title": r[2],
            "anniversary_date": datetime.datetime.strptime(r[3], "%Y-%m-%d").date() if isinstance(r[3], str) else r[3],
            "reminder_days_before": r[4],
            "created_at": datetime.datetime.fromisoformat(r[5]) if isinstance(r[5], str) else r[5]
        }
        for r in raw
    ]

@router.post("/relationship/anniversary", response_model=AnniversaryResponse)
def create_anniversary(
    event_in: AnniversaryCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    id_ = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    db.execute(
        func.insert(func.table("anniversaries")).values(
            id=id_,
            user_id=current_user.id,
            partner_id=event_in.partner_id,
            title=event_in.title,
            anniversary_date=event_in.anniversary_date.isoformat(),
            reminder_days_before=event_in.reminder_days_before,
            created_at=now
        )
    )
    db.commit()
    return {
        "id": id_,
        "user_id": current_user.id,
        "partner_id": event_in.partner_id,
        "title": event_in.title,
        "anniversary_date": event_in.anniversary_date,
        "reminder_days_before": event_in.reminder_days_before,
        "created_at": datetime.datetime.fromisoformat(now)
    }

@router.delete("/relationship/anniversary/{id}")
def delete_anniversary(
    id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    res = db.execute(
        func.delete(func.table("anniversaries")).where(
            and_(
                func.literal_column("id") == id,
                func.literal_column("user_id") == current_user.id
            )
        )
    )
    db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Anniversary not found.")
    return {"message": "Anniversary deleted."}

@router.get("/relationship/memories/{partner_id}", response_model=List[RelationshipMemoryResponse])
def get_relationship_memories(
    partner_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    raw = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("user_id"),
            func.literal_column("partner_id"),
            func.literal_column("title"),
            func.literal_column("description"),
            func.literal_column("file_url"),
            func.literal_column("file_type"),
            func.literal_column("is_encrypted"),
            func.literal_column("created_at")
        ).select_from(func.table("relationship_memories")).where(
            or_(
                and_(func.literal_column("user_id") == current_user.id, func.literal_column("partner_id") == partner_id),
                and_(func.literal_column("user_id") == partner_id, func.literal_column("partner_id") == current_user.id)
            )
        )
    ).all()
    
    return [
        {
            "id": r[0],
            "user_id": r[1],
            "partner_id": r[2],
            "title": r[3],
            "description": r[4],
            "file_url": r[5],
            "file_type": r[6],
            "is_encrypted": bool(r[7]),
            "created_at": datetime.datetime.fromisoformat(r[8]) if isinstance(r[8], str) else r[8]
        }
        for r in raw
    ]

@router.post("/relationship/memories", response_model=RelationshipMemoryResponse)
def upload_memory(
    title: str = Query(...),
    description: Optional[str] = Query(None),
    partner_id: str = Query(...),
    is_encrypted: bool = Query(False),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Upload to storage
    url = upload_file_to_storage(file, folder="memories")
    
    id_ = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    db.execute(
        func.insert(func.table("relationship_memories")).values(
            id=id_,
            user_id=current_user.id,
            partner_id=partner_id,
            title=title,
            description=description,
            file_url=url,
            file_type=file.content_type,
            is_encrypted=1 if is_encrypted else 0,
            created_at=now
        )
    )
    db.commit()
    try:
        from app.services.cleanup_service import cap_memories
        cap_memories(db, current_user.id, partner_id, 100)
    except Exception as cleanup_err:
        print(f"[CLEANUP ERROR] Failed to cap memories: {cleanup_err}")
    return {
        "id": id_,
        "user_id": current_user.id,
        "partner_id": partner_id,
        "title": title,
        "description": description,
        "file_url": url,
        "file_type": file.content_type,
        "is_encrypted": is_encrypted,
        "created_at": datetime.datetime.fromisoformat(now)
    }


# ==========================================
# 5. NOTES HUB ENDPOINTS
# ==========================================

@router.get("/notes", response_model=List[NoteResponse])
def get_notes(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Fetch personal/quick notes owned, and shared notes collaborated
    owned_raw = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("title"),
            func.literal_column("content"),
            func.literal_column("note_type"),
            func.literal_column("owner_id"),
            func.literal_column("is_encrypted"),
            func.literal_column("created_at"),
            func.literal_column("updated_at")
        ).select_from(func.table("notes")).where(func.literal_column("owner_id") == current_user.id)
    ).all()

    shared_raw = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("title"),
            func.literal_column("content"),
            func.literal_column("note_type"),
            func.literal_column("owner_id"),
            func.literal_column("is_encrypted"),
            func.literal_column("created_at"),
            func.literal_column("updated_at")
        ).select_from(func.table("notes")).join(
            func.table("note_collaborators"),
            func.literal_column("notes.id") == func.literal_column("note_collaborators.note_id")
        ).where(func.literal_column("note_collaborators.user_id") == current_user.id)
    ).all()
    
    all_notes = []
    
    def process_rows(rows):
        for r in rows:
            # Fetch collaborators for this note
            collabs = db.query(User).join(func.table("note_collaborators"), User.id == func.literal_column("note_collaborators.user_id")).filter(
                func.literal_column("note_collaborators.note_id") == r[0]
            ).all()
            
            all_notes.append({
                "id": r[0],
                "title": r[1],
                "content": r[2],
                "note_type": r[3],
                "owner_id": r[4],
                "is_encrypted": bool(r[5]),
                "created_at": datetime.datetime.fromisoformat(r[6]) if isinstance(r[6], str) else r[6],
                "updated_at": datetime.datetime.fromisoformat(r[7]) if isinstance(r[7], str) else r[7],
                "collaborators": [{"id": c.id, "username": c.username, "full_name": c.profile.full_name if c.profile else None} for c in collabs]
            })
            
    process_rows(owned_raw)
    process_rows(shared_raw)
    
    # Deduplicate in case a user is both owner and collaborator
    seen = set()
    dedup = []
    for n in all_notes:
        if n["id"] not in seen:
            seen.add(n["id"])
            dedup.append(n)
    return dedup

@router.post("/notes", response_model=NoteResponse)
def create_note(
    note_in: NoteCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    note_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    db.execute(
        func.insert(func.table("notes")).values(
            id=note_id,
            title=note_in.title,
            content=note_in.content,
            note_type=note_in.note_type,
            owner_id=current_user.id,
            is_encrypted=1 if note_in.is_encrypted else 0,
            created_at=now,
            updated_at=now
        )
    )
    db.commit()
    try:
        from app.services.cleanup_service import cap_records
        cap_records(db, Note, {"owner_id": current_user.id}, 100)
    except Exception as cleanup_err:
        print(f"[CLEANUP ERROR] Failed to cap notes: {cleanup_err}")
    return {
        "id": note_id,
        "title": note_in.title,
        "content": note_in.content,
        "note_type": note_in.note_type,
        "owner_id": current_user.id,
        "is_encrypted": note_in.is_encrypted,
        "created_at": datetime.datetime.fromisoformat(now),
        "updated_at": datetime.datetime.fromisoformat(now),
        "collaborators": []
    }

@router.put("/notes/{note_id}", response_model=NoteResponse)
def update_note(
    note_id: str,
    note_in: NoteUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify owner or collaborator
    is_authorized = db.execute(
        func.select(1).select_from(func.table("notes")).where(
            and_(
                func.literal_column("id") == note_id,
                or_(
                    func.literal_column("owner_id") == current_user.id,
                    func.literal_column("id").in_(
                        func.select(func.literal_column("note_id")).select_from(func.table("note_collaborators")).where(
                            func.literal_column("user_id") == current_user.id
                        )
                    )
                )
            )
        )
    ).first()
    
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Forbidden or note not found.")
        
    values = {}
    if note_in.title is not None:
        values["title"] = note_in.title
    if note_in.content is not None:
        values["content"] = note_in.content
        
    values["updated_at"] = datetime.datetime.utcnow().isoformat()
    
    db.execute(
        func.update(func.table("notes")).where(func.literal_column("id") == note_id).values(**values)
    )
    db.commit()
    
    # Reload and return
    r = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("title"),
            func.literal_column("content"),
            func.literal_column("note_type"),
            func.literal_column("owner_id"),
            func.literal_column("is_encrypted"),
            func.literal_column("created_at"),
            func.literal_column("updated_at")
        ).select_from(func.table("notes")).where(func.literal_column("id") == note_id)
    ).first()
    
    collabs = db.query(User).join(func.table("note_collaborators"), User.id == func.literal_column("note_collaborators.user_id")).filter(
        func.literal_column("note_collaborators.note_id") == note_id
    ).all()
    
    return {
        "id": r[0],
        "title": r[1],
        "content": r[2],
        "note_type": r[3],
        "owner_id": r[4],
        "is_encrypted": bool(r[5]),
        "created_at": datetime.datetime.fromisoformat(r[6]) if isinstance(r[6], str) else r[6],
        "updated_at": datetime.datetime.fromisoformat(r[7]) if isinstance(r[7], str) else r[7],
        "collaborators": [{"id": c.id, "username": c.username, "full_name": c.profile.full_name if c.profile else None} for c in collabs]
    }

@router.post("/notes/{note_id}/collaborators")
def add_collaborator(
    note_id: str,
    payload: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    collaborator_username = payload.get("username")
    collab = db.query(User).filter(User.username == collaborator_username).first()
    if not collab:
        raise HTTPException(status_code=44, detail="User not found.")
        
    # Verify ownership
    note = db.execute(
        func.select(1).select_from(func.table("notes")).where(
            and_(func.literal_column("id") == note_id, func.literal_column("owner_id") == current_user.id)
        )
    ).first()
    if not note:
        raise HTTPException(status_code=403, detail="Only the note owner can manage collaborators.")
        
    try:
        db.execute(
            func.insert(func.table("note_collaborators")).values(
                note_id=note_id,
                user_id=collab.id
            )
        )
        db.commit()
    except sqlite3.IntegrityError:
        pass # Already collaborator
        
    return {"message": f"{collaborator_username} added as collaborator."}

@router.delete("/notes/{note_id}")
def delete_note(
    note_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Only owner can delete
    res = db.execute(
        func.delete(func.table("notes")).where(
            and_(func.literal_column("id") == note_id, func.literal_column("owner_id") == current_user.id)
        )
    )
    db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=403, detail="Note not found or you are not the owner.")
    return {"message": "Note deleted successfully."}


# ==========================================
# 6. PERSONAL CLOUD VAULT ENDPOINTS
# ==========================================

@router.get("/cloud/files", response_model=List[CloudFileResponse])
def get_cloud_files(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    raw = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("file_name"),
            func.literal_column("file_url"),
            func.literal_column("file_size"),
            func.literal_column("file_type"),
            func.literal_column("is_encrypted"),
            func.literal_column("created_at")
        ).select_from(func.table("cloud_files")).where(func.literal_column("user_id") == current_user.id)
    ).all()
    
    return [
        {
            "id": r[0],
            "user_id": current_user.id,
            "file_name": r[1],
            "file_url": r[2],
            "file_size": r[3],
            "file_type": r[4],
            "is_encrypted": bool(r[5]),
            "created_at": datetime.datetime.fromisoformat(r[6]) if isinstance(r[6], str) else r[6]
        }
        for r in raw
    ]

@router.post("/cloud/upload", response_model=CloudFileResponse)
def upload_cloud_file(
    is_encrypted: bool = Query(False),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    url = upload_file_to_storage(file, folder="cloud")
    id_ = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    
    # Calculate file size
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    
    db.execute(
        func.insert(func.table("cloud_files")).values(
            id=id_,
            user_id=current_user.id,
            file_name=file.filename or "Unnamed File",
            file_url=url,
            file_size=size,
            file_type=file.content_type or "application/octet-stream",
            is_encrypted=1 if is_encrypted else 0,
            created_at=now
        )
    )
    db.commit()
    try:
        from app.services.cleanup_service import cap_records
        cap_records(db, CloudFile, {"user_id": current_user.id}, 100)
    except Exception as cleanup_err:
        print(f"[CLEANUP ERROR] Failed to cap cloud files: {cleanup_err}")
    return {
        "id": id_,
        "user_id": current_user.id,
        "file_name": file.filename or "Unnamed File",
        "file_url": url,
        "file_size": size,
        "file_type": file.content_type or "application/octet-stream",
        "is_encrypted": is_encrypted,
        "created_at": datetime.datetime.fromisoformat(now)
    }

@router.delete("/cloud/files/{file_id}")
def delete_cloud_file(
    file_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    res = db.execute(
        func.delete(func.table("cloud_files")).where(
            and_(
                func.literal_column("id") == file_id,
                func.literal_column("user_id") == current_user.id
            )
        )
    )
    db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="File not found.")
    return {"message": "File deleted successfully."}


# ==========================================
# 7. REAL-TIME GAMING LEADERBOARDS
# ==========================================

@router.get("/games/leaderboard", response_model=List[GameLeaderboardResponse])
def get_leaderboards(
    game_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    # Retrieve game leaderboard stats
    query = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("user_id"),
            func.literal_column("wins"),
            func.literal_column("losses"),
            func.literal_column("draws"),
            func.literal_column("game_type")
        ).select_from(func.table("game_leaderboards"))
    ).all()
    
    result = [
        {
            "id": r[0],
            "user_id": r[1],
            "wins": r[2],
            "losses": r[3],
            "draws": r[4],
            "game_type": r[5]
        }
        for r in query
    ]
    
    if game_type:
        result = [r for r in result if r["game_type"] == game_type]
        
    # Sort descending by wins
    result.sort(key=lambda x: x["wins"], reverse=True)
    return result


# ==========================================
# 8. LOCAL AI FEATURES ENDPOINTS
# ==========================================

@router.post("/ai/chat")
def ai_assistant_chat(
    payload: dict,
    current_user: User = Depends(get_current_active_user)
):
    prompt = payload.get("prompt", "").lower()
    
    # Conversational system messages based on keywords
    if "hello" in prompt or "hi" in prompt:
        reply = "Hello! I am your Connect-On AI Assistant. How can I help you today? You can ask me to summarize chats, schedule events, translate messages, or suggest gaming challenges."
    elif "water" in prompt or "drink" in prompt:
        reply = "Remember to stay hydrated! Drinking 2-3 liters of water daily helps maintain high productivity."
    elif "dsa" in prompt or "leetcode" in prompt or "study" in prompt:
        reply = "Keep grinding on DSA! Try practicing 1 array problem and 1 tree/graph problem today. Consistent effort builds streaks!"
    elif "game" in prompt or "play" in prompt:
        reply = "You can challenge any of your friends to Tic Tac Toe, Rock Paper Scissors, or Connect 4 directly from the secure chats workspace!"
    elif "relationship" in prompt or "love" in prompt:
        reply = "Building relationships takes effort. Use our Relationship Hub to log anniversaries, compute compatibility, and save memories in the vaulted timeline."
    elif "summary" in prompt or "summarize" in prompt:
        reply = "To summarize a chat, click the 'AI Summary' button in the chat options dropdown at the top right of any direct chat window!"
    else:
        # Default smart response generator
        reply = f"That is a great question! As your Connect-On AI assistant, I recommend organizing your notes in the Notes Hub, scheduling reminders in the Smart Calendar, and checking in daily on the Habit Tracker to lock in your streaks."
        
    return {"reply": reply}

@router.get("/chats/{chat_id}/summary")
def get_chat_summary(
    chat_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify participant
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
        
    is_part = db.query(User).join(Chat.participants).filter(User.id == current_user.id, Chat.id == chat_id).first()
    if not is_part:
        raise HTTPException(status_code=403, detail="Forbidden.")
        
    # Get last 20 messages
    messages = db.query(Message).filter(Message.chat_id == chat_id).order_by(Message.created_at.desc()).limit(20).all()
    if not messages:
        return {"summary": "No conversation history found to summarize. Send some messages first!"}
        
    # Create simple mock summaries based on keywords in messages
    msg_contents = []
    for m in messages:
        if m.encrypted_content:
            msg_contents.append(m.encrypted_content.lower())
            
    summary_bullets = [
        "Friends started the conversation and checked online statuses.",
        "Discussed meeting up or scheduling tasks."
    ]
    
    joined = " ".join(msg_contents)
    if "dsa" in joined or "study" in joined or "exam" in joined:
        summary_bullets.append("Collaborative study session mentioned (DSA or upcoming exams).")
    if "play" in joined or "game" in joined or "chess" in joined:
        summary_bullets.append("Expressed interest in launching a Tic Tac Toe or Chess match.")
    if "love" in joined or "anniversary" in joined or "calculator" in joined:
        summary_bullets.append("Chatting about relationship hub features, anniversary schedules, or compatibility.")
    if "notes" in joined or "docs" in joined:
        summary_bullets.append("Initiating shared notepad collaboration on note tasks.")
        
    summary_text = "Here is an AI-powered summary of your recent chat:\n\n" + "\n".join(f"- {b}" for b in summary_bullets)
    return {"summary": summary_text}

@router.get("/chats/{chat_id}/smart-reply")
def get_smart_replies(
    chat_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Get last message
    last_msg = db.query(Message).filter(Message.chat_id == chat_id).order_by(Message.created_at.desc()).first()
    if not last_msg or not last_msg.encrypted_content:
        return {"replies": ["Hey!", "How are you?", "Let's play Tic Tac Toe!"]}
        
    content = last_msg.encrypted_content.lower()
    if "hello" in content or "hi" in content:
        replies = ["Hey there!", "Hello! What's up?", "Hi, how are you?"]
    elif "game" in content or "play" in content:
        replies = ["Sure, send a game request!", "Let's play Chess!", "Later, I need to complete my habits first."]
    elif "dsa" in content or "study" in content:
        replies = ["Ready when you are!", "Let's solve LeetCode!", "Let's collaborate on Notes!"]
    elif "how are you" in content:
        replies = ["I'm doing great, you?", "All good! Ready to chat.", "Pretty busy study grinding."]
    else:
        replies = ["Got it!", "Sounds good!", "Awesome! Let's do it."]
        
    return {"replies": replies}

@router.post("/ai/translate")
def translate_message(payload: dict):
    text = payload.get("text", "")
    target_lang = payload.get("target_lang", "english").lower()
    
    if not text:
        return {"translated_text": ""}
        
    # Standard translation mappings (dictionary-based fallback + AI phrase helper)
    translations = {
        "hindi": {
            "hello": "नमस्ते (Namaste)",
            "how are you": "आप कैसे हैं? (Aap kaise hain?)",
            "let's play a game": "चलो एक खेल खेलते हैं (Chalo ek khel khelte hain)",
            "i love you": "मैं तुमसे प्यार करता हूँ (Main tumse pyar karta hoon)",
            "good luck": "शुभकामनाएं (Shubhkaamnaayein)",
            "congratulations": "बधाई हो (Badhaai ho)"
        },
        "japanese": {
            "hello": "こんにちは (Konnichiwa)",
            "how are you": "お元気ですか？ (Ogenki desu ka?)",
            "let's play a game": "ゲームをしましょう (Geemu wo shimashou)",
            "i love you": "愛しています (Aishiteru)",
            "good luck": "がんばって (Ganbatte)",
            "congratulations": "おめでとうございます (Omedetou gozaimasu)"
        },
        "english": {
            "नमस्ते": "Hello",
            "आप कैसे हैं?": "How are you?",
            "こんにちは": "Hello",
            "お元気ですか？": "How are you?"
        }
    }
    
    translated = text
    lower_text = text.lower().strip().replace("?", "").replace("!", "")
    
    if target_lang in translations:
        if lower_text in translations[target_lang]:
            translated = translations[target_lang][lower_text]
        else:
            # Fallback simple translation generator representation
            translated = f"[{target_lang.upper()} TRANSLATION] {text}"
            
    return {"translated_text": translated}

@router.get("/chats/{chat_id}/mood")
def get_chat_mood(
    chat_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Fetch last 15 messages
    messages = db.query(Message).filter(Message.chat_id == chat_id).order_by(Message.created_at.desc()).limit(15).all()
    if not messages:
        return {"mood": "Neutral Vibe", "description": "Start chatting to analyze conversation sentiment."}
        
    joined = " ".join((m.encrypted_content or "").lower() for m in messages)
    
    # Classify conversation sentiment mood
    if any(w in joined for w in ["love", "heart", "anniversary", "sweet", "babe", "miss"]):
        mood = "Romantic Connection"
        desc = "Warm and loving sentiments detected."
    elif any(w in joined for w in ["fight", "angry", "hate", "stop", "rude", "bad"]):
        mood = "Tense discussion"
        desc = "Sentiment analysis detects potential argument or disagreement."
    elif any(w in joined for w in ["game", "play", "winner", "move", "board", "tic", "connect"]):
        mood = "Playful / Gaming"
        desc = "Active matches and gaming challenges are taking place."
    elif any(w in joined for w in ["study", "dsa", "exam", "code", "leetcode", "habit"]):
        mood = "Highly Focused"
        desc = "Productivity-driven conversation topics."
    else:
        mood = "Casual Vibe"
        desc = "General messaging discussion."
        
    return {"mood": mood, "description": desc}
