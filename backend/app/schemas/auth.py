from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional

class LoginRequest(BaseModel):
    username_or_email: str
    password: str
    remember_me: bool = False

class OTPRequest(BaseModel):
    email: EmailStr
    purpose: str = Field(..., pattern=r"^(registration|password_reset)$")

class OTPVerify(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    purpose: str = Field(..., pattern=r"^(registration|password_reset)$")

class PasswordReset(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(..., min_length=6, max_length=100)
    confirm_password: str = Field(..., min_length=6, max_length=100)

    @model_validator(mode="after")
    def passwords_match(self) -> 'PasswordReset':
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


from datetime import datetime

class UserSessionResponse(BaseModel):
    id: str
    user_id: str
    device_info: Optional[str] = None
    ip_address: Optional[str] = None
    is_revoked: bool
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True
