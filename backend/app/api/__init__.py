from fastapi import APIRouter
from app.api.routes import (
    items,
    login,
    private,
    users,
    utils,
    checklist,
    weather,
    qgc_ws,
    # telemetry_ws,   # ❌ QGC 경로 충돌 방지로 비활성화
    naver_directions,
    naver_places,
    news,
    logs,
    logs_upload,
    cbm_ws,
    logs_convert,
    gemini,
)
from app.core.config import settings

api_router = APIRouter()

# ------------------------------------
# 인증 / 사용자
# ------------------------------------
api_router.include_router(login.router, prefix="/login", tags=["login"])
api_router.include_router(users.router, prefix="/users", tags=["users"])

# ------------------------------------
# 공용 유틸
# ------------------------------------
api_router.include_router(utils.router, prefix="/utils", tags=["utils"])

# ------------------------------------
# 체크리스트
# ------------------------------------
api_router.include_router(
    checklist.router,
    prefix="/checklists",
    tags=["checklists"]
)

# ------------------------------------
# 날씨
# ------------------------------------
api_router.include_router(weather.router, prefix="/weather", tags=["weather"])

# ------------------------------------
# 🔴 QGC 실시간 텔레메트리 (단일 진입점)
# ------------------------------------
api_router.include_router(
    qgc_ws.router,
    prefix="/qgc",
    tags=["qgc"]
)

# ------------------------------------
# Naver API
# ------------------------------------
api_router.include_router(
    naver_directions.router,
    prefix="/naver",
    tags=["naver"]
)
api_router.include_router(
    naver_places.router,
    prefix="/naver",
    tags=["naver"]
)

# ------------------------------------
# 뉴스
# ------------------------------------
api_router.include_router(news.router, prefix="/news", tags=["news"])

# ------------------------------------
# 로그 / 분석
# ------------------------------------
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])
api_router.include_router(
    logs_upload.router,
    prefix="/logs",
    tags=["logs-upload"]
)
api_router.include_router(
    logs_convert.router,
    prefix="/logs",
    tags=["convert"]
)

# ------------------------------------
# CBM WebSocket
# ------------------------------------
api_router.include_router(
    cbm_ws.router,
    prefix="/cbm",
    tags=["cbm"]
)

# ------------------------------------
# 개발 전용
# ------------------------------------
if settings.ENVIRONMENT == "local":
    api_router.include_router(
        private.router,
        prefix="/private",
        tags=["private"]
    )

# ------------------------------------
# Gemini AI
# ------------------------------------
api_router.include_router(
    gemini.router,
    prefix="/gemini",
    tags=["gemini"]
)
