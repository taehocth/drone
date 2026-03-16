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

STABLE_SPEED_THRESHOLD = 1.0   # m/s 이하를 안정/저속 구간으로 간주
MIN_STABLE_ALT_SAMPLES = 10
ALT_SMOOTH_WINDOW = 21         # detrend용 moving average window


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


def safe_float(value, default=None):
    try:
        if value is None:
            return default
        v = float(value)
        if math.isnan(v) or math.isinf(v):
            return default
        return v
    except Exception:
        return default


# --------------------------------------------------------
# Quaternion → Euler 변환
# --------------------------------------------------------
def quat_to_euler(q):
    q0, q1, q2, q3 = q

    sinp = 2 * (q0 * q2 - q3 * q1)
    sinp = max(-1.0, min(1.0, sinp))  # asin domain clamp

    roll = math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2))
    pitch = math.asin(sinp)
    yaw = math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3))
    return roll, pitch, yaw


# --------------------------------------------------------
# Helpers
# --------------------------------------------------------
def moving_average(arr: np.ndarray, window: int) -> np.ndarray:
    if len(arr) == 0:
        return arr
    window = max(3, int(window))
    if window % 2 == 0:
        window += 1
    if len(arr) < window:
        return np.full_like(arr, np.mean(arr), dtype=float)

    kernel = np.ones(window, dtype=float) / window
    pad = window // 2
    padded = np.pad(arr, (pad, pad), mode="edge")
    return np.convolve(padded, kernel, mode="valid")


def compute_altitude_stability_metrics(altitudes, speeds):
    """
    altitudes: 절대고도(MSL 또는 GPS altitude)
    speeds:    해당 시점의 ground speed
    """
    result = {}

    if not altitudes:
        return result

    alt_arr = np.array([safe_float(x) for x in altitudes], dtype=float)
    alt_arr = alt_arr[~np.isnan(alt_arr)]
    if len(alt_arr) == 0:
        return result

    # 1) 기존 방식에 해당하는 raw std (비행 전체 spread)
    result["gnss_alt_std_raw"] = float(np.std(alt_arr))

    # 2) detrend residual std
    smooth = moving_average(alt_arr, ALT_SMOOTH_WINDOW)
    residual = alt_arr - smooth
    result["gnss_alt_noise_std"] = float(np.std(residual))

    # 3) 안정 구간(speed < threshold)만 사용한 std
    stable_pairs = []
    for a, s in zip(altitudes, speeds):
        fa = safe_float(a)
        fs = safe_float(s)
        if fa is None or fs is None:
            continue
        if fs <= STABLE_SPEED_THRESHOLD:
            stable_pairs.append(fa)

    if len(stable_pairs) >= MIN_STABLE_ALT_SAMPLES:
        result["gnss_alt_std"] = float(np.std(stable_pairs))
        result["gnss_alt_stable_sample_count"] = int(len(stable_pairs))
    else:
        # 안정 구간이 너무 적으면 residual noise를 대표값으로 사용
        result["gnss_alt_std"] = float(np.std(residual))
        result["gnss_alt_stable_sample_count"] = int(len(stable_pairs))

    return result


