from pydantic import BaseModel
from typing import Optional


class Token(BaseModel):
    access_token: str
    token_type: str
    refresh_token: Optional[str] = None
    user_id: Optional[int] = None


class TokenData(BaseModel):
    username: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class AppleAuthRequest(BaseModel):
    identity_token: str
    authorization_code: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class GoogleAuthRequest(BaseModel):
    id_token: str
