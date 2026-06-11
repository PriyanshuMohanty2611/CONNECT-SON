import datetime
import uuid
from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    Date,
    ForeignKey,
    Text,
    Integer,
    Table,
    UUID,
    Index
)
from sqlalchemy.orm import relationship
from app.core.database import Base

def generate_uuid():
    return str(uuid.uuid4())

# Many-to-Many Association Table for Chat Participants
chat_participants = Table(
    "chat_participants",
    Base.metadata,
    Column("chat_id", String(36), ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("joined_at", DateTime, default=datetime.datetime.utcnow)
)

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    phone = Column(String(20), unique=True, index=True, nullable=True)
    is_verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    two_factor_enabled = Column(Boolean, default=False)
    two_factor_secret = Column(String(255), nullable=True)
    hidden_chat_pin = Column(String(255), nullable=True)
    interests = Column(Text, nullable=True)
    music = Column(Text, nullable=True)
    movies = Column(Text, nullable=True)
    hobbies = Column(Text, nullable=True)

    # Relationships
    profile = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    settings = relationship("Setting", back_populates="user", uselist=False, cascade="all, delete-orphan")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    stories = relationship("Story", back_populates="user", cascade="all, delete-orphan")
    story_views = relationship("StoryView", back_populates="viewer", cascade="all, delete-orphan")
    
    # Chats
    chats = relationship("Chat", secondary=chat_participants, back_populates="participants")
    sent_messages = relationship("Message", back_populates="sender", cascade="all, delete-orphan")
    message_statuses = relationship("MessageStatus", back_populates="user", cascade="all, delete-orphan")
    reactions = relationship("MessageReaction", back_populates="user", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="uploader", cascade="all, delete-orphan")
    
    # Friend system
    friend_requests_sent = relationship(
        "FriendRequest",
        foreign_keys="FriendRequest.sender_id",
        back_populates="sender",
        cascade="all, delete-orphan"
    )
    friend_requests_received = relationship(
        "FriendRequest",
        foreign_keys="FriendRequest.receiver_id",
        back_populates="receiver",
        cascade="all, delete-orphan"
    )
    
    # Notifications
    notifications = relationship(
        "Notification",
        foreign_keys="Notification.user_id",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    sent_notifications = relationship(
        "Notification",
        foreign_keys="Notification.sender_id",
        back_populates="sender",
        cascade="all, delete-orphan"
    )


class Profile(Base):
    __tablename__ = "profiles"

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    full_name = Column(String(100), nullable=False)
    bio = Column(Text, nullable=True)
    avatar_url = Column(Text, nullable=True)
    cover_url = Column(Text, nullable=True)
    dob = Column(Date, nullable=True)
    gender = Column(String(20), nullable=True)
    country = Column(String(100), nullable=True)
    theme_preference = Column(String(50), default="tiimi")
    presence_status = Column(String(20), default="offline") # online, away, busy, offline, invisible
    last_seen = Column(DateTime, nullable=True)
    public_key = Column(Text, nullable=True) # DH Public Key for E2EE
    backup_key_ciphertext = Column(Text, nullable=True) # Encrypted private key backup for recovery

    user = relationship("User", back_populates="profile")


class Setting(Base):
    __tablename__ = "settings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    allow_notifications = Column(Boolean, default=True)
    allow_profile_visits_notification = Column(Boolean, default=True)
    is_private_account = Column(Boolean, default=False)
    e2ee_enabled = Column(Boolean, default=True)
    ai_opt_out = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="settings")


class OTP(Base):
    __tablename__ = "otps"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), index=True, nullable=False)
    code = Column(String(6), nullable=False)
    purpose = Column(String(20), nullable=False) # registration, password_reset
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    receiver_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    status = Column(String(20), default="pending") # pending, accepted, rejected
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    sender = relationship("User", foreign_keys=[sender_id], back_populates="friend_requests_sent")
    receiver = relationship("User", foreign_keys=[receiver_id], back_populates="friend_requests_received")

    __table_args__ = (
        Index("ix_friend_requests_sender_receiver", "sender_id", "receiver_id"),
    )


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user1_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    user2_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_blocked = Column(Boolean, default=False)
    blocked_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        Index("ix_friendships_user1_user2", "user1_id", "user2_id"),
    )


