from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional
from datetime import date, datetime

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    email: EmailStr
    phone: Optional[str] = None

class UserCreate(UserBase):
    full_name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)
    confirm_password: str = Field(..., min_length=6, max_length=100)
    dob: Optional[date] = None
    gender: Optional[str] = None
    country: Optional[str] = None
    bio: Optional[str] = None

    @model_validator(mode="after")
    def passwords_match(self) -> 'UserCreate':
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=100)
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[str] = None
    country: Optional[str] = None
    theme_preference: Optional[str] = None
    presence_status: Optional[str] = None
    public_key: Optional[str] = None

class ProfileResponse(BaseModel):
    user_id: str
    full_name: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[str] = None
    country: Optional[str] = None
    theme_preference: str
    presence_status: str
    last_seen: Optional[datetime] = None
    public_key: Optional[str] = None

    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    phone: Optional[str] = None
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True

class UserProfileResponse(BaseModel):
    id: str
    username: str
    email: str
    phone: Optional[str] = None
    is_verified: bool
    created_at: datetime
    profile: Optional[ProfileResponse] = None

    class Config:
        from_attributes = True

class DiscoverUserResponse(UserProfileResponse):
    relationship_status: str = "none"  # none, pending_sent, pending_received, friends
    request_id: Optional[str] = None


from pydantic import EmailStr

class ChangeEmailRequest(BaseModel):
    new_email: EmailStr

class ChangeEmailVerify(BaseModel):
    new_email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")

class ChangePhoneRequest(BaseModel):
    new_phone: str = Field(..., min_length=1, max_length=20)

class ChangePhoneVerify(BaseModel):
    new_phone: str
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class UserReportCreate(BaseModel):
    reported_id: str
    reason: str = Field(..., min_length=1, max_length=1000)


class UserReportResponse(BaseModel):
    id: str
    reporter_id: str
    reported_id: str
    reason: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class KeyBackupUpload(BaseModel):
    ciphertext: str = Field(..., description="Encrypted private key ciphertext")


class KeyBackupResponse(BaseModel):
    ciphertext: Optional[str] = None
    status: str


class RecoveryPhraseResponse(BaseModel):
    recovery_phrase: str


