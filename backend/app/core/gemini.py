from google import genai
from app.core.config import settings

# API 키 확인
if not settings.GEMINI_API_KEY:
    raise ValueError(
        "GEMINI_API_KEY가 설정되지 않았습니다. "
        ".env 파일 또는 Render Environment에 GEMINI_API_KEY를 추가해주세요."
    )

# 사용할 Gemini 모델
MODEL_NAME = settings.GEMINI_MODEL_NAME or "gemini-2.5-flash"

# Gemini Client 생성
client = genai.Client(api_key=settings.GEMINI_API_KEY)

print("✅ Gemini client initialized")
print(f"✅ Gemini model: {MODEL_NAME}")