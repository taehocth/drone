# backend/app/api/api_v1/endpoints/qgc_ws_proxy.py

import asyncio
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import websockets

router = APIRouter()

# 네이버클라우드 텔레메트리 WS (Render 서버가 붙을 업스트림)
# 예: ws://211.188.48.144:8000/api/v1/qgc/ws/qgc
UPSTREAM_WS = os.getenv("TELEMETRY_UPSTREAM_WS", "").strip()


@router.websocket("/qgc-proxy")
async def qgc_ws_proxy(ws: WebSocket):
    """
    브라우저 <-> Render(여기) <-> NaverCloud(업스트림) WebSocket 프록시
    """
    if not UPSTREAM_WS:
        # 환경변수 설정이 안 됐으면 명확히 실패
        await ws.close(code=1011)
        return

    await ws.accept()

    upstream = None
    try:
        # Render -> NaverCloud 업스트림 WS 연결
        upstream = await websockets.connect(
            UPSTREAM_WS,
            ping_interval=20,   # keepalive
            ping_timeout=20,
            close_timeout=5,
            max_size=2**20,     # 1MB (필요시 조정)
        )

        async def client_to_upstream():
            # 브라우저 -> 업스트림
            while True:
                msg = await ws.receive_text()
                await upstream.send(msg)

        async def upstream_to_client():
            # 업스트림 -> 브라우저
            async for msg in upstream:
                # msg는 str(텍스트) 또는 bytes일 수 있음
                if isinstance(msg, (bytes, bytearray)):
                    await ws.send_bytes(msg)
                else:
                    await ws.send_text(msg)

        # 양방향 중계 동시 실행
        t1 = asyncio.create_task(client_to_upstream())
        t2 = asyncio.create_task(upstream_to_client())

        done, pending = await asyncio.wait(
            {t1, t2},
            return_when=asyncio.FIRST_COMPLETED,
        )

        # 하나라도 끝나면 나머지 종료
        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        # 브라우저가 끊은 경우
        pass
    except Exception:
        # 업스트림 실패 등
        try:
            await ws.close(code=1011)
        except Exception:
            pass
    finally:
        if upstream:
            try:
                await upstream.close()
            except Exception:
                pass