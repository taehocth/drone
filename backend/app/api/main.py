from fastapi import FastAPI, APIRouter
from app.api.routes import items, login, private, users, utils, checklist
from app.core.config import settings

app = FastAPI()

# 하나의 router 묶음
api_router = APIRouter()

api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(
    checklist.router, prefix="/checklists", tags=["checklists"]
)

if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)

# 최종 등록: 모든 라우트는 /api/v1/* 로 접속 가능
app.include_router(api_router, prefix="/api/v1")

