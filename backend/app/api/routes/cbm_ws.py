from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.cbm.collector import get_latest_telemetry
from app.cbm.evaluator import evaluate_cbm_state
import asyncio
import json

router = APIRouter()

@router.websocket("/ws/cbm")
async def cbm_ws(websocket: WebSocket):
    """CBM 실시간 상태 WebSocket 엔드포인트"""
    await websocket.accept()
    print("📡 CBM WebSocket 연결 시작")

    try:
        while True:
            try:
                data = get_latest_telemetry()
                results = evaluate_cbm_state(data)
                payload = {
                    "timestamp": str(data.timestamp),
                    "systems": results,
                }

                # ✅ 연결이 여전히 열려 있는지 확인
                if websocket.application_state.value != 1:  # 1 = CONNECTED
                    print("⚠️ CBM 클라이언트 연결 끊김 감지 → 루프 종료")
                    break

                await websocket.send_text(json.dumps(payload, ensure_ascii=False))
                print(f"📤 CBM 데이터 전송 → {len(results)}개 항목")

            except WebSocketDisconnect:
                print("❌ CBM WebSocket 연결 종료됨 (클라이언트 측)")
                break
            except Exception as loop_err:
                print(f"⚠️ CBM 내부 루프 오류: {loop_err}")
                await asyncio.sleep(1)
                continue

            await asyncio.sleep(2.0)

    except Exception as e:
        print(f"💥 CBM WebSocket 전체 오류: {e}")

    finally:
        if websocket.application_state.value == 1:
            await websocket.close()
        print("🧹 CBM WebSocket 정리 완료")
