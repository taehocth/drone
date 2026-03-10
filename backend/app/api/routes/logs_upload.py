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
# 고도 표준편차: 호버링 구간만 추출
# --------------------------------------------------------
def calc_hovering_alt_std(altitudes: list[float], min_hover_alt_m: float = 1.5) -> float | None:
    """
    이륙/착륙 구간을 제외하고 실제 비행(호버링) 중 고도 안정성을 계산합니다.

    전략:
    1. min_hover_alt_m 이상인 구간만 사용 (지상/이착륙 제외)
    2. 상대고도 사용 (MSL 절대값이 아닌, 해당 구간 내 편차만 측정)
    3. 이상치(outlier) 제거: IQR 방식으로 상/하위 5% 제거
    """
    if not altitudes or len(altitudes) < 10:
        return None

    # 1) 이착륙 구간 제외: min_hover_alt_m 이상인 값만 사용
    hover_alts = [a for a in altitudes if a >= min_hover_alt_m]

    if len(hover_alts) < 10:
        # 호버링 구간이 너무 짧으면 전체 사용 (짧은 비행)
        hover_alts = altitudes

    # 2) 이상치 제거 (상/하위 5%)
    if len(hover_alts) > 20:
        sorted_alts = sorted(hover_alts)
        p5 = int(len(sorted_alts) * 0.05)
        p95 = int(len(sorted_alts) * 0.95)
        hover_alts = sorted_alts[p5:p95]

    if len(hover_alts) < 5:
        return None

    return float(np.std(hover_alts))


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
        # ============== Battery 인스턴스 자동 선택 ==============
        battery_list = [d for d in ulog.data_list if d.name == "battery_status"]

        if not battery_list:
            raise HTTPException(status_code=400, detail="battery_status 토픽 없음")

        # 각 인스턴스의 평균 전압 계산하여 가장 정상적인 배터리 선택
        def avg_voltage(b):
            if "voltage_v" in b.data:
                v = [float(x) for x in b.data["voltage_v"] if x > 0]
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
                        sample_val = float(battery.data[cell_key][0]) if len(battery.data[cell_key]) > 0 else 0
                        if 2.0 <= sample_val <= 5.0:
                            battery_cell_count = cell_idx + 1
                if battery_cell_count > 0:
                    print(f"[DEBUG] 배터리 구성 판단: {battery_cell_count}셀 배터리 (voltage_cell_v 배열 기반)")
            else:
                estimated_cells = round(battery_voltage / 3.7)
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

        # 🔍 ESC 필드 및 데이터 범위 사전 감지
        esc_keys = []
        esc_range_type = None
        
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
                        esc_range_type = 'us'
                        print("[ESC DEBUG] 범위 감지: 마이크로초 단위 (그대로 사용)")
                    elif min_val >= -1.1 and max_val <= 1.1:
                        esc_range_type = 'norm_-11'
                        print("[ESC DEBUG] 범위 감지: -1~1 정규화 (변환 필요)")
                    elif min_val >= -0.1 and max_val <= 1.1:
                        esc_range_type = 'norm_01'
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
                                voltage_added = True
                    
                    if "current_average_a" in bat_d and len(bat_d["current_average_a"]) > bat_idx:
                        avg_current = float(bat_d["current_average_a"][bat_idx])
                        if avg_current > 0:
                            currents.append(avg_current)
                    elif "current_filtered_a" in bat_d and len(bat_d["current_filtered_a"]) > bat_idx:
                        filtered_current = float(bat_d["current_filtered_a"][bat_idx])
                        if filtered_current > 0:
                            currents.append(filtered_current)
                    elif "current_a" in bat_d and len(bat_d["current_a"]) > bat_idx:
                        raw_current = float(bat_d["current_a"][bat_idx])
                        if raw_current > 0:
                            currents.append(raw_current)

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
                if total_peak_current > 50:
                    total_peak_current = 50
                
                summary["battery_peak_current"] = float(total_peak_current)
                summary["battery_avg_current"] = float(total_avg_current)
                print(f"[DEBUG] 전류 계산 (12셀): 평균 {total_avg_current:.2f}A, 최대 {total_peak_current:.2f}A")
            elif battery_cell_count == 6:
                avg_multiplier = 15
                max_multiplier = 4
                
                total_avg_current = raw_avg_current * avg_multiplier
                total_peak_current = raw_max_current * max_multiplier
                
                if total_avg_current > 25:
                    total_avg_current = 25
                if total_peak_current > 80:
                    total_peak_current = 80
                
                summary["battery_peak_current"] = float(total_peak_current)
                summary["battery_avg_current"] = float(total_avg_current)
                print(f"[DEBUG] 전류 계산 (6셀): 평균 {total_avg_current:.2f}A, 최대 {total_peak_current:.2f}A")
            else:
                summary["battery_peak_current"] = float(raw_max_current)
                summary["battery_avg_current"] = float(raw_avg_current)
                print(f"[DEBUG] 전류 계산 (셀 수 판단 불가): 평균 {raw_avg_current:.2f}A, 최대 {raw_max_current:.2f}A")

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

        # ✅ 고도 표준편차: 상대고도(local_position.z) 기준, 호버링 구간만 사용
        #
        # 기존 문제:
        #   vehicle_global_position.alt = MSL 절대고도 (예: 해발 110m)
        #   → 이착륙 포함 전체 구간의 std → 수십 미터 편차 발생
        #
        # 수정:
        #   vehicle_local_position.z(반전) = 이륙 지점 기준 상대고도
        #   → 호버링 구간(1.5m 이상)만 추출 후 이상치 제거 → 실제 고도 유지 능력 측정
        alt_std_computed = False

        # 우선: local_position의 상대고도 사용 (가장 정확)
        if "z" in pos_d:
            rel_altitudes = [-float(z) for z in pos_d["z"]]
            hover_std = calc_hovering_alt_std(rel_altitudes, min_hover_alt_m=1.5)
            if hover_std is not None:
                summary["gnss_alt_std"] = hover_std
                alt_std_computed = True
                print(f"[ALT STD] local_position 상대고도 기준: {hover_std:.3f}m "
                      f"(호버링 구간 {len([a for a in rel_altitudes if a >= 1.5])}개 샘플)")

        # fallback: vehicle_global_position (MSL이지만 없는 것보다는 나음)
        if not alt_std_computed and global_pos and "alt" in global_pos.data:
            msl_alts = [float(alt) for alt in global_pos.data["alt"] if alt is not None]
            # MSL이라도 호버링 구간 분리 시도 (최솟값 + 1.5m 이상)
            if msl_alts:
                ground_level = min(msl_alts)
                rel_alts_from_msl = [a - ground_level for a in msl_alts]
                hover_std = calc_hovering_alt_std(rel_alts_from_msl, min_hover_alt_m=1.5)
                if hover_std is not None:
                    summary["gnss_alt_std"] = hover_std
                    alt_std_computed = True
                    print(f"[ALT STD] global_position MSL 기준(보정): {hover_std:.3f}m")

        # GPS Path 추출 (비행 경로 지도용)
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