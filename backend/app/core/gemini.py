import google.generativeai as genai
from app.core.config import settings

# 기본 폴백 모델
DEFAULT_MODEL_NAME = "gemini-1.5-flash"
MODEL_NAME = DEFAULT_MODEL_NAME

# API 키 확인
if not settings.GEMINI_API_KEY:
    raise ValueError(
        "GEMINI_API_KEY가 설정되지 않았습니다. "
        ".env 파일에 GEMINI_API_KEY를 추가해주세요."
    )

genai.configure(api_key=settings.GEMINI_API_KEY)


def get_available_model() -> str:
    """사용 가능한 Gemini 모델을 찾아 반환"""
    try:
        models = genai.list_models()
        available_names: list[str] = []

        for m in models:
            methods = getattr(m, "supported_generation_methods", []) or []
            if "generateContent" in methods:
                short_name = m.name.split("/")[-1] if "/" in m.name else m.name
                available_names.append(short_name)
                print(f"  - {short_name} (전체: {m.name})")

        print(f"📋 사용 가능한 모델 목록: {available_names}")

        # 우선순위에 따라 모델 선택
        preferred_models = [
            "gemini-1.5-flash",
            "gemini-1.5-pro",
        ]

        for preferred in preferred_models:
            if preferred in available_names:
                print(f"✅ 선택된 모델: {preferred}")
                return preferred

        # 사용 가능한 첫 번째 모델 사용
        if available_names:
            selected = available_names[0]
            print(f"⚠️ 우선순위 모델 없음. 첫 번째 사용 가능 모델 사용: {selected}")
            return selected

        # 모델 목록이 비어 있으면 기본값 사용
        print(f"⚠️ 모델 목록이 비어있음. 기본 모델 {DEFAULT_MODEL_NAME} 사용")
        return DEFAULT_MODEL_NAME

    except Exception as e:
        print(f"⚠️ 모델 목록 조회 실패: {e}")
        print(f"⚠️ 기본 모델 {DEFAULT_MODEL_NAME} 사용")
        return DEFAULT_MODEL_NAME


# 모델 초기화
try:
    MODEL_NAME = get_available_model()
    model = genai.GenerativeModel(MODEL_NAME)
    print(f"✅ Gemini 모델 초기화 완료: {MODEL_NAME}")
    print(f"✅ google.generativeai version: {getattr(genai, '__version__', 'unknown')}")
except Exception as e:
    print(f"❌ 모델 초기화 실패: {e}")

    # 최종 폴백
    try:
        MODEL_NAME = DEFAULT_MODEL_NAME
        model = genai.GenerativeModel(MODEL_NAME)
        print(f"✅ 폴백 모델 사용: {MODEL_NAME}")
    except Exception as fallback_error:
        print(f"❌ 폴백 모델도 실패: {fallback_error}")
        raise