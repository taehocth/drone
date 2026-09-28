"""
app/cbm/inference.py  (14-feature 배포 버전)

역할:
  1. 서버 시작 시 drone_id별 CNN-LSTM 모델 + 정규화 통계 로드
  2. collector.py 의 슬라이딩 윈도우(20, 14)를 받아 추론
  3. 드론별 상태 유지형 판정: fail_count(연속 초과) + CUSUM(누적) + severe(심각도 가중 즉시 확정)
  4. 탐지 결과를 evaluator.py / cbm_ws.py 가 사용할 수 있는 형태로 반환

[14피처 구성] collector.AI_FEATURE_COLS 와 동일 순서
  new 0  volt            new 1  current
  new 2~4  att_cmd yaw/pitch/roll     new 5~7  att_state yaw/pitch/roll
  new 8~11 pwm_dev1~4 (모터 출력 편차 = 각 모터 − 4모터 평균)
  new 12   accel_vib_metric  new 13  gyro_vib_metric  (PX4 VIBRATION)

[판정 로직 — 사고 로그(2026-09-11) 리플레이로 검증된 설정]
  - fail_count: 임계 초과가 N회 연속. 기존 피처 10회, 파생(pwm_dev·진동) 5회
  - severe fast path: 파생 피처가 임계의 2배 이상을 2회 연속 → 즉시 확정
    (리플레이: 확정 경보 841→837초로 단축, 정상 비행 오탐 0 유지)
  - CUSUM: 임계 아래의 지속 이탈 누적 (기존과 동일)
  - 알람에 모터 물리 위치(position) 포함 → 화면에 "후방 우측 모터" 로 표시

[유지] volt 는 6S/12S 혼재로 AI 제외(규칙 기반 담당). 셀당 전압 라운드 후 복귀 검토.
"""

from __future__ import annotations

import pickle
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from app.cbm.collector import get_window, reset_window, get_missing_features, AI_FEATURE_COLS, MOTOR_POSITION

# ── 모델 기본 경로 ──────────────────────────────────────
_BASE = Path(__file__).parent / "models"

DRONE_MODEL_MAP = {
    "drone-001": (_BASE / "UNIFIED" / "UNIFIED_best_model.pth", _BASE / "UNIFIED" / "UNIFIED_stats.pkl"),
    "drone-002": (_BASE / "UNIFIED" / "UNIFIED_best_model.pth", _BASE / "UNIFIED" / "UNIFIED_stats.pkl"),
    "drone-003": (_BASE / "UNIFIED" / "UNIFIED_best_model.pth", _BASE / "UNIFIED" / "UNIFIED_stats.pkl"),
    "drone-004": (_BASE / "UNIFIED" / "UNIFIED_best_model.pth", _BASE / "UNIFIED" / "UNIFIED_stats.pkl"),
}

# ── 이상 탐지 파라미터 ──────────────────────────────────
DETECT_FAIL_CNT  = 10     # 기존 피처(전원·자세) 연속 초과 횟수
DERIVED_FAIL_CNT = 5      # 파생 피처(pwm_dev·진동) 연속 초과 횟수 — 리플레이 검증값
CUSUM_THRESHOLD  = 30.0
CUSUM_DRIFT      = 0.25
CUSUM_MU0_MARGIN = 3.0

# severe fast path (파생 피처 전용): 임계 × SEVERE_MULT 이상이 SEVERE_FAIL_CNT 회 연속 → 즉시 확정
SEVERE_MULT     = 2.0
SEVERE_FAIL_CNT = 2

# ── 피처 이름 (AI_FEATURE_COLS 순서) ────────────────────
FEATURE_NAMES = [
    "volt", "current",
    "att_cmd_yaw", "att_cmd_pitch", "att_cmd_roll",
    "att_state_yaw", "att_state_pitch", "att_state_roll",
    "pwm_dev1", "pwm_dev2", "pwm_dev3", "pwm_dev4",
    "accel_vib_metric", "gyro_vib_metric",
]

# yaw unwrap 대상 (새 인덱스)
YAW_COLS_NEW = [AI_FEATURE_COLS.index(5), AI_FEATURE_COLS.index(8)]  # = [2, 5]

