from pydantic import BaseModel
from sqlmodel import SQLModel, Field
from typing import Optional

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None

class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)
