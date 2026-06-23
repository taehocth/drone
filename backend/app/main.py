from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.api.routes import cbm, vehicles   # ✅ vehicles 추가
from app.core.config import settings
from app.mavlink.manager import start_mavlink_background  # ✅ MAVLink 백그라운드

app = FastAPI(title=settings.PROJECT_NAME)

# ----------------------
# CORS 설정
# ----------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://drone-6-fabz.onrender.com",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------
# 서버 시작 시 실행
# (QGC LinkManager 역할)
# ----------------------
@app.on_event("startup")
async def on_startup():
    # MAVLink 자동 탐색 + SYSID 라우팅 시작
    start_mavlink_background()

    # 디버깅: 등록된 라우트 출력
    for route in app.routes:
        print("등록된 엔드포인트:", route.path, getattr(route, "methods", "WS"))

# ----------------------
# 루트 엔드포인트
# ----------------------
@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "message": "Backend is running",
    }

# ----------------------
# 모든 v1 API 등록
# (login, users, items, checklist 등)
# ----------------------
app.include_router(api_router, prefix=settings.API_V1_STR)

# ----------------------
# QGC Vehicle API
# /api/v1/vehicles
# ----------------------
app.include_router(
    vehicles.router,
    prefix=settings.API_V1_STR,
    tags=["vehicles"],
)

# ----------------------
# CBM WebSocket 전용 라우터
# ----------------------
app.include_router(
    cbm.router,
    prefix=settings.API_V1_STR,
    tags=["cbm"],
)

# ----------------------
# 헬스체크
# ----------------------
@app.get("/health")
async def health():
    return {"status": "ok"}