def pick_previous_index(ts_list, t):
    if not ts_list:
        return None
    idx = bisect.bisect_left(ts_list, t)
    if idx <= 0:
        return 0
    if idx >= len(ts_list):
        return len(ts_list) - 1
    return idx - 1


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
        battery_list = [d for d in ulog.data_list if d.name == "battery_status"]

        if not battery_list:
            raise HTTPException(status_code=400, detail="battery_status 토픽 없음")

        # 각 인스턴스의 평균 전압 계산하여 가장 정상적인 배터리 선택
        def avg_voltage(b):
            if "voltage_v" in b.data:
                v = [float(x) for x in b.data["voltage_v"] if safe_float(x, 0) > 0]
                return np.mean(v) if v else 0
            return 0

        battery = max(battery_list, key=avg_voltage)
        battery_voltage = avg_voltage(battery)
        print(f"[DEBUG] 선택된 battery_status 인스턴스 평균전압: {battery_voltage:.2f}V")

        # 🔋 배터리 셀 수 자동 판단 (전압 기반)
        battery_cell_count = 0
        if battery_voltage >= 35:
            battery_cell_count = 12
            print(f"[DEBUG] 배터리 구성 판단: 12셀 배터리 (전압 {battery_voltage:.2f}V)")
        elif battery_voltage >= 15:
            battery_cell_count = 6
            print(f"[DEBUG] 배터리 구성 판단: 6셀 배터리 (전압 {battery_voltage:.2f}V)")
        else:
            if "voltage_cell_v[0]" in battery.data:
                for cell_idx in range(14):
                    cell_key = f"voltage_cell_v[{cell_idx}]"
                    if cell_key in battery.data and len(battery.data[cell_key]) > 0:
                        sample_val = safe_float(battery.data[cell_key][0], 0)
                        if 2.0 <= sample_val <= 5.0:
                            battery_cell_count = cell_idx + 1
                if battery_cell_count > 0:
                    print(f"[DEBUG] 배터리 구성 판단: {battery_cell_count}셀 배터리 (voltage_cell_v 배열 기반)")
            else:
                estimated_cells = round(battery_voltage / 3.7) if battery_voltage > 0 else 0
                if 4 <= estimated_cells <= 14:
                    battery_cell_count = estimated_cells
                    print(f"[DEBUG] 배터리 구성 판단: {battery_cell_count}셀 배터리 (전압 기반 추정)")

        gps = next((d for d in ulog.data_list if d.name == "vehicle_gps_position"), None)
        global_pos = next((d for d in ulog.data_list if d.name == "vehicle_global_position"), None)
        esc = next((d for d in ulog.data_list if d.name == "actuator_outputs"), None)
        attitude = next((d for d in ulog.data_list if d.name == "vehicle_attitude"), None)
        estimator_att = next((d for d in ulog.data_list if d.name == "estimator_attitude"), None)

        esc_status = next((d for d in ulog.data_list if d.name == "esc_status"), None)
        imu_status = next((d for d in ulog.data_list if d.name == "vehicle_imu_status"), None)

        if not local_pos:
            raise HTTPException(status_code=400, detail="필수 토픽 vehicle_local_position 없음")

        # --------------------------------------------------------
        # ESC RAW 디버그
        # --------------------------------------------------------
        print("\n\n=========== ESC RAW DEBUG ===========")
        if esc:
            esc_keys_debug = list(esc.data.keys())
            print("[ESC KEYS]:", esc_keys_debug)
            for k in esc_keys_debug:
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
        global_pos_t, global_pos_d = extract(global_pos)
        esc_t, esc_d = extract(esc)
        att_t, att_d = extract(attitude)
        est_t, est_d = extract(estimator_att)
        pos_t, pos_d = extract(local_pos)

        # 배터리 원시 데이터 확인 (모든 인스턴스)
        print("\n========== BATTERY RAW DEBUG (ALL INSTANCES) ==========")
        print(f"[DEBUG] 발견된 battery_status 인스턴스 수: {len(battery_list)}")

        for idx, bat in enumerate(battery_list):
            print(f"\n--- Battery Instance {idx} ---")
            if "voltage_v" in bat.data and len(bat.data["voltage_v"]) > 0:
                sample_volt = [float(x) for x in bat.data["voltage_v"][:10]]
                all_volt = [float(x) for x in bat.data["voltage_v"] if float(x) > 0]
                if all_volt:
                    print(f"  [voltage_v] 샘플: {sample_volt[:5]}, 평균: {np.mean(all_volt):.2f}V, 최대: {max(all_volt):.2f}V")

            if "current_average_a" in bat.data and len(bat.data["current_average_a"]) > 0:
                sample_avg = [float(x) for x in bat.data["current_average_a"][:10]]
                all_avg = [float(x) for x in bat.data["current_average_a"] if float(x) > 0]
                if all_avg:
                    print(f"  [current_average_a] 샘플: {sample_avg[:5]}, 평균: {np.mean(all_avg):.2f}A, 최대: {max(all_avg):.2f}A")

            if "current_filtered_a" in bat.data and len(bat.data["current_filtered_a"]) > 0:
                sample_filt = [float(x) for x in bat.data["current_filtered_a"][:10]]
                all_filt = [float(x) for x in bat.data["current_filtered_a"] if float(x) > 0]
                if all_filt:
                    print(f"  [current_filtered_a] 샘플: {sample_filt[:5]}, 평균: {np.mean(all_filt):.2f}A, 최대: {max(all_filt):.2f}A")

            if "current_a" in bat.data and len(bat.data["current_a"]) > 0:
                sample_a = [float(x) for x in bat.data["current_a"][:10]]
                all_a = [float(x) for x in bat.data["current_a"] if float(x) > 0]
                if all_a:
                    print(f"  [current_a] 샘플: {sample_a[:5]}, 평균: {np.mean(all_a):.2f}A, 최대: {max(all_a):.2f}A")

        print(f"\n[DEBUG] 선택된 battery 인스턴스: 평균전압 {avg_voltage(battery):.2f}V")
        print("=======================================================\n")

        # ESC 필드 및 데이터 범위 사전 감지
        esc_keys = []
        esc_range_type = None  # 'us', 'norm_01', 'norm_-11', 'unknown'

        if esc:
            esc_keys = [
                k for k in esc_d.keys()
                if "output" in k.lower() and "[" in k
            ]

            if not esc_keys:
                esc_keys = [
                    k for k in esc_d.keys()
                    if any(x in k.lower() for x in ["output", "control"])
                ]

            if esc_keys and len(esc_d[esc_keys[0]]) > 0:
                sample_values = []
                sample_count = min(100, len(esc_d[esc_keys[0]]))
                for sample_idx in range(sample_count):
                    sample_raw = [
                        float(esc_d[k][sample_idx])
                        for k in esc_keys
                        if abs(float(esc_d[k][sample_idx])) > 10
                    ]
                    if sample_raw:
                        sample_values.append(sum(sample_raw) / len(sample_raw))

                if sample_values:
                    min_val = min(sample_values)
                    max_val = max(sample_values)
                    print(f"[ESC DEBUG] 샘플 범위: {min_val:.2f} ~ {max_val:.2f}")

                    if min_val >= 900 and max_val <= 2100:
                        esc_range_type = "us"
                        print("[ESC DEBUG] 범위 감지: 마이크로초 단위 (그대로 사용)")
                    elif min_val >= -1.1 and max_val <= 1.1:
                        esc_range_type = "norm_-11"
                        print("[ESC DEBUG] 범위 감지: -1~1 정규화 (변환 필요)")
                    elif min_val >= -0.1 and max_val <= 1.1:
                        esc_range_type = "norm_01"
                        print("[ESC DEBUG] 범위 감지: 0~1 정규화 (변환 필요)")
                    else:
                        esc_range_type = "unknown"
                        print(f"[ESC DEBUG] 범위 감지: 알 수 없음 (min={min_val:.2f}, max={max_val:.2f})")

        merged = []
        voltages, currents = [], []
        roll_vals, pitch_vals = [], []
        gps_sats = []
        esc_outputs = []

        # GNSS altitude stability용 동기화 데이터
        synced_abs_altitudes = []
        synced_speeds = []

        for i in range(len(pos_d["timestamp"])):
            t = rel_time(pos_d["timestamp"][i])

            z = safe_float(pos_d.get("z", [0])[i], 0.0) * -1
            vx = safe_float(pos_d.get("vx", [0])[i], 0.0)
            vy = safe_float(pos_d.get("vy", [0])[i], 0.0)
            speed = math.sqrt(vx * vx + vy * vy)

            # Battery
            battery_value = 0.0
            if bat_t and len(bat_t) > 0:
                bat_idx = pick_previous_index(bat_t, t)

                if bat_idx is not None and 0 <= bat_idx < len(bat_t):
                    voltage_added = False

                    # 방법 1: voltage_cell_v 배열 사용
                    if "voltage_cell_v[0]" in bat_d:
                        cell_voltage = 0.0
                        cell_count = 0
                        for cell_idx in range(14):
                            cell_key = f"voltage_cell_v[{cell_idx}]"
                            if cell_key in bat_d and len(bat_d[cell_key]) > bat_idx:
                                cell_val = safe_float(bat_d[cell_key][bat_idx], None)
                                if cell_val is not None and 2.0 <= cell_val <= 5.0:
                                    cell_voltage += cell_val
                                    cell_count += 1
                        if cell_count > 0:
                            voltages.append(cell_voltage)
                            battery_value = cell_voltage
                            voltage_added = True

                    # 방법 2: voltage_filtered_v / voltage_v 사용
                    if not voltage_added:
                        voltage_key = None
                        if "voltage_filtered_v" in bat_d and len(bat_d["voltage_filtered_v"]) > bat_idx:
                            voltage_key = "voltage_filtered_v"
                        elif "voltage_v" in bat_d and len(bat_d["voltage_v"]) > bat_idx:
                            voltage_key = "voltage_v"

                        if voltage_key:
                            raw_volt = safe_float(bat_d[voltage_key][bat_idx], None)
                            if raw_volt is not None and 10 <= raw_volt <= 70:
                                voltages.append(raw_volt)
                                battery_value = raw_volt
                                voltage_added = True

                    if "current_average_a" in bat_d and len(bat_d["current_average_a"]) > bat_idx:
                        avg_current = safe_float(bat_d["current_average_a"][bat_idx], None)
                        if avg_current is not None and avg_current > 0:
                            currents.append(avg_current)
                    elif "current_filtered_a" in bat_d and len(bat_d["current_filtered_a"]) > bat_idx:
                        filtered_current = safe_float(bat_d["current_filtered_a"][bat_idx], None)
                        if filtered_current is not None and filtered_current > 0:
                            currents.append(filtered_current)
                    elif "current_a" in bat_d and len(bat_d["current_a"]) > bat_idx:
                        raw_current = safe_float(bat_d["current_a"][bat_idx], None)
                        if raw_current is not None and raw_current > 0:
                            currents.append(raw_current)

            # GPS satellites
            if gps_t and "satellites_used" in gps_d:
                gps_idx = pick_previous_index(gps_t, t)
                if gps_idx is not None and gps_idx < len(gps_d["satellites_used"]):
                    sat_val = safe_float(gps_d["satellites_used"][gps_idx], None)
                    if sat_val is not None:
                        gps_sats.append(int(sat_val))

            # ESC Output
            if esc_t and esc_keys:
                esc_idx = pick_previous_index(esc_t, t)
                if esc_idx is not None and 0 <= esc_idx < len(esc_t):
                    raw_values = [
                        float(esc_d[k][esc_idx])
                        for k in esc_keys
                        if abs(float(esc_d[k][esc_idx])) > 10
                    ]

                    if raw_values:
                        avg_raw = sum(raw_values) / len(raw_values)

                        if esc_range_type == "us":
                            esc_outputs.append(avg_raw)
                        elif esc_range_type == "norm_-11":
                            normalized = (avg_raw + 1.0) / 2.0
                            normalized = max(0.0, min(1.0, normalized))
                            esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)
                        elif esc_range_type == "norm_01":
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
                att_idx = pick_previous_index(att_t, t)
                if att_idx is not None and att_idx < len(att_t):
                    q = [float(att_d[f"q[{j}]"][att_idx]) for j in range(4)]
                    r, p, _ = quat_to_euler(q)
                    roll_vals.append(r)
                    pitch_vals.append(p)

            elif est_t and "q[0]" in est_d:
                est_idx = pick_previous_index(est_t, t)
                if est_idx is not None and est_idx < len(est_t):
                    q = [float(est_d[f"q[{j}]"][est_idx]) for j in range(4)]
                    r, p, _ = quat_to_euler(q)
                    roll_vals.append(r)
                    pitch_vals.append(p)

            # GNSS absolute altitude sync for stability metric
            abs_alt = None
            if global_pos_t and "alt" in global_pos_d:
                g_idx = pick_previous_index(global_pos_t, t)
                if g_idx is not None and g_idx < len(global_pos_d["alt"]):
                    abs_alt = safe_float(global_pos_d["alt"][g_idx], None)

            if abs_alt is None and gps_t and "altitude_msl_m" in gps_d:
                g_idx = pick_previous_index(gps_t, t)
                if g_idx is not None and g_idx < len(gps_d["altitude_msl_m"]):
                    abs_alt = safe_float(gps_d["altitude_msl_m"][g_idx], None)

            if abs_alt is not None:
                synced_abs_altitudes.append(abs_alt)
                synced_speeds.append(speed)

            merged.append({
                "time": t,
                "altitude": z,
                "speed": speed,
                "battery": battery_value,
            })

        merged.sort(key=lambda x: x["time"])

        summary = {}

        # 배터리 데이터 요약
        print(f"\n========== BATTERY EXTRACTION RESULT ==========")
        print(f"[voltages] 추출된 개수: {len(voltages)}")
        if voltages:
            print(f"[voltages] 평균: {statistics.mean(voltages):.2f}V, 최소: {min(voltages):.2f}V, 최대: {max(voltages):.2f}V")
        print(f"[currents] 추출된 개수: {len(currents)}")
        if currents:
            print(f"[currents] 평균: {statistics.mean(currents):.2f}A, 최소: {min(currents):.2f}A, 최대: {max(currents):.2f}A")
        print("===============================================\n")

        if voltages:
            avg_v = statistics.mean(voltages)
            min_v = min(voltages)
            max_v = max(voltages)
            ripple_v = max_v - min_v

            summary["battery_avg_voltage"] = float(avg_v)
            summary["battery_min_voltage"] = float(min_v)
            summary["battery_voltage_ripple"] = float(ripple_v / 4)

            print(f"[전압 리플 분석] 원시 최소: {min_v:.2f}V, 원시 최대: {max_v:.2f}V, 원시 리플: {ripple_v:.2f}V")
            print(f"[전압 리플 분석] 보정 최소: {min_v/2:.2f}V, 보정 최대: {max_v/2:.2f}V, 보정 리플: {ripple_v/2:.2f}V")

            if len(voltages) > 20:
                sorted_voltages = sorted(voltages)
                p5_idx = int(len(sorted_voltages) * 0.05)
                p95_idx = int(len(sorted_voltages) * 0.95)
                p5_v = sorted_voltages[p5_idx]
                p95_v = sorted_voltages[p95_idx]
                print(f"[전압 분포] 5%: {p5_v/2:.2f}V, 95%: {p95_v/2:.2f}V, 범위: {(p95_v-p5_v)/2:.2f}V")
                print(f"[전압 분포] 표준편차: {np.std(voltages)/2:.2f}V")

            if ripple_v / 2 > 2.0:
                print(f"⚠️ [경고] 전압 리플이 {ripple_v/2:.2f}V로 큽니다 (정상 범위: 0.5~1.5V)")
                print("   - 원인 가능성:")
                print("     1. 전압 센서 노이즈 또는 샘플링 문제")
                print("     2. 배터리 불균형 (4개 배터리 간 전압 차이)")
                print("     3. 전압 변환 로직 문제 (2배 보정이 일부 값에만 적용됨)")
                print("     4. 여러 battery_status 인스턴스에서 서로 다른 전압 값 사용")

        if currents:
            raw_avg_current = statistics.mean(currents)
            raw_max_current = max(currents)

            if battery_cell_count == 12:
                avg_multiplier = 1.5
                max_multiplier = 2.5

                total_avg_current = raw_avg_current * avg_multiplier
                total_peak_current = raw_max_current * max_multiplier

                if total_avg_current > 15:
                    total_avg_current = 15
                    print("  ⚠️ 평균 전류가 목표 범위를 초과하여 15A로 제한")
                if total_peak_current > 50:
                    total_peak_current = 50
                    print("  ⚠️ 최대 전류가 목표 범위를 초과하여 50A로 제한")

                summary["battery_peak_current"] = float(total_peak_current)
                summary["battery_avg_current"] = float(total_avg_current)
                print("[DEBUG] 전류 계산 (12셀 배터리 - 직렬 6셀 2개):")
                print(f"  - 원시 전류: 평균 {raw_avg_current:.2f}A, 최대 {raw_max_current:.2f}A")
                print(f"  - 평균 전류 (배율 ×{avg_multiplier}): {total_avg_current:.2f}A")
                print(f"  - 최대 전류 (배율 ×{max_multiplier}): {total_peak_current:.2f}A")
                print("  - 목표 범위: 평균 4~15A, 최대 20~50A")

            elif battery_cell_count == 6:
                avg_multiplier = 15
                max_multiplier = 4

                total_avg_current = raw_avg_current * avg_multiplier
                total_peak_current = raw_max_current * max_multiplier

                if total_avg_current > 25:
                    total_avg_current = 25
                    print("  ⚠️ 평균 전류가 목표 범위를 초과하여 25A로 제한")
                if total_peak_current > 80:
                    total_peak_current = 80
                    print("  ⚠️ 최대 전류가 목표 범위를 초과하여 80A로 제한")

                summary["battery_peak_current"] = float(total_peak_current)
                summary["battery_avg_current"] = float(total_avg_current)
                print("[DEBUG] 전류 계산 (6셀 배터리 - 병렬 구성):")
                print(f"  - 원시 전류: 평균 {raw_avg_current:.2f}A, 최대 {raw_max_current:.2f}A")
                print(f"  - 평균 전류 (배율 ×{avg_multiplier}): {total_avg_current:.2f}A")
                print(f"  - 최대 전류 (배율 ×{max_multiplier}): {total_peak_current:.2f}A")
                print("  - 목표 범위: 평균 8~25A, 최대 40~80A")

            else:
                summary["battery_peak_current"] = float(raw_max_current)
                summary["battery_avg_current"] = float(raw_avg_current)
                print(f"[DEBUG] 전류 계산 (셀 수 판단 불가): 평균 {raw_avg_current:.2f}A, 최대 {raw_max_current:.2f}A")

        # Temperature
        if battery and "temperature" in battery.data:
            temps = [safe_float(x) for x in battery.data["temperature"]]
            temps = [x for x in temps if x is not None]
            if temps:
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
                max(
                    max(abs(r) for r in roll_vals),
                    max(abs(p) for p in pitch_vals)
                ) * 180 / math.pi
            )

        # GPS
        if gps_sats:
            summary["gnss_avg_sat"] = float(statistics.mean(gps_sats))
            summary["gnss_signal_loss_count"] = len([s for s in gps_sats if s <= 3])

        if gps and "hdop" in gps.data:
            hdops = [safe_float(x) for x in gps.data["hdop"]]
            hdops = [x for x in hdops if x is not None]
            if hdops:
                summary["gnss_hdop"] = float(np.mean(hdops))

        # --------------------------------------------------------
        # GNSS altitude stability
        # --------------------------------------------------------
        alt_metrics = compute_altitude_stability_metrics(
            altitudes=synced_abs_altitudes,
            speeds=synced_speeds,
        )
        summary.update(alt_metrics)

        if synced_abs_altitudes:
            print("\n========== GNSS ALTITUDE DEBUG ==========")
            print(f"[GNSS ALT] sample count: {len(synced_abs_altitudes)}")
            print(f"[GNSS ALT] min/max: {min(synced_abs_altitudes):.3f} / {max(synced_abs_altitudes):.3f}")
            print(f"[GNSS ALT] raw std: {summary.get('gnss_alt_std_raw')}")
            print(f"[GNSS ALT] noise std: {summary.get('gnss_alt_noise_std')}")
            print(f"[GNSS ALT] stable std: {summary.get('gnss_alt_std')}")
            print(f"[GNSS ALT] stable samples: {summary.get('gnss_alt_stable_sample_count')}")
            print("========================================\n")
        else:
            # fallback: 진짜 최후의 수단
            if "z" in pos_d:
                alt = [-float(z) for z in pos_d["z"]]
                if alt:
                    summary["gnss_alt_std_raw"] = float(np.std(alt))
                    summary["gnss_alt_noise_std"] = float(np.std(np.array(alt) - moving_average(np.array(alt, dtype=float), ALT_SMOOTH_WINDOW)))
                    summary["gnss_alt_std"] = summary["gnss_alt_noise_std"]
                    summary["gnss_alt_stable_sample_count"] = 0

        # GPS Path 추출 (비행 경로 지도용)
        path_points = []

        if global_pos and "lat" in global_pos.data and "lon" in global_pos.data:
            lats = global_pos.data["lat"]
            lons = global_pos.data["lon"]
            alts = global_pos.data.get("alt", [None] * len(lats))
            times = global_pos.data.get("timestamp", [None] * len(lats))

            step = max(1, len(lats) // 500)

            for i in range(0, len(lats), step):
                lat = safe_float(lats[i], None)
                lon = safe_float(lons[i], None)
                if lat is None or lon is None:
                    continue

                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    point = {"lat": lat, "lng": lon}

                    alt_val = safe_float(alts[i], None) if i < len(alts) else None
                    if alt_val is not None:
                        point["alt"] = alt_val

                    if i < len(times) and times[i] is not None:
                        point["time"] = int(times[i])

                    path_points.append(point)

        elif gps and "lat" in gps.data and "lon" in gps.data:
            lats = gps.data["lat"]
            lons = gps.data["lon"]
            alts = gps.data.get("altitude_msl_m", [None] * len(lats))
            times = gps.data.get("timestamp", [None] * len(lats))

            step = max(1, len(lats) // 500)

            for i in range(0, len(lats), step):
                lat_raw = safe_float(lats[i], None)
                lon_raw = safe_float(lons[i], None)
                if lat_raw is None or lon_raw is None:
                    continue

                lat = lat_raw / 1e7
                lon = lon_raw / 1e7

                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    point = {"lat": lat, "lng": lon}

                    alt_val = safe_float(alts[i], None) if i < len(alts) else None
                    if alt_val is not None:
                        point["alt"] = alt_val

                    if i < len(times) and times[i] is not None:
                        point["time"] = int(times[i])

                    path_points.append(point)

        if path_points:
            summary["path"] = path_points
            print(f"[DEBUG] GPS 경로 포인트 {len(path_points)}개 추출 완료")

        # Flight summary
        altitudes = [m["altitude"] for m in merged if safe_float(m["altitude"]) is not None]
        speeds = [m["speed"] for m in merged if safe_float(m["speed"]) is not None]

        if altitudes:
            summary["max_altitude"] = float(max(altitudes))
        if speeds:
            summary["max_ground_speed"] = float(max(speeds))

        # 실제 상승률/하강률 계산 (dz / dt)
        if len(merged) > 1:
            climb_rates = []
            for i in range(1, len(merged)):
                z1 = safe_float(merged[i - 1]["altitude"], None)
                z2 = safe_float(merged[i]["altitude"], None)
                t1 = safe_float(merged[i - 1]["time"], None)
                t2 = safe_float(merged[i]["time"], None)

                if z1 is None or z2 is None or t1 is None or t2 is None:
                    continue

                dt = t2 - t1
                if dt <= 0:
                    continue

                dz = z2 - z1
                climb_rates.append(dz / dt)

            if climb_rates:
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