# ── AI 탐지 제외 피처 ───────────────────────────────────
AI_DISABLED_FEATURES = {"volt"}

# ── 피처별 fail_count 임계값 override (없으면 자동값 rmse+sig) ──
#   기존 8개는 배포본 실측 튠 유지. 파생 피처는 자동값 사용 (리플레이에서 원안 임계로 검증됨).
FAIL_THRESHOLDS_OVERRIDE = {
    0: 0.8,    # volt (AI 제외 — 참고)
    1: 0.5,    # current
    2: 1.2,    # att_cmd_yaw
    3: 0.6,    # att_cmd_pitch
    4: 0.6,    # att_cmd_roll
    5: 1.2,    # att_state_yaw
    6: 0.6,    # att_state_pitch
    7: 0.6,    # att_state_roll
}

# ── 피처별 CUSUM 기준선 배수 ────────────────────────────
FEATURE_MU0_MULT = {
    "volt": 2.0, "current": 2.0,
    "att_cmd_yaw": 1.4, "att_cmd_pitch": 1.4, "att_cmd_roll": 1.4,
    "att_state_yaw": 1.4, "att_state_pitch": 1.4, "att_state_roll": 1.4,
    "pwm_dev1": 1.4, "pwm_dev2": 1.4, "pwm_dev3": 1.4, "pwm_dev4": 1.4,
    "accel_vib_metric": 1.4, "gyro_vib_metric": 1.4,
}

# ── 피처별 (시스템, 메시지) ──────────────────────────────
FEATURE_MESSAGES = {
    "volt":             ("Power",     "전압 이상 감지"),
    "current":          ("Power",     "전류 이상 감지"),
    "att_cmd_yaw":      ("Flight",    "Yaw 명령 이상"),
    "att_cmd_pitch":    ("Flight",    "Pitch 명령 이상"),
    "att_cmd_roll":     ("Flight",    "Roll 명령 이상"),
    "att_state_yaw":    ("Flight",    "Yaw 상태 이상"),
    "att_state_pitch":  ("Flight",    "Pitch 상태 이상"),
    "att_state_roll":   ("Flight",    "Roll 상태 이상"),
    "pwm_dev1":         ("Motor",     f"모터1({MOTOR_POSITION[1]}) 출력 편차 이상"),
    "pwm_dev2":         ("Motor",     f"모터2({MOTOR_POSITION[2]}) 출력 편차 이상"),
    "pwm_dev3":         ("Motor",     f"모터3({MOTOR_POSITION[3]}) 출력 편차 이상"),
    "pwm_dev4":         ("Motor",     f"모터4({MOTOR_POSITION[4]}) 출력 편차 이상"),
    "accel_vib_metric": ("Vibration", "가속도 진동 이상 (결합부·프롭 점검)"),
    "gyro_vib_metric":  ("Vibration", "자이로 진동 이상 (결합부·프롭 점검)"),
}


def _is_derived(name: str) -> bool:
    return name.startswith(("pwm_dev", "accel_vib", "gyro_vib"))


def _fail_cnt_for(name: str) -> int:
    return DERIVED_FAIL_CNT if _is_derived(name) else DETECT_FAIL_CNT


def _position_for(name: str) -> Optional[str]:
    if name.startswith("pwm_dev"):
        try:
            return MOTOR_POSITION.get(int(name[-1]))
        except ValueError:
            return None
    return None


# ════════════════════════════════════════════════════════
# CNN-LSTM 모델
# ════════════════════════════════════════════════════════
class CNNLSTM(nn.Module):
    def __init__(self, win_s, num_features, output_dim,
                 filter_size=(3, 1), num_filters=32, lstm_hidden=128):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, num_filters, kernel_size=filter_size, padding="same"),
            nn.ReLU(),
            nn.Conv2d(num_filters, num_filters * 2, kernel_size=filter_size, padding="same"),
            nn.ReLU(),
        )
        self.lstm_input_size = num_filters * 2 * num_features
        self.lstm = nn.LSTM(input_size=self.lstm_input_size, hidden_size=lstm_hidden, batch_first=True)
        self.fc = nn.Linear(lstm_hidden, output_dim)

    def forward(self, x):
        x = x.unsqueeze(1)
        x = self.conv(x)
        b, C, T, F = x.shape
        x = x.permute(0, 2, 1, 3).contiguous().view(b, T, C * F)
        _, (hn, _) = self.lstm(x)
        return self.fc(hn[-1])


