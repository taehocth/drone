import google.generativeai as genai
from app.core.config import settings

# API 키 확인
if not settings.GEMINI_API_KEY:
    raise ValueError(
        "GEMINI_API_KEY가 설정되지 않았습니다. "
        ".env 파일에 GEMINI_API_KEY를 추가해주세요."
    )

genai.configure(api_key=settings.GEMINI_API_KEY)

# 사용 가능한 모델 목록 확인 함수
def get_available_model():
    """사용 가능한 Gemini 모델을 찾아 반환"""
    try:
        models = genai.list_models()
        available_names = []
        for m in models:
            if 'generateContent' in m.supported_generation_methods:
                # 모델 이름에서 짧은 이름 추출 (예: "models/gemini-pro" -> "gemini-pro")
                short_name = m.name.split('/')[-1] if '/' in m.name else m.name
                available_names.append(short_name)
                print(f"  - {short_name} (전체: {m.name})")
        
        print(f"📋 사용 가능한 모델 목록: {available_names}")
        
        # 우선순위에 따라 모델 선택
        preferred_models = [
            "gemini-1.5-flash",
            "gemini-1.5-pro", 
            "gemini-pro",
            "gemini-1.0-pro"
        ]
        
        for preferred in preferred_models:
            if preferred in available_names:
                print(f"✅ 선택된 모델: {preferred}")
                return preferred
        
        # 사용 가능한 첫 번째 모델 사용
        if available_names:
            selected = available_names[0]
            print(f"⚠️ 기본 모델 사용: {selected}")
            return selected
        
        # 기본값
        print("⚠️ 모델 목록이 비어있음. gemini-pro 시도")
        return "gemini-pro"
        
    except Exception as e:
        print(f"⚠️ 모델 목록 조회 실패: {e}")
        print("⚠️ 기본 모델 gemini-pro 사용")
        return "gemini-pro"

# 모델 초기화
try:
    model_name = get_available_model()
    model = genai.GenerativeModel(model_name)
    print(f"✅ Gemini 모델 초기화 완료: {model_name}")
except Exception as e:
    print(f"❌ 모델 초기화 실패: {e}")
    # 폴백: gemini-pro 시도
    try:
        model = genai.GenerativeModel("gemini-pro")
        print("✅ 폴백 모델 gemini-pro 사용")
    except Exception as fallback_error:
        print(f"❌ 폴백 모델도 실패: {fallback_error}")
        raise
