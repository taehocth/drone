"""
test_failure.py

고장 CSV 데이터를 서버로 직접 push해서
CNN-LSTM 이상 탐지가 동작하는지 테스트합니다.

실행 방법:
    python test_failure.py

브라우저 콘솔에서 동시에 실행:
    const ws = new WebSocket("wss://drone-5-2qlc.onrender.com/api/v1/cbm/ws/cbm?drone_id=drone-test")
    ws.onmessage = (e) => {
        const d = JSON.parse(e.data)
        if (d.has_alert) { console.log("🚨 ALERT!", d.systems) }
        else { console.log("✅ 정상 window:" + d.window_size + "/20") }
    }
    ws.onopen = () => console.log("✅ 연결됨")
"""

import pandas as pd
import requests
import time

# ── 설정 ──────────────────────────────────────────────
SERVER_URL = "https://drone-5-2qlc.onrender.com/api/v1/qgc/telemetry/push"
RESET_URL  = "https://drone-5-2qlc.onrender.com/api/v1/cbm/reset/drone-test"
DRONE_ID   = "drone-test"

# 테스트할 고장 파일 목록 (원하는 파일로 변경 가능)
FAILURE_FILES = [
    r"C:\Users\cth99\OneDrive\바탕 화면\이상탐지 LLM 모델\Final_python\data_csvFile\Failure\2_1_gyro_failure.csv",
    r"C:\Users\cth99\OneDrive\바탕 화면\이상탐지 LLM 모델\Final_python\data_csvFile\Failure\1_1_motor_failure.csv",
]

PUSH_INTERVAL = 0.1   # 초 (0.1 = 10Hz, agent.py와 동일)
MAX_ROWS      = 50   # 파일당 최대 push 행 수


# ── 메인 ──────────────────────────────────────────────
def push_row(row, idx):
    """CSV 한 행을 서버로 push"""
    payload = {
        "drone_id":  DRONE_ID,
        "sysid":     1,
        "lte_ip":    "test",
        "battery":   {
            "voltage":   float(row[0]),
            "current":   float(row[1]),
            "remaining": 80
        },
        "position":  {
            "lat": float(row[2]),
            "lon": float(row[3]),
            "alt": float(row[4])
        },
        "att_target": {
            "yaw":             float(row[5]),
            "pitch":           float(row[6]),
            "roll":            float(row[7]),
            "body_roll_rate":  0.0,
            "body_pitch_rate": 0.0,
            "body_yaw_rate":   0.0,
        },
        "attitude":  {
            "yaw":   float(row[8]),
            "pitch": float(row[9]),
            "roll":  float(row[10])
        },
        "ekf_bias":  {
            "velocity_variance":    float(row[11]),
            "pos_horiz_variance":   float(row[12]),
            "pos_vert_variance":    float(row[13]),
            "compass_variance":     float(row[14]),
            "terrain_alt_variance": float(row[15]),
            "flags":                float(row[16])
        },
        "raw_imu":   {
            "gyro_x":  float(row[17]),
            "gyro_y":  float(row[18]),
            "gyro_z":  float(row[19]),
            "accel_x": float(row[20]),
            "accel_y": float(row[21]),
            "accel_z": float(row[22])
        },
        "servo_output": {
            "pwm1": float(row[23]),
            "pwm2": float(row[24]),
            "pwm3": float(row[25]),
            "pwm4": float(row[26])
        },
        "gps": {"fix_type": 3, "satellites": 12},
    }
    res = requests.post(SERVER_URL, json=payload, timeout=5)
    return res.status_code


def reset_session():
    """드론 세션 초기화"""
    try:
        res = requests.post(RESET_URL, timeout=5)
        print(f"✅ 세션 초기화 완료 (status={res.status_code})")
    except Exception as e:
        print(f"⚠️ 세션 초기화 실패: {e}")


if __name__ == "__main__":
    print("=" * 55)
    print(" CNN-LSTM 이상 탐지 테스트")
    print("=" * 55)
    print(f" 서버: {SERVER_URL}")
    print(f" 드론 ID: {DRONE_ID}")
    print()
    print("브라우저 콘솔에 아래 코드를 먼저 실행하세요:")
    print("-" * 55)
    print('const ws = new WebSocket("wss://drone-5-2qlc.onrender.com/api/v1/cbm/ws/cbm?drone_id=drone-test")')
    print('ws.onmessage = (e) => { const d = JSON.parse(e.data); if (d.has_alert) { console.log("🚨 ALERT!", d.systems) } else { console.log("✅ 정상 window:" + d.window_size + "/20") } }')
    print('ws.onopen = () => console.log("✅ 연결됨")')
    print("-" * 55)
    input("\n브라우저 콘솔 준비됐으면 Enter 누르세요...")

    for file_path in FAILURE_FILES:
        print(f"\n{'=' * 55}")
        print(f"파일: {file_path.split(chr(92))[-1]}")
        print(f"{'=' * 55}")

        # 세션 초기화
        print("세션 초기화 중...")
        reset_session()
        time.sleep(1)

        # CSV 로드
        try:
            df = pd.read_csv(file_path, header=None)
            print(f"데이터 로드 완료: {len(df)}행 × {df.shape[1]}열")
        except Exception as e:
            print(f"❌ 파일 로드 실패: {e}")
            continue

        # Push 시작
        print(f"Push 시작 (최대 {MAX_ROWS}행, {PUSH_INTERVAL}초 간격)...")
        print("알람 발생 시 터미널에도 표시됩니다.\n")

        alert_detected = False
        for i, row in df.iterrows():
            if i >= MAX_ROWS:
                break

            try:
                status = push_row(row, i)
                if i % 20 == 0:
                    print(f"  [{i:3d}/{min(MAX_ROWS, len(df))}] push 완료 (status={status})")
            except Exception as e:
                print(f"  [{i}] push 실패: {e}")

            time.sleep(PUSH_INTERVAL)

        print(f"\n✅ {file_path.split(chr(92))[-1]} 테스트 완료!")
        print("브라우저 콘솔에서 알람 확인하세요.")

        next_file = input("\n다음 파일 테스트할까요? (y/n): ")
        if next_file.lower() != 'y':
            break

    print("\n모든 테스트 완료!")