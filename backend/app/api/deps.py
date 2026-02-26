from collections.abc import Generator
from typing import Annotated

import jwt
import ipaddress
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.models import TokenPayload, User

# -----------------------------------------------------
# OAuth2
# -----------------------------------------------------
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)

# -----------------------------------------------------
# DB Session
# -----------------------------------------------------
def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session

SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]

# -----------------------------------------------------
# Current User
# -----------------------------------------------------
def get_current_user(session: SessionDep, token: TokenDep) -> User:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[security.ALGORITHM],
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )

    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    return user

CurrentUser = Annotated[User, Depends(get_current_user)]

# -----------------------------------------------------
# Superuser Only
# -----------------------------------------------------
def get_current_active_superuser(
    current_user: CurrentUser,
) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="The user doesn't have enough privileges",
        )
    return current_user

# =====================================================
# 🔒 사내 IP 제한 (직원만)
# =====================================================

# ⚠️ 실제 회사 IP 대역으로 반드시 수정
INTERNAL_NETWORKS = [
    ipaddress.ip_network("192.168.50.0/24"),
]

def get_client_ip(request: Request) -> str:
    """
    Reverse Proxy(Traefik/Nginx) 환경 고려
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host

def is_internal_ip(ip: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip)
        return any(ip_obj in net for net in INTERNAL_NETWORKS)
    except ValueError:
        return False

def internal_only_for_staff(
    request: Request,
    current_user: CurrentUser,
) -> None:
    """
    ✅ 슈퍼유저(개발자): 어디서든 접근 가능
    ❌ 일반 직원: 사내 Wi-Fi(IP)에서만 접근 가능
    """
    client_ip = get_client_ip(request)

    # 개발자 / 관리자 → 항상 허용
    if current_user.is_superuser:
        return

    # 직원 → 사내 IP만 허용
    if not is_internal_ip(client_ip):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="사내 네트워크에서만 접근 가능합니다.",
        )
