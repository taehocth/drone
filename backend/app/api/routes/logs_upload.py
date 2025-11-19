from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import ORJSONResponse

from pyulog import ULog
import tempfile
import traceback
import bisect
import statistics
import numpy as np
import math

router = APIRouter(tags=["Flight Logs"])

# --------------------------------------------------------
# Constants
# --------------------------------------------------------
PWM_MIN_US = 1000.0
PWM_MAX_US = 2000.0
PWM_RANGE_US = PWM_MAX_US - PWM_MIN_US


# --------------------------------------------------------
# Utility: Safe clean (NaN / Inf 제거)
# --------------------------------------------------------
def deep_clean(obj):
    if isinstance(obj, dict):
        return {k: deep_clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [deep_clean(v) for v in obj]
    if isinstance(obj, (float, np.floating)):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return float(obj)
    return obj


def clean_dict(d):
    out = {}
    for k, v in d.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            out[k] = None
        else:
            out[k] = v
    return out


# --------------------------------------------------------
# Quaternion → Euler 변환
# --------------------------------------------------------
def quat_to_euler(q):
    q0, q1, q2, q3 = q
    roll = math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1*q1 + q2*q2))
    pitch = math.asin(2 * (q0 * q2 - q3 * q1))
    yaw = math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2*q2 + q3*q3))
    return roll, pitch, yaw


