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
# Utility: Safe clean (NaN / Inf 제거)
# --------------------------------------------------------
def deep_clean(obj):
    """모든 자료형을 JSON 직렬화 가능하게 재귀적으로 변환"""
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

        # Temp 저장
        with tempfile.NamedTemporaryFile(delete=False, suffix=".ulg") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        ulog = ULog(tmp_path)
        print(f"[DEBUG] Loaded ULog — topics: {len(ulog.data_list)}")

        # ⭐⭐⭐ 여기서부터 추가된 디버그 코드 ⭐⭐⭐
        print("=============== ULOG TOPIC LIST ===============")
        for d in ulog.data_list:
            print(f"- {d.name} → fields: {list(d.data.keys())}")
        print("================================================")
        # ⭐⭐⭐ 여기까지 추가 ⭐⭐⭐

        # 주요 Topic
        local_pos = next((d for d in ulog.data_list if d.name == "vehicle_local_position"), None)
        battery = next((d for d in ulog.data_list if d.name == "battery_status"), None)
        gps = next((d for d in ulog.data_list if d.name == "vehicle_gps_position"), None)
        esc = next((d for d in ulog.data_list if d.name == "actuator_outputs"), None)
        attitude = next((d for d in ulog.data_list if d.name == "vehicle_attitude"), None)
        estimator_att = next((d for d in ulog.data_list if d.name == "estimator_attitude"), None)

        # 확장 Topic
        esc_status = next((d for d in ulog.data_list if d.name == "esc_status"), None)
        imu_status = next((d for d in ulog.data_list if d.name == "vehicle_imu_status"), None)
        rates_sp = next((d for d in ulog.data_list if d.name == "vehicle_rates_setpoint"), None)

        if not local_pos:
            raise HTTPException(status_code=400, detail="필수 토픽 vehicle_local_position 없음")

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

            # ESC output
            if esc_t:
                idx = bisect.bisect_left(esc_t, t)
                if 0 < idx < len(esc_t):
                    values = [float(v[idx - 1]) for k, v in esc_d.items() if "output" in k]
                    if values:
                        esc_outputs.append(sum(values)/len(values))

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

        # ESC
        if esc_outputs:
            summary["esc_avg_output"] = float(statistics.mean(esc_outputs))
            summary["esc_max_output"] = float(max(esc_outputs))
            summary["esc_output_std"] = float(np.std(esc_outputs))

        # ESC 상태
        if esc_status:
            rpm_keys = [k for k in esc_status.data.keys() if "esc_rpm" in k]
            temp_keys = [k for k in esc_status.data.keys() if "esc_temperature" in k]

            if rpm_keys:
                summary["esc_rpm_avg"] = [
                    float(np.mean([float(v) for v in esc_status.data[k]])) for k in rpm_keys
                ]
            if temp_keys:
                summary["esc_temp_max"] = [
                    float(np.max([float(v) for v in esc_status.data[k]])) for k in temp_keys
                ]

        # FCC
        if roll_vals:
            summary["fcc_roll_std"] = float(np.std(roll_vals))
            summary["fcc_pitch_std"] = float(np.std(pitch_vals))
            summary["max_attitude_deg"] = float(
                max(max(abs(r) for r in roll_vals),
                    max(abs(p) for p in pitch_vals)) * 180/math.pi
            )

        # IMU
        if imu_status:
            if "gyro_inconsistency_rad_s" in imu_status.data:
                summary["imu_gyro_inconsistency"] = float(np.max(imu_status.data["gyro_inconsistency_rad_s"]))
            if "accel_inconsistency_m_s_s" in imu_status.data:
                summary["imu_accel_inconsistency"] = float(np.max(imu_status.data["accel_inconsistency_m_s_s"]))

        # GPS
        if gps_sats:
            summary["gnss_avg_sat"] = float(statistics.mean(gps_sats))
            summary["gnss_signal_loss_count"] = len([s for s in gps_sats if s <= 3])

        if gps and "hdop" in gps.data:
            summary["gnss_hdop"] = float(np.mean([float(x) for x in gps.data["hdop"]]))

        if "z" in pos_d:
            alt = [-float(z) for z in pos_d["z"]]
            summary["gnss_alt_std"] = float(np.std(alt))

        # Flight
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
