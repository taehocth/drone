"""
replay_jev.py — 과거 비행 CSV(42컬럼)를 1초씩 서버에 재생하며 알람과 Jev 판단을 기록·채점

동작:
  1. /cbm/reset/{drone_id} 로 세션 초기화
  2. /cbm/ws/cbm?drone_id=... WebSocket 을 열어 두고 (서버 샘플링은 WS 루프 안에서 돌기 때문에 필수)
  3. CSV 행을 1초 간격으로 /qgc/telemetry/push 에 보냄 (학습 데이터 1Hz 와 동일)
  4. WS 로 받은 페이로드(알람, advisor, failsafe)를 행 번호와 함께 JSONL 로 저장
  5. 끝나면 요약 출력: 첫 알람 행, 알람 피처, advisor 권고 분포, 고장 시작 전/후 비교

API 키 없이 돌리면 advisor 는 disabled 로 기록되고, 알람·임계값 확인용으로 쓸 수 있다.
키를 넣고 같은 스크립트를 다시 돌리면 Jev 검증이 된다.

실행 예:
    # 로컬 백엔드 (uvicorn ... --port 8000)
    python replay_jev.py --server http://localhost:8000 \
        --file accident_log/04_00_08.csv --label accident --fault-start 800
    python replay_jev.py --server http://localhost:8000 \
        --file csv_output/DM4_1/log_001.csv --label normal

    # Render 서버
    python replay_jev.py --server https://drone-5-2qlc.onrender.com --file ... --label ...

옵션:
    --rows 700:965   특정 행 구간만 재생 (사고 직전부터)
    --drone-id       기본 drone-001 (inference.DRONE_MODEL_MAP 에 있는 ID 여야 CNN-LSTM 이 돈다)
    --out            결과 JSONL 경로 (기본 replay_results/<label>_<파일명>.jsonl)

필요 패키지: requests, websockets  (pip install websockets)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime

import pandas as pd
import requests

try:
    import websockets
except ImportError:
    print("pip install websockets 가 필요합니다")
    sys.exit(1)

API_PREFIX = "/api/v1"


# ════════════════════════════════════════════════════════
# 42컬럼 행 → 텔레메트리 push payload
# ════════════════════════════════════════════════════════
def row_to_payload(row, drone_id: str) -> dict:
    f = lambda i: float(row[i])
    payload = {
        "drone_id": drone_id,
        "sysid": 1,
        "lte_ip": "replay",
        "battery": {"voltage": f(0), "current": f(1), "remaining": 80},
        "position": {"lat": f(2), "lon": f(3), "alt": f(4)},
        "att_target": {"yaw": f(5), "pitch": f(6), "roll": f(7),
                       "body_roll_rate": 0.0, "body_pitch_rate": 0.0, "body_yaw_rate": 0.0},
        "attitude": {"yaw": f(8), "pitch": f(9), "roll": f(10)},
        "ekf_bias": {"velocity_variance": f(11), "pos_horiz_variance": f(12),
                     "pos_vert_variance": f(13), "compass_variance": f(14),
                     "terrain_alt_variance": f(15), "flags": f(16)},
        "raw_imu": {"gyro_x": f(17), "gyro_y": f(18), "gyro_z": f(19),
                    "accel_x": f(20), "accel_y": f(21), "accel_z": f(22)},
        "servo_output": {"pwm1": f(23), "pwm2": f(24), "pwm3": f(25), "pwm4": f(26)},
        "gps": {"fix_type": 3, "satellites": 12},
    }
    # v3 컬럼 37/38 = PX4 진동 메트릭. 서버(manager.py)가 'vibration' 키를 저장해야 AI 피처로 들어간다.
    if len(row) >= 39:
        payload["vibration"] = {"accel_metric": f(37), "gyro_metric": f(38)}
    return payload


# ════════════════════════════════════════════════════════
# WebSocket 수신 (백그라운드)
# ════════════════════════════════════════════════════════
class WsListener:
    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self.latest: dict | None = None
        self.count = 0
        self._task: asyncio.Task | None = None
        self._stop = False

    async def _run(self):
        while not self._stop:
            try:
                async with websockets.connect(self.ws_url, ping_interval=20, max_size=4_000_000,
                                              open_timeout=15) as ws:
                    print(f"✅ WS 연결: {self.ws_url}")
                    while not self._stop:
                        try:
                            msg = await asyncio.wait_for(ws.recv(), timeout=5)
                        except asyncio.TimeoutError:
                            continue
                        self.latest = json.loads(msg)
                        self.count += 1
            except asyncio.CancelledError:
                raise
            except Exception as e:
                if self._stop:
                    break
                print(f"⚠️ WS 연결 실패/끊김: {type(e).__name__}: {e} → 3초 후 재연결")
                await asyncio.sleep(3)

    def start(self):
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._stop = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass


# ════════════════════════════════════════════════════════
# 재생 루프
# ════════════════════════════════════════════════════════
async def replay(args):
    base = args.server.rstrip("/")
    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")
    push_url = f"{base}{API_PREFIX}/qgc/telemetry/push"
    reset_url = f"{base}{API_PREFIX}/cbm/reset/{args.drone_id}"
    ws_url = f"{ws_base}{API_PREFIX}/cbm/ws/cbm?drone_id={args.drone_id}"

    df = pd.read_csv(args.file, header=None)
    print(f"데이터: {args.file} ({len(df)}행 × {df.shape[1]}열)")
    if df.shape[1] < 27:
        print("❌ 27컬럼 미만 — 형식 확인 필요")
        return
    if df.shape[1] < 39:
        print("⚠️ 42컬럼이 아님 — 진동 메트릭 없이 재생 (accel/gyro_vib 결측 처리됨)")

    start, end = 0, len(df)
    if args.rows:
        a, b = args.rows.split(":")
        start, end = int(a or 0), int(b or len(df))
    rows = list(range(start, min(end, len(df))))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    out_f = open(args.out, "w", encoding="utf-8")
    print(f"기록: {args.out}")

    # 0. 서버 깨우기 (Render 무료 플랜은 유휴 시 잠들어 첫 응답에 30~60초 걸림)
    status_url = f"{base}{API_PREFIX}/cbm/status"
    print("서버 응답 확인 중 (잠들어 있으면 최대 2분 대기)...")
    awake = False
    for attempt in range(12):
        try:
            r = requests.get(status_url, timeout=15)
            if r.status_code == 200:
                awake = True
                print(f"✅ 서버 응답 (model_ready={r.json().get('model_ready')}, "
                      f"advisor_enabled={r.json().get('advisor_enabled')})")
                break
        except Exception:
            pass
        print(f"  ... 대기 중 ({(attempt + 1) * 10}초)")
        await asyncio.sleep(10)
    if not awake:
        print("❌ 서버가 응답하지 않습니다. 주소를 확인하거나 잠시 후 다시 실행하세요.")
        out_f.close()
        return

    # 1. 세션 초기화
    try:
        r = requests.post(reset_url, timeout=15)
        print(f"세션 초기화: HTTP {r.status_code}")
    except Exception as e:
        print(f"⚠️ 세션 초기화 실패: {e}")

    # 2. WS 열기 — 첫 페이로드가 올 때까지 대기 (서버 샘플링은 WS 연결 중에만 돈다)
    listener = WsListener(ws_url)
    listener.start()
    for _ in range(20):
        await asyncio.sleep(1)
        if listener.latest is not None:
            break
    if listener.latest is None:
        print("❌ WS 로 20초 동안 데이터가 오지 않습니다. WS 주소/서버 상태를 확인하세요.")
        await listener.stop()
        out_f.close()
        return

    # 3. 1초 간격 push
    records = []
    warned_vib = False
    t0 = time.monotonic()
    print(f"재생 시작: {len(rows)}행, 약 {len(rows)/60:.1f}분 소요\n")

    for n, i in enumerate(rows):
        tick = t0 + n * 1.0
        try:
            requests.post(push_url, json=row_to_payload(df.iloc[i], args.drone_id), timeout=5)
        except Exception as e:
            print(f"  [{i}] push 실패: {e}")

        # 서버 샘플링(1초) 이후 결과를 받기 위해 다음 틱 직전까지 대기
        await asyncio.sleep(max(0.0, tick + 0.9 - time.monotonic()))

        p = listener.latest or {}
        adv = p.get("advisor") or {}
        alerts = p.get("systems") or []
        rec = {
            "row": i,
            "t_sec": n,
            "ts": datetime.now().isoformat(timespec="seconds"),
            "window_size": p.get("window_size"),
            "has_alert": p.get("has_alert", False),
            "alert_features": [a.get("feature") for a in alerts],
            "alert_methods": [a.get("method") for a in alerts],
            "failsafe_level": (p.get("failsafe") or {}).get("level"),
            "missing_features": p.get("missing_features"),
            "advisor_status": adv.get("status"),
            "advisor_action": adv.get("action"),
            "advisor_probs": adv.get("action_probs"),
            "advisor_confidence": adv.get("confidence"),
            "advisor_uncertain": adv.get("uncertain"),
            "advisor_severity": adv.get("severity"),
            "advisor_causes": adv.get("causes"),
            "advisor_cached": adv.get("cached"),
            "advisor_latency_ms": adv.get("latency_ms"),
        }
        records.append(rec)
        out_f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        out_f.flush()

        if not warned_vib and p.get("missing_features") and "accel_vib_metric" in p["missing_features"] and df.shape[1] >= 39:
            print("⚠️ 서버가 'vibration' 키를 저장하지 않아 진동 피처가 결측 처리됨 → manager.py ingest 확인 필요")
            warned_vib = True

        if rec["has_alert"] or (n % 30 == 0):
            if adv.get("status") == "ok":
                c = adv.get("causes") or {}
                adv_s = (f"advisor={adv.get('action')} p={adv.get('action_probs')} conf={adv.get('confidence')} "
                         f"sev={adv.get('severity')} motor={c.get('motor_failure')} false={c.get('false_alarm')}")
            else:
                adv_s = f"advisor={adv.get('status')}"
            flag = "🚨" if rec["has_alert"] else "  "
            print(f"{flag} row={i:5d} t={n:4d}s win={p.get('window_size')} "
                  f"alerts={rec['alert_features']} {adv_s}")

        await asyncio.sleep(max(0.0, tick + 1.0 - time.monotonic()))

    out_f.close()
    await listener.stop()
    summarize(records, args)


# ════════════════════════════════════════════════════════
# 요약·채점
# ════════════════════════════════════════════════════════
def summarize(records: list, args):
    print("\n" + "=" * 60)
    print(f" 요약: {args.label} / {os.path.basename(args.file)}")
    print("=" * 60)
    n = len(records)
    alert_rows = [r for r in records if r["has_alert"]]
    print(f"재생 행 수: {n}, 알람 발생 행: {len(alert_rows)}")
    # 첫 틱(텔레메트리 수신 전 빈 상태) 제외
    records = [r for r in records if r.get("window_size")]
    alert_rows = [r for r in records if r["has_alert"]]
    if alert_rows:
        print(f"첫 알람: row={alert_rows[0]['row']} (t={alert_rows[0]['t_sec']}s) "
              f"features={alert_rows[0]['alert_features']}")
        feat_cnt = Counter(f for r in alert_rows for f in r["alert_features"])
        print(f"알람 피처 빈도: {dict(feat_cnt.most_common())}")

    ok = [r for r in records if r["advisor_status"] == "ok"]
    st = Counter(r["advisor_status"] for r in records)
    print(f"advisor 상태 분포: {dict(st)}")
    if not ok:
        print("advisor 결과 없음 (API 키 미설정이면 정상)")
    else:
        act = Counter(r["advisor_action"] for r in ok)
        print(f"advisor 권고 분포: {dict(act)}")
        cs = [r["advisor_causes"] for r in ok if r["advisor_causes"]]
        if cs:
            avg = {k: round(sum(c.get(k, 0) for c in cs) / len(cs), 2) for k in ("motor_failure", "false_alarm", "battery_related")}
            print(f"원인 확률 평균: 모터 고장 {avg['motor_failure']}, 오탐 {avg['false_alarm']}, 배터리 {avg['battery_related']}")
        sev = [r["advisor_severity"] for r in ok if r["advisor_severity"] is not None]
        if sev:
            print(f"심각도 평균: {sum(sev)/len(sev):.2f} / 3")
        lat = [r["advisor_latency_ms"] for r in ok if r["advisor_latency_ms"] and not r["advisor_cached"]]
        if lat:
            print(f"응답 지연: 평균 {sum(lat)/len(lat):.0f}ms, 최대 {max(lat)}ms, 실호출 {len(lat)}회")

    # 고장 시작 행이 주어지면 전/후 채점
    if args.fault_start is not None:
        fs = args.fault_start
        before = [r for r in records if r["row"] < fs]
        after = [r for r in records if r["row"] >= fs]
        fa = [r for r in before if r["has_alert"]]
        det = [r for r in after if r["has_alert"]]
        print(f"\n[채점] 고장 시작 row={fs}")
        print(f"  고장 전 오탐: {len(fa)}행 / {len(before)}행"
              + (f"  (첫 오탐 row={fa[0]['row']})" if fa else ""))
        if det:
            print(f"  고장 후 첫 탐지: row={det[0]['row']} → 지연 {det[0]['row'] - fs}초")
        else:
            print("  고장 후 탐지 없음 ❌")

        def risk(rs):
            # idle(알람 없음 → 호출 안 함)은 설계상 '정상' 이므로 rtl+land = 0 으로 계산
            vals = []
            for r in rs:
                if r["advisor_status"] == "ok" and r["advisor_probs"]:
                    vals.append(r["advisor_probs"].get("rtl", 0) + r["advisor_probs"].get("land", 0))
                elif r["advisor_status"] == "idle":
                    vals.append(0.0)
            return sum(vals) / len(vals) if vals else None

        rb, ra = risk(before), risk(after)
        if rb is not None or ra is not None:
            print(f"  Jev rtl+land 평균 확률: 고장 전 {rb if rb is None else round(rb, 2)} / "
                  f"고장 후 {ra if ra is None else round(ra, 2)}")
            if rb is not None and ra is not None:
                print("  → " + ("뚜렷이 구분됨 ✅" if ra - rb >= 0.3 else "구분 약함 — 질문/상태 표현 조정 검토 ⚠️"))
    elif args.label == "normal" and alert_rows:
        print(f"\n[채점] 정상 로그에서 알람 {len(alert_rows)}행 → 임계값 재조정 검토")
    elif args.label == "normal":
        print("\n[채점] 정상 로그 오탐 0 ✅")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="http://localhost:8000")
    ap.add_argument("--file", required=True)
    ap.add_argument("--label", default="run", help="accident | normal | 임의 라벨")
    ap.add_argument("--fault-start", type=int, default=None, help="고장 시작 행 (채점용)")
    ap.add_argument("--rows", default=None, help="재생 구간 start:end")
    ap.add_argument("--drone-id", default="drone-001")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    if args.out is None:
        stem = os.path.splitext(os.path.basename(args.file))[0]
        args.out = os.path.join("replay_results", f"{args.label}_{stem}.jsonl")
    asyncio.run(replay(args))


if __name__ == "__main__":
    main()