# ════════════════════════════════════════════════════════
# 드론별 상태
# ════════════════════════════════════════════════════════
class _DroneState:
    def __init__(self, num_features, cusum_mu0):
        self.n = num_features
        self.err_mu0 = np.array(cusum_mu0, dtype=np.float32)
        self.fail_cnt   = np.zeros(num_features, dtype=np.int32)
        self.severe_cnt = np.zeros(num_features, dtype=np.int32)
        self.S = np.zeros((1, num_features), dtype=np.float32)

    def reset(self):
        self.fail_cnt[:]   = 0
        self.severe_cnt[:] = 0
        self.S[:]          = 0.0


class _ModelBundle:
    def __init__(self, model, device, mu, sig, win_s, n_feat, n_out,
                 rmse_train, thresholds, cusum_mu0):
        self.model      = model
        self.device     = device
        self.mu         = mu
        self.sig        = sig
        self.win_s      = win_s
        self.n_feat     = n_feat
        self.n_out      = n_out
        self.rmse_train = rmse_train
        self.thresholds = thresholds
        self.cusum_mu0  = cusum_mu0


def _load_bundle(model_path: Path, pkl_path: Path, label: str) -> Optional[_ModelBundle]:
    if not model_path.exists():
        print(f"[inference] ❌ 모델 파일 없음: {model_path}")
        return None
    if not pkl_path.exists():
        print(f"[inference] ❌ pkl 파일 없음: {pkl_path}")
        return None

    try:
        with open(pkl_path, "rb") as f:
            stats = pickle.load(f)

        mu  = np.array(stats["mu"]).squeeze()
        sig = np.array(stats["sig"]).squeeze()
        sig[sig == 0] = 1e-7
        win_s  = int(stats["win_s"])
        n_feat = mu.shape[0]

        train_cols = stats.get("feature_cols")
        if train_cols is not None and list(train_cols) != list(AI_FEATURE_COLS):
            print(f"[inference] ⚠️ feature_cols 불일치! 학습={train_cols} vs collector={AI_FEATURE_COLS}")
        if n_feat != len(AI_FEATURE_COLS):
            print(f"[inference] ⚠️ 피처 수 불일치! stats={n_feat} vs collector={len(AI_FEATURE_COLS)}")

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        ckpt   = torch.load(model_path, map_location=device, weights_only=False)

        n_out = ckpt["model_state_dict"]["fc.weight"].shape[0]
        model = CNNLSTM(win_s=win_s, num_features=n_feat, output_dim=n_out).to(device)
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()

        rmse_train = np.array(ckpt["rmse_train_list"], dtype=np.float32)
        min_len    = min(len(rmse_train), len(sig))

        thresholds = rmse_train[:min_len] + sig[:min_len]
        for feat_idx, override_val in FAIL_THRESHOLDS_OVERRIDE.items():
            if feat_idx < min_len:
                thresholds[feat_idx] = override_val

        cusum_mu0 = (rmse_train[:min_len] / sig[:min_len] * CUSUM_MU0_MARGIN).astype(np.float32)
        for feat_idx in range(min_len):
            fname = FEATURE_NAMES[feat_idx] if feat_idx < len(FEATURE_NAMES) else None
            cusum_mu0[feat_idx] *= FEATURE_MU0_MULT.get(fname, 1.0) if fname else 1.0

        print(f"[inference] ✅ [{label}] 모델 로드 완료 win_s={win_s} n_feat={n_feat} n_out={n_out}")
        print(f"[inference]    임계값: " + ", ".join(
            f"{FEATURE_NAMES[i]}={thresholds[i]:.3f}" for i in range(min(min_len, len(FEATURE_NAMES)))))
        return _ModelBundle(model, device, mu, sig, win_s, n_feat, n_out,
                            rmse_train, thresholds, cusum_mu0)

    except Exception as e:
        print(f"[inference] ❌ [{label}] 로드 실패: {e}")
        return None