# --------------------------------------------------------
# PX4 ULG Analyzer
# --------------------------------------------------------
@router.post("/analyze", response_class=ORJSONResponse)
async def upload_log(file: UploadFile = File(...)):
    try:
        if not file.filename.endswith(".ulg"):
            raise HTTPException(status_code=400, detail="ULG 파일만 업로드할 수 있습니다.")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".ulg") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        ulog = ULog(tmp_path)
        print(f"[DEBUG] Loaded ULog — topics: {len(ulog.data_list)}")

        # ⭐ Debug: 전체 토픽 목록 출력
        print("=============== ULOG TOPIC LIST ===============")
        for d in ulog.data_list:
            print(f"- {d.name} → {list(d.data.keys())}")
        print("================================================")

        # 주요 Topic
        local_pos = next((d for d in ulog.data_list if d.name == "vehicle_local_position"), None)
        battery = next((d for d in ulog.data_list if d.name == "battery_status"), None)
        gps = next((d for d in ulog.data_list if d.name == "vehicle_gps_position"), None)
        esc = next((d for d in ulog.data_list if d.name == "actuator_outputs"), None)
        attitude = next((d for d in ulog.data_list if d.name == "vehicle_attitude"), None)
        estimator_att = next((d for d in ulog.data_list if d.name == "estimator_attitude"), None)

        esc_status = next((d for d in ulog.data_list if d.name == "esc_status"), None)
        imu_status = next((d for d in ulog.data_list if d.name == "vehicle_imu_status"), None)

        if not local_pos:
            raise HTTPException(status_code=400, detail="필수 토픽 vehicle_local_position 없음")

        # --------------------------------------------------------
        # ⭐⭐ ESC RAW 디버그 추가 ⭐⭐
        # --------------------------------------------------------
        print("\n\n=========== ESC RAW DEBUG ===========")
        if esc:
            esc_keys = list(esc.data.keys())
            print("[ESC KEYS]:", esc_keys)

            for k in esc_keys:
                print(f"[{k}] 첫 20개 값:", esc.data[k][:20])
        else:
            print("❌ actuator_outputs 토픽 없음")
        print("=====================================\n\n")
        # --------------------------------------------------------

        min_ts = float(local_pos.data["timestamp"][0])
        rel_time = lambda t: (float(t) - min_ts) / 1_000_000

        def extract(topic):
            if not topic:
                return [], {}
            return [rel_time(t) for t in topic.data["timestamp"]], topic.data

        bat_t, bat_d = extract(battery)
        gps_t, gps_d = extract(gps)
        esc_t, esc_d = extract(esc)
        att_t, att_d = extract(attitude)
        est_t, est_d = extract(estimator_att)
        pos_t, pos_d = extract(local_pos)

        # 🔍 ESC 필드 및 데이터 범위 사전 감지
        esc_keys = []
        esc_range_type = None  # 'us', 'norm_01', 'norm_-11', 'unknown'
        
        if esc:
            # ESC 필드 자동 탐지 (output[0], output[1] 등)
            esc_keys = [
                k for k in esc_d.keys()
                if "output" in k.lower() and "[" in k
            ]
            
            # output[0] 형식이 없으면 다른 패턴 시도
            if not esc_keys:
                esc_keys = [
                    k for k in esc_d.keys()
                    if any(x in k.lower() for x in ["output", "control"])
                ]
            
            # 데이터 범위 감지 (처음 100개 샘플)
            # ⚠️ 0이 아닌 값만 사용 (사용되지 않는 채널 제외)
            if esc_keys and len(esc_d[esc_keys[0]]) > 0:
                sample_values = []
                sample_count = min(100, len(esc_d[esc_keys[0]]))
                for sample_idx in range(sample_count):
                    sample_raw = [
                        float(esc_d[k][sample_idx]) 
                        for k in esc_keys 
                        if abs(float(esc_d[k][sample_idx])) > 10  # 0이 아닌 값만 (10 µs 이상)
                    ]
                    if sample_raw:
                        sample_values.append(sum(sample_raw) / len(sample_raw))
                
                if sample_values:
                    min_val = min(sample_values)
                    max_val = max(sample_values)
                    print(f"[ESC DEBUG] 샘플 범위: {min_val:.2f} ~ {max_val:.2f}")
                    
                    if min_val >= 900 and max_val <= 2100:
                        esc_range_type = 'us'  # 이미 마이크로초 단위
                        print("[ESC DEBUG] 범위 감지: 마이크로초 단위 (그대로 사용)")
                    elif min_val >= -1.1 and max_val <= 1.1:
                        esc_range_type = 'norm_-11'  # -1~1 범위
                        print("[ESC DEBUG] 범위 감지: -1~1 정규화 (변환 필요)")
                    elif min_val >= -0.1 and max_val <= 1.1:
                        esc_range_type = 'norm_01'  # 0~1 범위
                        print("[ESC DEBUG] 범위 감지: 0~1 정규화 (변환 필요)")
                    else:
                        esc_range_type = 'unknown'
                        print(f"[ESC DEBUG] 범위 감지: 알 수 없음 (min={min_val:.2f}, max={max_val:.2f})")

        merged = []
        voltages, currents = [], []
        roll_vals, pitch_vals = [], []
        gps_sats = []
        esc_outputs = []

        for i in range(len(pos_d["timestamp"])):
            t = rel_time(pos_d["timestamp"][i])

            z = float(pos_d.get("z", [0])[i]) * -1
            vx = float(pos_d.get("vx", [0])[i])
            vy = float(pos_d.get("vy", [0])[i])
            speed = math.sqrt(vx*vx + vy*vy)

            # Battery
            if bat_t and "voltage_v" in bat_d:
                idx = bisect.bisect_left(bat_t, t)
                if 0 < idx < len(bat_t):
                    voltages.append(float(bat_d["voltage_v"][idx - 1]))
                    if "current_a" in bat_d:
                        currents.append(float(bat_d["current_a"][idx - 1]))

            # GPS
            if gps_t and "satellites_used" in gps_d:
                idx = bisect.bisect_left(gps_t, t)
                if 0 < idx < len(gps_t):
                    gps_sats.append(int(gps_d["satellites_used"][idx - 1]))

            # ESC Output (사전 감지한 범위 타입에 따라 변환)
            # ⚠️ 0이 아닌 값만 사용 (사용되지 않는 채널 제외)
            if esc_t and esc_keys:
                idx = bisect.bisect_left(esc_t, t)
                if 0 < idx < len(esc_t):
                    raw_values = [
                        float(esc_d[k][idx - 1]) 
                        for k in esc_keys 
                        if abs(float(esc_d[k][idx - 1])) > 10  # 0이 아닌 값만 (10 µs 이상)
                    ]
                    if not raw_values:
                        continue  # 유효한 값이 없으면 스킵
                    avg_raw = sum(raw_values) / len(raw_values)
                    
                    if esc_range_type == 'us':
                        # 이미 마이크로초 단위 → 그대로 사용
                        esc_outputs.append(avg_raw)
                    elif esc_range_type == 'norm_-11':
                        # -1~1 범위 → 0~1로 변환 후 마이크로초
                        normalized = (avg_raw + 1.0) / 2.0
                        normalized = max(0.0, min(1.0, normalized))
                        esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)
                    elif esc_range_type == 'norm_01':
                        # 0~1 범위 → 마이크로초
                        normalized = max(0.0, min(1.0, avg_raw))
                        esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)
                    else:
                        # 알 수 없는 범위 → 값 자체로 판단
                        if 900 <= avg_raw <= 2100:
                            esc_outputs.append(avg_raw)  # 마이크로초로 가정
                        else:
                            # 정규화된 값으로 가정하고 변환
                            normalized = max(0.0, min(1.0, avg_raw))
                            esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)

            # Attitude
            if att_t and "q[0]" in att_d:
                idx = bisect.bisect_left(att_t, t)
                if 0 < idx < len(att_t):
                    q = [float(att_d[f"q[{j}]"][idx - 1]) for j in range(4)]
                    r, p, _ = quat_to_euler(q)
                    roll_vals.append(r)
                    pitch_vals.append(p)

            elif est_t and "q[0]" in est_d:
                idx = bisect.bisect_left(est_t, t)
                if 0 < idx < len(est_t):
                    q = [float(est_d[f"q[{j}]"][idx - 1]) for j in range(4)]
                    r, p, _ = quat_to_euler(q)
                    roll_vals.append(r)
                    pitch_vals.append(p)

            merged.append({"time": t, "altitude": z, "speed": speed})

        merged.sort(key=lambda x: x["time"])

        summary = {}

        if voltages:
            summary["battery_avg_voltage"] = float(statistics.mean(voltages))
            summary["battery_min_voltage"] = float(min(voltages))
            summary["battery_voltage_ripple"] = float(max(voltages) - min(voltages))

        if currents:
            summary["battery_peak_current"] = float(max(currents))
            summary["battery_avg_current"] = float(statistics.mean(currents))

        # Temperature
        if battery and "temperature" in battery.data:
            temps = [float(x) for x in battery.data["temperature"]]
            summary["battery_temp_avg"] = float(np.mean(temps))
            summary["battery_temp_max"] = float(np.max(temps))

        # ESC summary
        if esc_outputs:
            summary["esc_avg_output"] = float(statistics.mean(esc_outputs))
            summary["esc_max_output"] = float(max(esc_outputs))
            summary["esc_output_std"] = float(np.std(esc_outputs))

        # FCC
        if roll_vals:
            summary["fcc_roll_std"] = float(np.std(roll_vals))
            summary["fcc_pitch_std"] = float(np.std(pitch_vals))
            summary["max_attitude_deg"] = float(
                max(max(abs(r) for r in roll_vals),
                    max(abs(p) for p in pitch_vals)) * 180/math.pi
            )

        # GPS
        if gps_sats:
            summary["gnss_avg_sat"] = float(statistics.mean(gps_sats))
            summary["gnss_signal_loss_count"] = len([s for s in gps_sats if s <= 3])

        if gps and "hdop" in gps.data:
            summary["gnss_hdop"] = float(np.mean([float(x) for x in gps.data["hdop"]]))

        if "z" in pos_d:
            alt = [-float(z) for z in pos_d["z"]]
            summary["gnss_alt_std"] = float(np.std(alt))

        # Flight summary
        altitudes = [m["altitude"] for m in merged]
        speeds = [m["speed"] for m in merged]

        if altitudes:
            summary["max_altitude"] = float(max(altitudes))
        if speeds:
            summary["max_ground_speed"] = float(max(speeds))

        if len(altitudes) > 1:
            climb_rates = np.diff(altitudes)
            summary["max_climb_rate"] = float(np.max(climb_rates))
            summary["max_descent_rate"] = float(np.min(climb_rates))
            summary["landing_impact"] = abs(float(np.min(climb_rates)))

        return ORJSONResponse(deep_clean({
            "data": [clean_dict(m) for m in merged],
            "summary": summary
        }))

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"서버 오류: {e}")
