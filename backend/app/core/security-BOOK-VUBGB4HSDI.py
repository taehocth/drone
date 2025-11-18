from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__default_rounds=4)


ALGORITHM = "HS256"


def create_access_token(subject: str | Any, expires_delta: timedelta) -> str:
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    # bcrypt는 72바이트로 제한되므로 UTF-8 인코딩 기준으로 잘라냅니다
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > 72:
        # UTF-8 바이트를 문자열로 다시 변환할 때 깨질 수 있으므로 안전하게 처리
        password = password_bytes[:72].decode('utf-8', errors='ignore')
    return pwd_context.hash(password)
