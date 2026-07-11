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

PWM_MIN_US = 1000.0
PWM_MAX_US = 2000.0
PWM_RANGE_US = PWM_MAX_US - PWM_MIN_US


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


def quat_to_euler(q):
    q0, q1, q2, q3 = q
    roll = math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1*q1 + q2*q2))
    pitch = math.asin(2 * (q0 * q2 - q3 * q1))
    yaw = math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2*q2 + q3*q3))
    return roll, pitch, yaw


def calc_hovering_alt_std(
    altitudes: list[float],
    min_hover_alt_m: float = 1.5,
    window_size: int = 50,
    max_window_range_m: float = 5.0,
) -> float | None:
    if not altitudes or len(altitudes) < 10:
        return None
    flying_alts = [a for a in altitudes if a >= min_hover_alt_m]
    if len(flying_alts) < 10:
        flying_alts = altitudes
    residuals = []
    stable_window_count = 0
    for i in range(0, len(flying_alts) - window_size, window_size // 2):
        window = flying_alts[i: i + window_size]
        if not window:
            continue
        w_range = max(window) - min(window)
        if w_range <= max_window_range_m:
            median_alt = float(np.median(window))
            window_residuals = [a - median_alt for a in window]
            residuals.extend(window_residuals)
            stable_window_count += 1
    if len(residuals) >= 30:
        return float(np.std(residuals))
    target_alts = flying_alts
    if len(target_alts) > 20:
        sorted_alts = sorted(target_alts)
        p10 = int(len(sorted_alts) * 0.10)
        p90 = int(len(sorted_alts) * 0.90)
        target_alts = sorted_alts[p10:p90]
    if len(target_alts) < 5:
        return None
    median_alt = float(np.median(target_alts))
    fallback_residuals = [a - median_alt for a in target_alts]
    return float(np.std(fallback_residuals))


@router.post("/analyze", response_class=ORJSONResponse)
async def upload_log(file: UploadFile = File(...)):
    try:
        if not file.filename.endswith(".ulg"):
            raise HTTPException(status_code=400, detail="ULG 파일만 업로드할 수 있습니다.")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".ulg") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        ulog = ULog(tmp_path)

        local_pos = next((d for d in ulog.data_list if d.name == "vehicle_local_position"), None)
        battery_list = [d for d in ulog.data_list if d.name == "battery_status"]
        if not battery_list:
            raise HTTPException(status_code=400, detail="battery_status 토픽 없음")

        def avg_voltage(b):
            if "voltage_v" in b.data:
                v = [float(x) for x in b.data["voltage_v"] if x > 0]
                return np.mean(v) if v else 0
            return 0

        battery = max(battery_list, key=avg_voltage)
        battery_voltage = avg_voltage(battery)

        gps = next((d for d in ulog.data_list if d.name == "vehicle_gps_position"), None)
        global_pos = next((d for d in ulog.data_list if d.name == "vehicle_global_position"), None)
        esc = next((d for d in ulog.data_list if d.name == "actuator_outputs"), None)
        attitude = next((d for d in ulog.data_list if d.name == "vehicle_attitude"), None)
        estimator_att = next((d for d in ulog.data_list if d.name == "estimator_attitude"), None)

        if not local_pos:
            raise HTTPException(status_code=400, detail="필수 토픽 vehicle_local_position 없음")

        esc_keys = []
        esc_range_type = None
        if esc:
            esc_d_keys = list(esc.data.keys())
            esc_keys = [k for k in esc_d_keys if "output" in k.lower() and "[" in k]
            if not esc_keys:
                esc_keys = [k for k in esc_d_keys if any(x in k.lower() for x in ["output", "control"])]
            if esc_keys and len(esc.data[esc_keys[0]]) > 0:
                sample_values = []
                sample_count = min(100, len(esc.data[esc_keys[0]]))
                for sample_idx in range(sample_count):
                    sample_raw = [
                        float(esc.data[k][sample_idx])
                        for k in esc_keys
                        if abs(float(esc.data[k][sample_idx])) > 10
                    ]
                    if sample_raw:
                        sample_values.append(sum(sample_raw) / len(sample_raw))
                if sample_values:
                    min_val = min(sample_values)
                    max_val = max(sample_values)
                    if min_val >= 900 and max_val <= 2100:
                        esc_range_type = 'us'
                    elif min_val >= -1.1 and max_val <= 1.1:
                        esc_range_type = 'norm_-11'
                    elif min_val >= -0.1 and max_val <= 1.1:
                        esc_range_type = 'norm_01'
                    else:
                        esc_range_type = 'unknown'

        min_ts = float(local_pos.data["timestamp"][0])
        rel_time = lambda t: (float(t) - min_ts) / 1_000_000

        def extract(topic):
            if not topic:
                return [], {}
            return [rel_time(t) for t in topic.data["timestamp"]], topic.data

        bat_t, bat_d = extract(battery)
        gps_t, gps_d = extract(gps)
        global_pos_t, global_pos_d = extract(global_pos)
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

            battery_value = 0.0
            if bat_t and len(bat_t) > 0:
                idx = bisect.bisect_left(bat_t, t)
                if idx >= len(bat_t):
                    idx = len(bat_t) - 1
                if idx < 0:
                    idx = 0
                bat_idx = idx if idx == 0 else idx - 1
                if 0 <= bat_idx < len(bat_t):
                    voltage_added = False
                    if "voltage_cell_v[0]" in bat_d:
                        cell_voltage = 0.0
                        cell_count = 0
                        for cell_idx in range(14):
                            cell_key = f"voltage_cell_v[{cell_idx}]"
                            if cell_key in bat_d and len(bat_d[cell_key]) > bat_idx:
                                cell_val = float(bat_d[cell_key][bat_idx])
                                if 2.0 <= cell_val <= 5.0:
                                    cell_voltage += cell_val
                                    cell_count += 1
                        if cell_count > 0:
                            voltages.append(cell_voltage)
                            battery_value = cell_voltage
                            voltage_added = True
                    if not voltage_added:
                        voltage_key = None
                        if "voltage_filtered_v" in bat_d and len(bat_d["voltage_filtered_v"]) > bat_idx:
                            voltage_key = "voltage_filtered_v"
                        elif "voltage_v" in bat_d and len(bat_d["voltage_v"]) > bat_idx:
                            voltage_key = "voltage_v"
                        if voltage_key:
                            raw_volt = float(bat_d[voltage_key][bat_idx])
                            if 10 <= raw_volt <= 70:
                                voltages.append(raw_volt)
                                battery_value = raw_volt

                    current_val = None
                    if "current_average_a" in bat_d and len(bat_d["current_average_a"]) > bat_idx:
                        v = float(bat_d["current_average_a"][bat_idx])
                        if v > 0:
                            current_val = v
                    elif "current_filtered_a" in bat_d and len(bat_d["current_filtered_a"]) > bat_idx:
                        v = float(bat_d["current_filtered_a"][bat_idx])
                        if v > 0:
                            current_val = v
                    elif "current_a" in bat_d and len(bat_d["current_a"]) > bat_idx:
                        v = float(bat_d["current_a"][bat_idx])
                        if v > 0:
                            current_val = v
                    if current_val is not None:
                        currents.append(current_val)

            if gps_t and "satellites_used" in gps_d:
                idx = bisect.bisect_left(gps_t, t)
                if 0 < idx < len(gps_t):
                    gps_sats.append(int(gps_d["satellites_used"][idx - 1]))

            if esc_t and esc_keys:
                idx = bisect.bisect_left(esc_t, t)
                if 0 < idx < len(esc_t):
                    raw_values = [
                        float(esc_d[k][idx - 1])
                        for k in esc_keys
                        if abs(float(esc_d[k][idx - 1])) > 10
                    ]
                    if not raw_values:
                        continue
                    avg_raw = sum(raw_values) / len(raw_values)
                    if esc_range_type == 'us':
                        esc_outputs.append(avg_raw)
                    elif esc_range_type == 'norm_-11':
                        normalized = (avg_raw + 1.0) / 2.0
                        normalized = max(0.0, min(1.0, normalized))
                        esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)
                    elif esc_range_type == 'norm_01':
                        normalized = max(0.0, min(1.0, avg_raw))
                        esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)
                    else:
                        if 900 <= avg_raw <= 2100:
                            esc_outputs.append(avg_raw)
                        else:
                            normalized = max(0.0, min(1.0, avg_raw))
                            esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)

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

            merged.append({"time": t, "altitude": z, "speed": speed, "battery": battery_value})

        merged.sort(key=lambda x: x["time"])
        summary = {}

        if voltages:
            avg_v = float(statistics.mean(voltages))
            min_v = float(min(voltages))
            max_v = float(max(voltages))
            summary["battery_avg_voltage"] = avg_v
            summary["battery_min_voltage"] = min_v
            summary["battery_voltage_ripple"] = max_v - min_v

        # -------------------------------------------------------
        # 배터리 전류 요약
        # ULog current_a 는 이미 실제 전류값(A)이므로 배율 없이 그대로 사용.
        # (근거 불명확한 ×2 보정 제거 — 센서 원시 측정값을 정직하게 표시)
        # -------------------------------------------------------
        if currents:
            avg_current = float(statistics.mean(currents))
            peak_current = float(max(currents))
            summary["battery_avg_current"] = avg_current
            summary["battery_peak_current"] = peak_current
            print(f"[배터리 전류] 평균: {avg_current:.2f}A, 최대: {peak_current:.2f}A (원시값 그대로)")

        if battery and "temperature" in battery.data:
            temps = [float(x) for x in battery.data["temperature"]]
            summary["battery_temp_avg"] = float(np.mean(temps))
            summary["battery_temp_max"] = float(np.max(temps))

        if esc_outputs:
            summary["esc_avg_output"] = float(statistics.mean(esc_outputs))
            summary["esc_max_output"] = float(max(esc_outputs))
            summary["esc_output_std"] = float(np.std(esc_outputs))

        if roll_vals:
            summary["fcc_roll_std"] = float(np.std(roll_vals))
            summary["fcc_pitch_std"] = float(np.std(pitch_vals))
            summary["max_attitude_deg"] = float(
                max(max(abs(r) for r in roll_vals),
                    max(abs(p) for p in pitch_vals)) * 180 / math.pi
            )

        if gps_sats:
            summary["gnss_avg_sat"] = float(statistics.mean(gps_sats))
            summary["gnss_signal_loss_count"] = len([s for s in gps_sats if s <= 3])
        if gps and "hdop" in gps.data:
            summary["gnss_hdop"] = float(np.mean([float(x) for x in gps.data["hdop"]]))

        alt_std_computed = False
        if "z" in pos_d:
            rel_altitudes = [-float(z) for z in pos_d["z"]]
            hover_std = calc_hovering_alt_std(rel_altitudes, 1.5, 50, 5.0)
            if hover_std is not None:
                summary["gnss_alt_std"] = hover_std
                alt_std_computed = True
        if not alt_std_computed and global_pos and "alt" in global_pos.data:
            msl_alts = [float(alt) for alt in global_pos.data["alt"] if alt is not None]
            if msl_alts:
                ground_level = min(msl_alts)
                rel_alts_from_msl = [a - ground_level for a in msl_alts]
                hover_std = calc_hovering_alt_std(rel_alts_from_msl, 1.5, 50, 5.0)
                if hover_std is not None:
                    summary["gnss_alt_std"] = hover_std

        path_points = []
        if global_pos and "lat" in global_pos.data and "lon" in global_pos.data:
            lats = global_pos.data["lat"]
            lons = global_pos.data["lon"]
            alts = global_pos.data.get("alt", [None] * len(lats))
            times = global_pos.data.get("timestamp", [None] * len(lats))
            step = max(1, len(lats) // 500)
            for i in range(0, len(lats), step):
                lat = float(lats[i]); lon = float(lons[i])
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    point = {"lat": lat, "lng": lon}
                    if alts[i] is not None:
                        point["alt"] = float(alts[i])
                    if times[i] is not None:
                        point["time"] = int(times[i])
                    path_points.append(point)
        elif gps and "lat" in gps.data and "lon" in gps.data:
            lats = gps.data["lat"]
            lons = gps.data["lon"]
            alts = gps.data.get("altitude_msl_m", [None] * len(lats))
            times = gps.data.get("timestamp", [None] * len(lats))
            step = max(1, len(lats) // 500)
            for i in range(0, len(lats), step):
                lat = float(lats[i]) / 1e7; lon = float(lons[i]) / 1e7
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    point = {"lat": lat, "lng": lon}
                    if alts[i] is not None:
                        point["alt"] = float(alts[i])
                    if times[i] is not None:
                        point["time"] = int(times[i])
                    path_points.append(point)
        if path_points:
            summary["path"] = path_points

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