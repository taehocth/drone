from fastapi import APIRouter
from app.api.routes import items, login, private, users, utils, checklist, weather, qgc_ws
from app.core.config import settings

# 최종 API Router
api_router = APIRouter()

# 인증 라우터
api_router.include_router(login.router, prefix="/auth", tags=["auth"])

# 사용자 라우터
api_router.include_router(users.router, prefix="/users", tags=["users"])

# 유틸리티 라우터
api_router.include_router(utils.router, prefix="/utils", tags=["utils"])

# 아이템 라우터
api_router.include_router(items.router, prefix="/items", tags=["items"])

# 체크리스트 라우터
api_router.include_router(checklist.router, prefix="/checklists", tags=["checklists"])

# 날씨 라우터
api_router.include_router(weather.router, prefix="/weather", tags=["weather"])

# QGC WebSocket 라우터
api_router.include_router(qgc_ws.router, prefix="/qgc", tags=["qgc"])

# 개발 환경 전용 private 라우터
if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router, prefix="/private", tags=["private"])
