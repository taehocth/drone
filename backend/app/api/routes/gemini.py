from fastapi import APIRouter, HTTPException
from app.core.gemini import model
import asyncio

router = APIRouter()

@router.post("/cbm/ai-summary")
async def cbm_ai_summary(data: dict):
    try:
        # 비동기로 실행하여 블로킹 방지
        prompt = f"아래 CBM 분석 결과를 사람이 이해하기 쉽게 요약해줘:\n{data}"
        result = await asyncio.to_thread(
            model.generate_content,
            prompt
        )
        
        # 응답 텍스트 추출 (여러 방법 시도)
        summary_text = None
        
        # 방법 1: text 속성 확인
        if hasattr(result, 'text') and result.text:
            summary_text = result.text
        # 방법 2: candidates 확인
        elif hasattr(result, 'candidates') and result.candidates:
            candidate = result.candidates[0]
            if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                if candidate.content.parts and len(candidate.content.parts) > 0:
                    summary_text = candidate.content.parts[0].text
        # 방법 3: 직접 접근
        elif hasattr(result, 'response'):
            if hasattr(result.response, 'text'):
                summary_text = result.response.text
        
        if not summary_text:
            # 디버깅을 위한 로그
            print(f"⚠️ Gemini 응답 형식 확인 필요: {type(result)}")
            print(f"⚠️ result 속성: {dir(result)}")
            raise HTTPException(
                status_code=500, 
                detail="Gemini API 응답에서 텍스트를 추출할 수 없습니다"
            )
        
        return {"summary": summary_text}
                
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Gemini API 오류: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Gemini API 오류: {str(e)}"
        )
