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
# [FIX 1] 고도 표준편차: 호버링 구간만 추출
#
# 변경사항:
#   - 기존: min_hover_alt_m 이상 전체 구간 → 이착륙 고도 변화가 포함되어 std 과대
#   - 수정: 고도가 안정된 구간(연속 윈도우 내 변화량 작은 구간)만 추출
#           → 실제 호버링/순항 중 고도 유지 능력만 측정
# --------------------------------------------------------
def calc_hovering_alt_std(
    altitudes: list[float],
    min_hover_alt_m: float = 1.5,
    window_sec: int = 30,       # 안정 구간 판별 윈도우 (샘플 수)
    max_window_range_m: float = 2.0  # 윈도우 내 고도 변화 허용 범위
) -> float | None:
    """
    이륙/착륙/급기동 구간을 제외하고 실제 호버링 중 고도 안정성 계산.

    전략:
    1. min_hover_alt_m 이상인 값만 후보로 선정 (지상/이착륙 바닥 제외)
    2. 슬라이딩 윈도우로 고도 변화가 작은 안정 구간만 선택
       (윈도우 내 max-min <= max_window_range_m)
    3. 안정 구간이 없으면 전체 비행 구간(1.5m↑)의 IQR 방식 사용
    """
    if not altitudes or len(altitudes) < 10:
        return None

    # Step 1: 최소 고도 이상인 인덱스만
    flying_alts = [a for a in altitudes if a >= min_hover_alt_m]
    if len(flying_alts) < 10:
        flying_alts = altitudes

    # Step 2: 슬라이딩 윈도우로 안정 구간 수집
    stable_alts = []
    for i in range(0, len(flying_alts) - window_sec, window_sec // 2):
        window = flying_alts[i: i + window_sec]
        if not window:
            continue
        w_range = max(window) - min(window)
        if w_range <= max_window_range_m:
            stable_alts.extend(window)

    # 안정 구간이 충분하면 사용, 아니면 IQR 방식 fallback
    if len(stable_alts) >= 30:
        target_alts = stable_alts
        print(f"[ALT STD] 안정 구간 {len(stable_alts)}개 샘플 사용")
    else:
        print(f"[ALT STD] 안정 구간 부족 ({len(stable_alts)}개) → IQR 방식 사용")
        target_alts = flying_alts
        if len(target_alts) > 20:
            sorted_alts = sorted(target_alts)
            p5 = int(len(sorted_alts) * 0.05)
            p95 = int(len(sorted_alts) * 0.95)
            target_alts = sorted_alts[p5:p95]

    if len(target_alts) < 5:
        return None

    return float(np.std(target_alts))


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

        print("=============== ULOG TOPIC LIST ===============")
        for d in ulog.data_list:
            print(f"- {d.name} → {list(d.data.keys())}")
        print("================================================")

        local_pos = next((d for d in ulog.data_list if d.name == "vehicle_local_position"), None)

        # ============== Battery 인스턴스 자동 선택 ==============
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
        print(f"[DEBUG] 선택된 battery_status 인스턴스 평균전압: {battery_voltage:.2f}V")

        # 🔋 배터리 셀 수 자동 판단
        battery_cell_count = 0
        if battery_voltage >= 35:
            battery_cell_count = 12
        elif battery_voltage >= 15:
            battery_cell_count = 6
        else:
            if "voltage_cell_v[0]" in battery.data:
                for cell_idx in range(14):
                    cell_key = f"voltage_cell_v[{cell_idx}]"
                    if cell_key in battery.data and len(battery.data[cell_key]) > 0:
                        sample_val = float(battery.data[cell_key][0]) if len(battery.data[cell_key]) > 0 else 0
                        if 2.0 <= sample_val <= 5.0:
                            battery_cell_count = cell_idx + 1
            else:
                estimated_cells = round(battery_voltage / 3.7)
                if 4 <= estimated_cells <= 14:
                    battery_cell_count = estimated_cells

        print(f"[DEBUG] 배터리 셀 수 판단: {battery_cell_count}셀")

        gps = next((d for d in ulog.data_list if d.name == "vehicle_gps_position"), None)
        global_pos = next((d for d in ulog.data_list if d.name == "vehicle_global_position"), None)
        esc = next((d for d in ulog.data_list if d.name == "actuator_outputs"), None)
        attitude = next((d for d in ulog.data_list if d.name == "vehicle_attitude"), None)
        estimator_att = next((d for d in ulog.data_list if d.name == "estimator_attitude"), None)

        if not local_pos:
            raise HTTPException(status_code=400, detail="필수 토픽 vehicle_local_position 없음")

        # ESC 필드 감지
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

        # -------------------------------------------------------
        # [FIX 2] 배터리 전압 계산 수정
        #
        # 기존 문제:
        #   voltage_cell_v 배열의 셀 전압을 모두 더한 총 전압(cell_voltage)을
        #   voltages 리스트에 저장하면서, 나중에 /2 보정을 하지 않아
        #   실제보다 2배 높은 전압이 표시됨
        #
        # 수정:
        #   - voltage_cell_v 사용 시 → 셀 수 * 평균 셀전압 = 팩 총 전압 그대로 저장
        #     (이미 총 전압이므로 추가 보정 불필요)
        #   - voltage_v / voltage_filtered_v 사용 시 → 그대로 저장 (변경 없음)
        #   - 이후 summary["battery_avg_voltage"] 계산 시 /2 보정 제거
        # -------------------------------------------------------

        # -------------------------------------------------------
        # [FIX 3] 배터리 전류 계산 수정
        #
        # 기존 문제:
        #   6셀 배터리에 avg_multiplier=15, max_multiplier=4 임의 배율 적용
        #   → ULog의 current_a는 이미 실제 전류값(A)이므로 배율 불필요
        #   → 12셀도 multiplier 1.5/2.5 적용하여 실제값과 괴리
        #
        # 수정:
        #   ULog에서 읽은 전류값을 그대로 사용 (배율 제거)
        #   단, 비정상적으로 낮은 값(센서 미보정) 필터링만 유지
        # -------------------------------------------------------

        for i in range(len(pos_d["timestamp"])):
            t = rel_time(pos_d["timestamp"][i])

            z = float(pos_d.get("z", [0])[i]) * -1
            vx = float(pos_d.get("vx", [0])[i])
            vy = float(pos_d.get("vy", [0])[i])
            speed = math.sqrt(vx*vx + vy*vy)

            # Battery
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

                    # [FIX 2] voltage_cell_v: 셀 합산 = 팩 총 전압, 그대로 저장
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
                            # 팩 총 전압 그대로 저장 (기존에는 이걸 /2 없이 저장하고
                            # 나중에 /2 보정하려다 실수 → 이제 그냥 그대로 사용)
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

                    # [FIX 3] 전류: ULog 값 그대로 사용, 배율 제거
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

            # GPS
            if gps_t and "satellites_used" in gps_d:
                idx = bisect.bisect_left(gps_t, t)
                if 0 < idx < len(gps_t):
                    gps_sats.append(int(gps_d["satellites_used"][idx - 1]))

            # ESC Output
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

            merged.append({"time": t, "altitude": z, "speed": speed, "battery": battery_value})

        merged.sort(key=lambda x: x["time"])

        summary = {}

        # -------------------------------------------------------
        # 배터리 전압 요약 [FIX 2]
        # 기존: avg_v, min_v 그대로 저장 + 디버그에서 /2 출력 (혼란)
        # 수정: voltages에는 이미 올바른 팩 총 전압이 들어있으므로 그대로 사용
        # -------------------------------------------------------
        if voltages:
            avg_v = float(statistics.mean(voltages))
            min_v = float(min(voltages))
            max_v = float(max(voltages))
            ripple_v = max_v - min_v

            summary["battery_avg_voltage"] = avg_v
            summary["battery_min_voltage"] = min_v
            summary["battery_voltage_ripple"] = ripple_v

            print(f"[배터리 전압] 평균: {avg_v:.2f}V, 최소: {min_v:.2f}V, 최대: {max_v:.2f}V, 리플: {ripple_v:.2f}V")

            if ripple_v > 2.0:
                print(f"⚠️ [경고] 전압 리플 {ripple_v:.2f}V (정상 범위: 0.5~1.5V)")

        # -------------------------------------------------------
        # 배터리 전류 요약 [FIX 3]
        # 기존: 셀 수에 따라 임의 배율(×15, ×2.5 등) 적용
        # 수정: ULog 실측값 그대로 사용
        # -------------------------------------------------------
        if currents:
            avg_current = float(statistics.mean(currents))
            peak_current = float(max(currents))

            summary["battery_avg_current"] = avg_current
            summary["battery_peak_current"] = peak_current

            print(f"[배터리 전류] 평균: {avg_current:.2f}A, 최대: {peak_current:.2f}A")
            print(f"[배터리 전류] 셀 수: {battery_cell_count} (배율 적용 없음 — ULog 실측값 사용)")

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
                    max(abs(p) for p in pitch_vals)) * 180 / math.pi
            )

        # GPS
        if gps_sats:
            summary["gnss_avg_sat"] = float(statistics.mean(gps_sats))
            summary["gnss_signal_loss_count"] = len([s for s in gps_sats if s <= 3])

        if gps and "hdop" in gps.data:
            summary["gnss_hdop"] = float(np.mean([float(x) for x in gps.data["hdop"]]))

        # -------------------------------------------------------
        # [FIX 1] 고도 표준편차: 슬라이딩 윈도우 안정 구간만 사용
        # -------------------------------------------------------
        alt_std_computed = False

        if "z" in pos_d:
            rel_altitudes = [-float(z) for z in pos_d["z"]]
            hover_std = calc_hovering_alt_std(
                rel_altitudes,
                min_hover_alt_m=1.5,
                window_sec=30,
                max_window_range_m=2.0
            )
            if hover_std is not None:
                summary["gnss_alt_std"] = hover_std
                alt_std_computed = True
                flying_count = len([a for a in rel_altitudes if a >= 1.5])
                print(f"[ALT STD] 계산 완료: {hover_std:.3f}m (비행 구간 샘플 {flying_count}개)")

        if not alt_std_computed and global_pos and "alt" in global_pos.data:
            msl_alts = [float(alt) for alt in global_pos.data["alt"] if alt is not None]
            if msl_alts:
                ground_level = min(msl_alts)
                rel_alts_from_msl = [a - ground_level for a in msl_alts]
                hover_std = calc_hovering_alt_std(
                    rel_alts_from_msl,
                    min_hover_alt_m=1.5,
                    window_sec=30,
                    max_window_range_m=2.0
                )
                if hover_std is not None:
                    summary["gnss_alt_std"] = hover_std
                    alt_std_computed = True
                    print(f"[ALT STD] global_position MSL 기준(보정): {hover_std:.3f}m")

        # GPS Path 추출
        path_points = []

        if global_pos and "lat" in global_pos.data and "lon" in global_pos.data:
            lats = global_pos.data["lat"]
            lons = global_pos.data["lon"]
            alts = global_pos.data.get("alt", [None] * len(lats))
            times = global_pos.data.get("timestamp", [None] * len(lats))
            step = max(1, len(lats) // 500)

            for i in range(0, len(lats), step):
                lat = float(lats[i])
                lon = float(lons[i])
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
                lat = float(lats[i]) / 1e7
                lon = float(lons[i]) / 1e7
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    point = {"lat": lat, "lng": lon}
                    if alts[i] is not None:
                        point["alt"] = float(alts[i])
                    if times[i] is not None:
                        point["time"] = int(times[i])
                    path_points.append(point)

        if path_points:
            summary["path"] = path_points
            print(f"[DEBUG] GPS 경로 포인트 {len(path_points)}개 추출 완료")

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