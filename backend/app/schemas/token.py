from pydantic import BaseModel
from typing import Optional

class Token(BaseModel):
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    two_fa_session_id: Optional[str] = None

class TokenData(BaseModel):
    user_id: Optional[str] = None
