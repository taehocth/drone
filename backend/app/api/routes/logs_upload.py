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

        # --------------------------------------------------------
        # ⭐ 1) Battery topic 자동 탐지
        # --------------------------------------------------------
        battery_topics = [d for d in ulog.data_list if "battery_status" in d.name]

        battery = None
        for topic in battery_topics:
            if "voltage_v" in topic.data and len(topic.data["voltage_v"]) >= 5:
                battery = topic
                break

        if not battery:
            raise HTTPException(status_code=400, detail="battery_status 토픽을 찾지 못함")

        # --------------------------------------------------------
        # ⭐ 2) Battery scaling 자동 감지
        # --------------------------------------------------------
        raw_volt = np.array(battery.data["voltage_v"], dtype=float)
        raw_mean = float(np.mean(raw_volt[: min(50, len(raw_volt)) ]))

        if raw_mean < 1:
            scale = 100.0
        elif raw_mean < 10:
            scale = 10.0
        else:
            scale = 1.0

        print(f"[BAT DEBUG] raw_mean={raw_mean:.3f}, scale={scale}")

        corrected_voltage = raw_volt * scale
        corrected_current = np.array(battery.data.get("current_a", []), dtype=float)

        # --------------------------------------------------------
        # Load 주요 토픽
        # --------------------------------------------------------
        local_pos = next((d for d in ulog.data_list if d.name == "vehicle_local_position"), None)
        gps = next((d for d in ulog.data_list if d.name == "vehicle_gps_position"), None)
        esc = next((d for d in ulog.data_list if d.name == "actuator_outputs"), None)
        attitude = next((d for d in ulog.data_list if d.name == "vehicle_attitude"), None)
        estimator_att = next((d for d in ulog.data_list if d.name == "estimator_attitude"), None)

        if not local_pos:
            raise HTTPException(400, "vehicle_local_position 없음")

        min_ts = float(local_pos.data["timestamp"][0])
        rel_time = lambda t: (float(t) - min_ts) / 1_000_000

        # ---------------------------
        # GPS 자동 필드 탐지
        # ---------------------------
        gps_sat_field = None
        gps_hdop_field = None

        if gps:
            gps_d = gps.data

            # 위성 수 자동 선택
            for cand in ["satellites_used", "satellites_visible", "num_sats", "satcount"]:
                if cand in gps_d:
                    gps_sat_field = cand
                    break

            # HDOP / EPH / EPV 자동 선택
            if "hdop" in gps_d:
                gps_hdop_field = "hdop"
            elif "eph" in gps_d:
                gps_hdop_field = "eph"
            elif "epv" in gps_d:
                gps_hdop_field = "epv"

        # extract helper
        def extract(topic):
            if not topic:
                return [], {}
            return [rel_time(t) for t in topic.data["timestamp"]], topic.data

        bat_t = [rel_time(t) for t in battery.data["timestamp"]]
        bat_d = battery.data

        gps_t, gps_d = extract(gps) if gps else ([], {})
        esc_t, esc_d = extract(esc)
        att_t, att_d = extract(attitude)
        est_t, est_d = extract(estimator_att)
        pos_t, pos_d = extract(local_pos)

        # --------------------------------------------------------
        # ESC 범위 자동 탐지
        # --------------------------------------------------------
        esc_keys = []
        esc_range_type = None

        if esc:
            esc_keys = [k for k in esc_d.keys() if "output" in k and "[" in k]

            if not esc_keys:
                esc_keys = [k for k in esc_d.keys()
                            if "output" in k.lower() or "control" in k.lower()]

            if esc_keys:
                sample_vals = []
                for i in range(min(50, len(esc_d[esc_keys[0]]))):
                    vals = [
                        float(esc_d[k][i])
                        for k in esc_keys
                        if abs(float(esc_d[k][i])) > 10
                    ]
                    if vals:
                        sample_vals.append(sum(vals)/len(vals))

                if sample_vals:
                    mn, mx = min(sample_vals), max(sample_vals)

                    if 900 <= mn <= 2100:
                        esc_range_type = "us"
                    elif -1.1 <= mn <= 1.1:
                        esc_range_type = "norm_-11"
                    elif -0.1 <= mn <= 1.1:
                        esc_range_type = "norm_01"
                    else:
                        esc_range_type = "unknown"

        # --------------------------------------------------------
        # 데이터 수집
        # --------------------------------------------------------
        merged = []
        voltages, currents = [], []
        gps_sats = []
        hdop_vals = []
        alt_vals = []
        esc_outputs = []

        for i in range(len(pos_d["timestamp"])):
            t = rel_time(pos_d["timestamp"][i])

            z = float(pos_d["z"][i]) * -1
            vx = float(pos_d["vx"][i])
            vy = float(pos_d["vy"][i])
            speed = math.sqrt(vx*vx + vy*vy)

            # Battery
            idx = bisect.bisect_left(bat_t, t)
            if 0 < idx < len(bat_t):
                voltages.append(float(corrected_voltage[idx-1]))
                if len(corrected_current) > idx-1:
                    currents.append(float(corrected_current[idx-1]))

            # ⭐ GPS 위성 수
            if gps_t and gps_sat_field:
                idx = bisect.bisect_left(gps_t, t)
                if 0 < idx < len(gps_t):
                    gps_sats.append(int(gps_d[gps_sat_field][idx-1]))

            # ⭐ HDOP or EPH/EPV
            if gps_t and gps_hdop_field:
                idx = bisect.bisect_left(gps_t, t)
                if 0 < idx < len(gps_t):
                    hdop_vals.append(float(gps_d[gps_hdop_field][idx-1]))

            # ESC
            if esc_t and esc_keys:
                idx = bisect.bisect_left(esc_t, t)
                if 0 < idx < len(esc_t):
                    raw = [
                        float(esc_d[k][idx-1])
                        for k in esc_keys
                        if abs(float(esc_d[k][idx-1])) > 10
                    ]
                    if raw:
                        avg_raw = sum(raw)/len(raw)

                        if esc_range_type == "us":
                            esc_outputs.append(avg_raw)
                        elif esc_range_type == "norm_-11":
                            norm = (avg_raw + 1) / 2
                            esc_outputs.append(PWM_MIN_US + norm * PWM_RANGE_US)
                        elif esc_range_type == "norm_01":
                            norm = max(0, min(1, avg_raw))
                            esc_outputs.append(PWM_MIN_US + norm * PWM_RANGE_US)
                        else:
                            if 900 <= avg_raw <= 2100:
                                esc_outputs.append(avg_raw)
                            else:
                                norm = max(0, min(1, avg_raw))
                                esc_outputs.append(PWM_MIN_US + norm * PWM_RANGE_US)

            merged.append({
                "time": t,
                "altitude": z,
                "speed": speed
            })
            alt_vals.append(z)

        merged.sort(key=lambda x: x["time"])

        # --------------------------------------------------------
        # Summary 계산
        # --------------------------------------------------------
        summary = {}

        # Battery
        if voltages:
            summary["battery_avg_voltage"] = float(np.mean(voltages))
            summary["battery_min_voltage"] = float(min(voltages))
            summary["battery_voltage_ripple"] = float(max(voltages) - min(voltages))

        if currents:
            summary["battery_peak_current"] = float(max(currents))
            summary["battery_avg_current"] = float(np.mean(currents))

        # Temperature
        if "temperature" in battery.data:
            temps = [float(x) for x in battery.data["temperature"]]
            summary["battery_temp_avg"] = float(np.mean(temps))
            summary["battery_temp_max"] = float(max(temps))

        # ESC
        if esc_outputs:
            summary["esc_avg_output"] = float(np.mean(esc_outputs))
            summary["esc_max_output"] = float(max(esc_outputs))
            summary["esc_output_std"] = float(np.std(esc_outputs))

        # GNSS summary
        if gps_sats:
            summary["gnss_avg_sat"] = float(np.mean(gps_sats))
            summary["gnss_min_sat"] = int(min(gps_sats))
            summary["gnss_signal_loss_count"] = len([x for x in gps_sats if x <= 3])

        if hdop_vals:
            summary["gnss_hdop"] = float(np.mean(hdop_vals))

        if alt_vals:
            summary["gnss_alt_std"] = float(np.std(alt_vals))

        # Flight
        if alt_vals:
            summary["max_altitude"] = float(max(alt_vals))

        speeds = [m["speed"] for m in merged]

        if speeds:
            summary["max_ground_speed"] = float(max(speeds))

        if len(alt_vals) > 1:
            climb = np.diff(alt_vals)
            summary["max_climb_rate"] = float(max(climb))
            summary["max_descent_rate"] = float(min(climb))
            summary["landing_impact"] = float(abs(min(climb)))

        return ORJSONResponse(deep_clean({
            "data": [clean_dict(m) for m in merged],
            "summary": summary
        }))

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"서버 오류: {e}")
