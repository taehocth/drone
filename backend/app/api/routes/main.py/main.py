from fastapi import APIRouter, FastAPI
from app.api.routes import items, login, private, users, utils, checklist
from app.core.config import settings

# FastAPI 앱 생성
app = FastAPI(title=settings.PROJECT_NAME)

# 체크리스트 라우트 등록 (/api/v1/checklists/...)
app.include_router(checklist.router, prefix="/api/v1/checklists", tags=["checklists"])

# 공통 API 라우터
api_router = APIRouter()

# 로그인 / 인증 라우트 (/api/v1/auth/...)
api_router.include_router(login.router, prefix="/auth", tags=["auth"])

# 사용자 라우트 (/api/v1/users/...)
api_router.include_router(users.router, prefix="/users", tags=["users"])

# 유틸리티 라우트 (/api/v1/utils/...)
api_router.include_router(utils.router, prefix="/utils", tags=["utils"])

# 아이템 라우트 (/api/v1/items/...)
api_router.include_router(items.router, prefix="/items", tags=["items"])

# 개발 환경에서만 private 라우트 (/api/v1/private/...)
if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router, prefix="/private", tags=["private"])

# 최종적으로 /api/v1 하위에 모든 라우트 묶기
app.include_router(api_router, prefix=settings.API_V1_STR)