class BlockedUser(Base):
    __tablename__ = "blocked_users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    blocker_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    blocked_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Chat(Base):
    __tablename__ = "chats"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    type = Column(String(20), default="direct") # direct, group
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_hidden = Column(Boolean, default=False)
    hidden_by_user_id = Column(String(36), nullable=True)

    participants = relationship("User", secondary=chat_participants, back_populates="chats")
    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    chat_id = Column(String(36), ForeignKey("chats.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    encrypted_content = Column(Text, nullable=True) # E2EE ciphertext
    nonce = Column(Text, nullable=True) # Initialization vector/nonce
    is_encrypted = Column(Boolean, default=True)
    reply_to_id = Column(String(36), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    client_msg_id = Column(UUID(as_uuid=True), unique=True, index=True, nullable=True)
    message_status = Column(String(20), default="PENDING")
    message_sequence = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    edited_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    available_at = Column(DateTime, nullable=True)
    last_modified_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User", back_populates="sent_messages")
    attachments = relationship("Attachment", back_populates="message")
    reactions = relationship("MessageReaction", back_populates="message", cascade="all, delete-orphan")
    statuses = relationship("MessageStatus", back_populates="message", cascade="all, delete-orphan")


class MessageStatus(Base):
    __tablename__ = "message_statuses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    message_id = Column(String(36), ForeignKey("messages.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    status = Column(String(20), nullable=False) # sent, delivered, seen
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    message = relationship("Message", back_populates="statuses")
    user = relationship("User", back_populates="message_statuses")

    __table_args__ = (
        # Composite index for fast unread count queries: WHERE user_id=X AND status != 'seen'
        Index("ix_message_statuses_user_status", "user_id", "status"),
    )


class MessageReaction(Base):
    __tablename__ = "message_reactions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    message_id = Column(String(36), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reaction = Column(String(20), nullable=False) # Emoji
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    message = relationship("Message", back_populates="reactions")
    user = relationship("User", back_populates="reactions")


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    message_id = Column(String(36), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    uploader_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_url = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False) # image, video, pdf, document, audio
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    message = relationship("Message", back_populates="attachments")
    uploader = relationship("User", back_populates="attachments")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    type = Column(String(50), nullable=False) # friend_request, friend_accept, new_message, reaction, profile_visit
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    target_id = Column(String(36), nullable=True) # UUID of related object
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id], back_populates="notifications")
    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_notifications")


class Story(Base):
    __tablename__ = "stories"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    media_url = Column(String(255), nullable=False)
    media_type = Column(String(20), nullable=False) # image, video
    filter_preset = Column(String(50), default="none")
    caption = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    music_url = Column(String(255), nullable=True)
    poll_question = Column(Text, nullable=True)
    poll_options = Column(Text, nullable=True)
    poll_votes = Column(Text, nullable=True)
    qa_question = Column(Text, nullable=True)
    qa_answers = Column(Text, nullable=True)

    user = relationship("User", back_populates="stories")
    views = relationship("StoryView", back_populates="story", cascade="all, delete-orphan")


class StoryView(Base):
    __tablename__ = "story_views"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    story_id = Column(String(36), ForeignKey("stories.id", ondelete="CASCADE"), index=True, nullable=False)
    viewer_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    story = relationship("Story", back_populates="views")
    viewer = relationship("User", back_populates="story_views")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token = Column(String(512), unique=True, index=True, nullable=False)
    device_info = Column(String(255), nullable=True)
    device_id = Column(String(255), nullable=True)
    fcm_token = Column(String(512), nullable=True)
    ip_address = Column(String(50), nullable=True)
    is_revoked = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="sessions")


class Theme(Base):
    __tablename__ = "themes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(50), unique=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    config = Column(Text, nullable=False) # JSON Configuration string
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    ip_address = Column(String(50), nullable=True)
    device_info = Column(String(255), nullable=True)
    previous_hash = Column(String(64), nullable=True)
    current_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        # Composite index for activity feed queries: ORDER BY created_at DESC WHERE user_id IN (...)
        Index("ix_audit_logs_user_created", "user_id", "created_at"),
    )


class Report(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    reporter_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reported_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(20), default="pending")  # pending, resolved, dismissed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    reporter = relationship("User", foreign_keys=[reporter_id])
    reported = relationship("User", foreign_keys=[reported_id])


class GameSession(Base):
    __tablename__ = "game_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    chat_id = Column(String(36), ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    game_type = Column(String(50), nullable=False)
    status = Column(String(20), default="pending")
    board_state = Column(Text, nullable=True)
    player1_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    player2_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    turn_player_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    winner_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class GameLeaderboard(Base):
    __tablename__ = "game_leaderboards"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    draws = Column(Integer, default=0)
    game_type = Column(String(50), nullable=False)


class LoveCalculation(Base):
    __tablename__ = "love_calculations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user1_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user2_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    percentage = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Anniversary(Base):
    __tablename__ = "anniversaries"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    partner_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    anniversary_date = Column(Date, nullable=False)
    reminder_days_before = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class RelationshipMemory(Base):
    __tablename__ = "relationship_memories"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    partner_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    file_url = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    is_encrypted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    event_type = Column(String(50), nullable=False)
    start_time = Column(DateTime, nullable=False)
    reminder_minutes_before = Column(Integer, default=60)
    is_notified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


note_collaborators = Table(
    "note_collaborators",
    Base.metadata,
    Column("note_id", String(36), ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
)


class Note(Base):
    __tablename__ = "notes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    note_type = Column(String(20), default="personal")
    owner_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_encrypted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    collaborators = relationship("User", secondary=note_collaborators)


class DailyGoal(Base):
    __tablename__ = "daily_goals"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    is_completed = Column(Boolean, default=False)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Habit(Base):
    __tablename__ = "habits"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    streak = Column(Integer, default=0)
    max_streak = Column(Integer, default=0)
    last_done_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class CloudFile(Base):
    __tablename__ = "cloud_files"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_url = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_type = Column(String(50), nullable=False)
    is_encrypted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class EventLog(Base):
    __tablename__ = "event_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    event_type = Column(String(100), nullable=False)
    payload = Column(Text, nullable=True) # JSON string
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ChatSequence(Base):
    __tablename__ = "chat_sequences"

    chat_id = Column(String(36), ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True)
    last_sequence = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    chat = relationship("Chat")

