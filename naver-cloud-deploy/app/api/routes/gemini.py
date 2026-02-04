from fastapi import APIRouter, HTTPException
from app.core.gemini import model
import asyncio

router = APIRouter()

@router.post("/cbm/ai-summary")
async def cbm_ai_summary(request: dict):
    try:
        data = request.get("data", request)  # 하위 호환성
        level = request.get("level", "normal")  # beginner, normal, expert
        
        # 설명 레벨에 따른 프롬프트 조정
        level_instructions = {
            "beginner": """초보자용 설명:
- 전문 용어를 완전히 피하고 일상 언어로 설명
- 모든 기술적 개념을 쉽게 비유로 설명
- 단계별로 차근차근 설명
- 8-10문장으로 충분히 상세하게 설명
- 각 시스템(배터리, ESC, GPS 등)의 상태를 개별적으로 설명
- 문제가 있다면 왜 문제인지, 어떻게 해결할 수 있는지 포함""",
            "normal": """일반 사용자용 설명:
- 6-8문장으로 상세하게 요약
- 전문 용어는 최소화하되 필요시 간단히 설명
- 중요한 문제나 경고사항이 있으면 강조
- 각 주요 시스템(배터리, ESC, GPS, 비행 성능)의 상태를 포함
- 개선이 필요한 부분이 있다면 구체적으로 언급""",
            "expert": """전문가용 설명:
- 기술적 용어와 수치를 정확하게 사용
- 상세한 분석과 원인 설명
- 전문적인 관점에서의 평가
- 5-7문장으로 간결하지만 포괄적으로
- 각 시스템의 수치와 임계값 비교
- 문제의 근본 원인과 해결 방안 제시"""
        }
        
        level_instruction = level_instructions.get(level, level_instructions["normal"])
        
        # 비동기로 실행하여 블로킹 방지
        prompt = f"""아래 드론 비행 로그 분석 결과를 상세하게 분석하고 요약해주세요.

{level_instruction}

다음 항목들을 포함해서 설명해주세요:
1. 전체 비행 성능 평가 (비행 시간, 고도, 속도 등)
2. 배터리 시스템 상태 (전압, 전류, 온도, 소모율 등)
3. ESC(전자속도제어기) 상태 (출력, 온도, 불균형 등)
4. GPS/위성 항법 시스템 상태
5. 비행 안정성 및 주의사항
6. 개선이 필요한 부분 (있다면)

분석 데이터:
{data}

상세 분석:"""
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


@router.post("/cbm/ask-question")
async def ask_question(request: dict):
    """추가 질문에 대한 답변"""
    try:
        analysis_data = request.get("analysisData", {})
        question = request.get("question", "")
        level = request.get("level", "normal")
        history = request.get("history", [])
        
        if not question:
            raise HTTPException(status_code=400, detail="질문이 필요합니다")
        
        # 설명 레벨에 따른 지시사항
        level_instructions = {
            "beginner": "초보자가 이해하기 쉽게 일상 언어로 설명해주세요.",
            "normal": "일반 사용자가 이해할 수 있게 설명해주세요.",
            "expert": "전문가 수준의 상세하고 기술적인 설명을 해주세요."
        }
        
        level_instruction = level_instructions.get(level, level_instructions["normal"])
        
        # 대화 히스토리 포함 프롬프트 구성
        history_text = ""
        if history:
            history_text = "\n\n이전 대화:\n"
            for msg in history[-3:]:  # 최근 3개만 포함
                role = "사용자" if msg.get("role") == "user" else "AI"
                history_text += f"{role}: {msg.get('content', '')}\n"
        
        prompt = f"""드론 비행 로그 분석 결과에 대한 질문에 답변해주세요.

{level_instruction}

분석 데이터:
{analysis_data}
{history_text}

사용자 질문: {question}

답변:"""
        
        result = await asyncio.to_thread(
            model.generate_content,
            prompt
        )
        
        # 응답 텍스트 추출
        answer_text = None
        if hasattr(result, 'text') and result.text:
            answer_text = result.text
        elif hasattr(result, 'candidates') and result.candidates:
            candidate = result.candidates[0]
            if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                if candidate.content.parts and len(candidate.content.parts) > 0:
                    answer_text = candidate.content.parts[0].text
        elif hasattr(result, 'response'):
            if hasattr(result.response, 'text'):
                answer_text = result.response.text
        
        if not answer_text:
            raise HTTPException(
                status_code=500,
                detail="Gemini API 응답에서 텍스트를 추출할 수 없습니다"
            )
        
        return {"answer": answer_text}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 질문 처리 오류: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"질문 처리 오류: {str(e)}"
        )
