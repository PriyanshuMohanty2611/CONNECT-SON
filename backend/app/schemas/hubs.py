from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date

# --- Calendar Hub ---
class CalendarEventBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    event_type: str = Field("reminder", pattern="^(birthday|meeting|exam|anniversary|task|reminder)$")
    start_time: datetime
    reminder_minutes_before: int = Field(60, ge=0)

class CalendarEventCreate(CalendarEventBase):
    pass

class CalendarEventResponse(CalendarEventBase):
    id: str
    user_id: str
    is_notified: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Productivity Hub ---
class DailyGoalCreate(BaseModel):
    title: str = Field(..., max_length=255)
    date: date

class DailyGoalResponse(BaseModel):
    id: str
    user_id: str
    title: str
    is_completed: bool
    date: date
    created_at: datetime

    class Config:
        from_attributes = True

class HabitCreate(BaseModel):
    name: str = Field(..., max_length=255)

class HabitResponse(BaseModel):
    id: str
    user_id: str
    name: str
    streak: int
    max_streak: int
    last_done_date: Optional[date] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Notes Hub ---
class NoteCreate(BaseModel):
    title: str = Field("Untitled", max_length=255)
    content: str = ""
    note_type: str = Field("personal", pattern="^(personal|shared|quick)$")
    is_encrypted: bool = False

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class CollaboratorResponse(BaseModel):
    id: str
    username: str
    full_name: Optional[str] = None

class NoteResponse(BaseModel):
    id: str
    title: str
    content: str
    note_type: str
    owner_id: str
    is_encrypted: bool
    created_at: datetime
    updated_at: datetime
    collaborators: Optional[List[CollaboratorResponse]] = []

    class Config:
        from_attributes = True


# --- Personal Cloud ---
class CloudFileResponse(BaseModel):
    id: str
    user_id: str
    file_name: str
    file_url: str
    file_size: int
    file_type: str
    is_encrypted: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Gaming Hub ---
class GameSessionCreate(BaseModel):
    chat_id: str
    game_type: str

class GameSessionResponse(BaseModel):
    id: str
    chat_id: str
    game_type: str
    status: str
    board_state: Optional[str] = None
    player1_id: str
    player2_id: str
    turn_player_id: Optional[str] = None
    winner_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class GameLeaderboardResponse(BaseModel):
    id: str
    user_id: str
    wins: int
    losses: int
    draws: int
    game_type: str

    class Config:
        from_attributes = True


# --- Relationship Hub ---
class LoveCalculationResponse(BaseModel):
    id: str
    user1_id: str
    user2_id: str
    percentage: int
    created_at: datetime

    class Config:
        from_attributes = True

class CompatibilityResponse(BaseModel):
    user_id: str
    partner_id: str
    score: int
    common_interests: List[str]
    common_music: List[str]
    common_movies: List[str]
    common_hobbies: List[str]

class AnniversaryCreate(BaseModel):
    partner_id: str
    title: str = Field(..., max_length=255)
    anniversary_date: date
    reminder_days_before: int = 1

class AnniversaryResponse(BaseModel):
    id: str
    user_id: str
    partner_id: str
    title: str
    anniversary_date: date
    reminder_days_before: int
    created_at: datetime

    class Config:
        from_attributes = True

class RelationshipMemoryResponse(BaseModel):
    id: str
    user_id: str
    partner_id: str
    title: str
    description: Optional[str] = None
    file_url: str
    file_type: str
    is_encrypted: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Advanced Security ---
class SessionResponse(BaseModel):
    id: str
    user_id: str
    device_info: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True