# ════════════════════════════════════════════════════════
# 추론 엔진 (싱글턴)
# ════════════════════════════════════════════════════════
class InferenceEngine:
    def __init__(self):
        self._bundles: Dict[str, _ModelBundle] = {}
        self._drone_states: Dict[str, _DroneState] = {}
        self._last_errors: Dict[str, dict] = {}   # 화면 표시용 최근 오차 (feature → err/threshold)
        self._load_all()

    def _load_all(self):
        for drone_id, (model_path, pkl_path) in DRONE_MODEL_MAP.items():
            bundle = _load_bundle(model_path, pkl_path, drone_id)
            if bundle:
                self._bundles[drone_id] = bundle

    def _get_bundle(self, drone_id: str) -> Optional[_ModelBundle]:
        return self._bundles.get(drone_id)

    @property
    def ready(self) -> bool:
        return bool(self._bundles)

    def _get_state(self, drone_id: str, bundle: _ModelBundle) -> _DroneState:
        if drone_id not in self._drone_states:
            self._drone_states[drone_id] = _DroneState(
                num_features=bundle.n_feat,
                cusum_mu0=bundle.cusum_mu0.tolist(),
            )
        return self._drone_states[drone_id]

    @staticmethod
    def _fix_yaw(X):
        X = X.copy()
        for col in YAW_COLS_NEW:
            if col >= X.shape[1]:
                continue
            sign = X[0, col] >= 0
            for j in range(1, X.shape[0]):
                if not sign and X[j, col] > 0:
                    t = X[j, col] - 2 * np.pi
                    if abs(X[j, col] - X[j-1, col]) > abs(t - X[j-1, col]):
                        X[j, col] = t
                elif sign and X[j, col] < 0:
                    t = X[j, col] + 2 * np.pi
                    if abs(X[j, col] - X[j-1, col]) > abs(t - X[j-1, col]):
                        X[j, col] = t
        return X

    @staticmethod
    def _make_alert(feat_name: str, level: str, method: str, err: float, thr: float, extra: dict = None) -> dict:
        system, msg = FEATURE_MESSAGES.get(feat_name, ("Unknown", f"{feat_name} 이상"))
        alert = {
            "system":    system,
            "level":     level,
            "source":    "cnn_lstm",
            "method":    method,
            "feature":   feat_name,
            "msg":       msg,
            "err":       round(float(err), 6),
            "threshold": round(float(thr), 6),
        }
        pos = _position_for(feat_name)
        if pos:
            alert["position"] = pos
        if extra:
            alert.update(extra)
        return alert

    def run(self, drone_id: str) -> List[dict]:
        bundle = self._get_bundle(drone_id)
        if bundle is None:
            return []

        window = get_window(drone_id)   # (20, 14)
        if window is None:
            return []

        state = self._get_state(drone_id, bundle)

        window_fixed = self._fix_yaw(window)
        x_norm       = (window_fixed - bundle.mu) / bundle.sig

        y_true_norm = torch.tensor(x_norm[-1], dtype=torch.float32)
        x_tensor    = torch.tensor(x_norm, dtype=torch.float32).unsqueeze(0).to(bundle.device)

        with torch.no_grad():
            y_pred_norm = bundle.model(x_tensor).squeeze(0).cpu()

        y_pred   = y_pred_norm.numpy() * bundle.sig[:bundle.n_out] + bundle.mu[:bundle.n_out]
        y_true   = y_true_norm.numpy() * bundle.sig[:bundle.n_out] + bundle.mu[:bundle.n_out]
        err      = np.abs(y_pred - y_true)
        err_norm = np.abs(y_pred_norm.numpy() - y_true_norm.numpy())

        alerts: List[dict] = []
        n = min(bundle.n_out, bundle.n_feat)
        thresholds = bundle.thresholds[:n]
        # 텔레메트리 미수신 피처는 이번 판정에서 제외 (0 으로 채워진 입력의 오차로 오탐 방지)
        skip = set(AI_DISABLED_FEATURES) | get_missing_features(drone_id)

        # 화면 표시용 최근 오차 저장
        self._last_errors[drone_id] = {
            FEATURE_NAMES[j]: {"err": round(float(err[j]), 4), "threshold": round(float(thresholds[j]), 4)}
            for j in range(min(n, len(FEATURE_NAMES)))
        }

        # ── fail_count + severe fast path ─────────────────
        for j in range(n):
            name = FEATURE_NAMES[j] if j < len(FEATURE_NAMES) else f"feature_{j}"
            if name in skip:
                state.fail_cnt[j] = 0
                state.severe_cnt[j] = 0
                continue

            over = err[j] >= thresholds[j]
            if over:
                state.fail_cnt[j] += 1
                if state.fail_cnt[j] >= _fail_cnt_for(name):
                    alerts.append(self._make_alert(name, "danger", "fail_count", err[j], thresholds[j]))
                    print(f"[CBM-DIAG] 🚨 fail_count 알람: {name} err={float(err[j]):.4f} thr={float(thresholds[j]):.4f}")
                    state.fail_cnt[j] = 0
            else:
                state.fail_cnt[j] = 0

            # severe: 파생 피처가 임계의 SEVERE_MULT배 이상을 SEVERE_FAIL_CNT회 연속
            if _is_derived(name):
                if err[j] >= SEVERE_MULT * thresholds[j]:
                    state.severe_cnt[j] += 1
                    if state.severe_cnt[j] >= SEVERE_FAIL_CNT:
                        if not any(a["feature"] == name for a in alerts):
                            alerts.append(self._make_alert(name, "danger", "severe", err[j], thresholds[j],
                                                           {"severity_ratio": round(float(err[j] / max(thresholds[j], 1e-9)), 2)}))
                            print(f"[CBM-DIAG] 🚨 severe 알람: {name} err={float(err[j]):.4f} = {float(err[j]/max(thresholds[j],1e-9)):.1f}× thr")
                        state.severe_cnt[j] = 0
                        state.fail_cnt[j] = 0
                else:
                    state.severe_cnt[j] = 0

        # ── CUSUM (정규화 스케일) ─────────────────────────
        err_norm_arr = err_norm[:n].reshape(1, n)
        mu0          = bundle.cusum_mu0[:n]
        state.S      = np.maximum(0, state.S + (err_norm_arr - mu0 - CUSUM_DRIFT))
        cusum_flags  = (state.S > CUSUM_THRESHOLD).squeeze(0)

        for j in range(n):
            name = FEATURE_NAMES[j] if j < len(FEATURE_NAMES) else f"feature_{j}"
            if name in skip:
                state.S[0, j] = 0.0
                continue
            if cusum_flags[j]:
                if not any(a["feature"] == name for a in alerts):
                    alerts.append(self._make_alert(name, "warning", "cusum", err[j], thresholds[j],
                                                   {"cusum": round(float(state.S[0, j]), 4)}))
                    print(f"[CBM-DIAG] ⚠️ CUSUM 알람: {name} S={float(state.S[0, j]):.3f}")
                state.S[0, j] = 0.0

        return alerts

    def reset(self, drone_id: str) -> None:
        if drone_id in self._drone_states:
            self._drone_states[drone_id].reset()
        reset_window(drone_id)
        self._last_errors.pop(drone_id, None)
        print(f"[inference] {drone_id} 상태 초기화 완료")

    def reset_all(self) -> None:
        for state in self._drone_states.values():
            state.reset()

    def get_cusum_values(self, drone_id: str) -> Optional[dict]:
        state  = self._drone_states.get(drone_id)
        bundle = self._get_bundle(drone_id)
        if state is None or bundle is None:
            return None
        return {FEATURE_NAMES[i]: float(state.S[0, i])
                for i in range(min(bundle.n_out, len(FEATURE_NAMES)))}

    def get_fail_counts(self, drone_id: str) -> Optional[dict]:
        state  = self._drone_states.get(drone_id)
        bundle = self._get_bundle(drone_id)
        if state is None or bundle is None:
            return None
        return {FEATURE_NAMES[i]: int(state.fail_cnt[i])
                for i in range(min(bundle.n_out, len(FEATURE_NAMES)))}

    def get_last_errors(self, drone_id: str) -> Optional[dict]:
        """화면 표시용: 피처별 최근 예측 오차와 임계값."""
        return self._last_errors.get(drone_id)


_engine: Optional[InferenceEngine] = None

def get_inference_engine() -> InferenceEngine:
    global _engine
    if _engine is None:
        _engine = InferenceEngine()
    return _engine