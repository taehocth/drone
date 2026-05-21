"""
app/cbm/inference.py

역할:
  1. 서버 시작 시 CNN-LSTM 모델 + 정규화 통계(mu, sig) 1회 로드
  2. collector.py 의 슬라이딩 윈도우(20, 27)를 받아 추론
  3. 드론별 상태 유지형 CUSUM + fail count 로 이상 탐지
  4. 탐지 결과를 evaluator.py 가 사용할 수 있는 형태로 반환
"""

from __future__ import annotations

import os
import pickle
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from app.cbm.collector import get_window, reset_window

# ── 모델 / pkl 파일 경로 ────────────────────────────────
_BASE = Path(__file__).parent / "models"
MODEL_PATH = _BASE / "quadNormal_best_model.pth"
PKL_PATH   = _BASE / "quadNormal_retrained_stats.pkl"

# ── 이상 탐지 파라미터 ──────────────────────────────────
DETECT_FAIL_CNT = 5        # 연속 임계 초과 횟수 → 이상 판정
CUSUM_THRESHOLD = 10.0     # CUSUM 누적합 임계값
CUSUM_DRIFT     = 0.03     # CUSUM drift (bias)

# ── 피처별 fail count 임계값 (detectFailure.py 원본 기준) ──
# 지정되지 않은 피처는 RMSE + sigma 자동 계산값 사용
FAIL_THRESHOLDS_OVERRIDE = {
    0:  0.4,    # volt
    1:  0.05,   # current
    11: 0.01,   # esti_gyro_bias_x
    12: 0.01,   # esti_gyro_bias_y
    13: 0.01,   # esti_gyro_bias_z
    17: 0.3,    # sensor_gyro_x
    18: 0.3,    # sensor_gyro_y
    19: 0.3,    # sensor_gyro_z
    20: 0.3,    # sensor_accel_x
    21: 0.3,    # sensor_accel_y
    22: 0.3,    # sensor_accel_z
}

# ── 피처 이름 ───────────────────────────────────────────
FEATURE_NAMES = [
    "volt", "current",
    "esti_gps_pos_north", "esti_gps_pos_east", "esti_gps_pos_down",
    "att_cmd_yaw", "att_cmd_pitch", "att_cmd_roll",
    "att_state_yaw", "att_state_pitch", "att_state_roll",
    "esti_gyro_bias_x", "esti_gyro_bias_y", "esti_gyro_bias_z",
    "esti_accel_bias_x", "esti_accel_bias_y", "esti_accel_bias_z",
    "sensor_gyro_x", "sensor_gyro_y", "sensor_gyro_z",
    "sensor_accel_x", "sensor_accel_y", "sensor_accel_z",
    "pwm1", "pwm2", "pwm3", "pwm4",
]

# ── 피처별 이상 메시지 ───────────────────────────────────
FEATURE_MESSAGES = {
    "volt":               ("Power",  "전압 이상 감지"),
    "current":            ("Power",  "전류 이상 감지"),
    "esti_gps_pos_north": ("GPS",    "GPS North 위치 이상"),
    "esti_gps_pos_east":  ("GPS",    "GPS East 위치 이상"),
    "esti_gps_pos_down":  ("GPS",    "GPS Down 위치 이상"),
    "att_cmd_yaw":        ("Flight", "Yaw 명령 이상"),
    "att_cmd_pitch":      ("Flight", "Pitch 명령 이상"),
    "att_cmd_roll":       ("Flight", "Roll 명령 이상"),
    "att_state_yaw":      ("Flight", "Yaw 상태 이상"),
    "att_state_pitch":    ("Flight", "Pitch 상태 이상"),
    "att_state_roll":     ("Flight", "Roll 상태 이상"),
    "esti_gyro_bias_x":   ("EKF",   "Gyro Bias X 이상"),
    "esti_gyro_bias_y":   ("EKF",   "Gyro Bias Y 이상"),
    "esti_gyro_bias_z":   ("EKF",   "Gyro Bias Z 이상"),
    "esti_accel_bias_x":  ("EKF",   "Accel Bias X 이상"),
    "esti_accel_bias_y":  ("EKF",   "Accel Bias Y 이상"),
    "esti_accel_bias_z":  ("EKF",   "Accel Bias Z 이상"),
    "sensor_gyro_x":      ("Gyro",  "Gyro X 각속도 이상"),
    "sensor_gyro_y":      ("Gyro",  "Gyro Y 각속도 이상"),
    "sensor_gyro_z":      ("Gyro",  "Gyro Z 각속도 이상"),
    "sensor_accel_x":     ("Accel", "Accel X 가속도 이상"),
    "sensor_accel_y":     ("Accel", "Accel Y 가속도 이상"),
    "sensor_accel_z":     ("Accel", "Accel Z 가속도 이상"),
    "pwm1":               ("Motor", "Motor 1 PWM 이상"),
    "pwm2":               ("Motor", "Motor 2 PWM 이상"),
    "pwm3":               ("Motor", "Motor 3 PWM 이상"),
    "pwm4":               ("Motor", "Motor 4 PWM 이상"),
}


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


class _DroneState:
    def __init__(self, num_features, rmse_train):
        self.n = num_features
        self.err_mu0 = np.array(rmse_train, dtype=np.float32)
        self.fail_cnt     = np.zeros(num_features, dtype=np.int32)
        self.pre_fail_cnt = np.zeros(num_features, dtype=np.int32)
        self.S = np.zeros((1, num_features), dtype=np.float32)

    def reset(self):
        self.fail_cnt[:]     = 0
        self.pre_fail_cnt[:] = 0
        self.S[:]            = 0.0


class InferenceEngine:
    def __init__(self):
        self._ready   = False
        self._model   = None
        self._device  = None
        self._mu      = None
        self._sig     = None
        self._win_s   = None
        self._n_feat  = None
        self._n_out   = None
        self._thresholds = None
        self._rmse_train = None
        self._drone_states: Dict[str, _DroneState] = {}
        self._load()

    def _load(self):
        if not MODEL_PATH.exists():
            print(f"[inference] ❌ 모델 파일 없음: {MODEL_PATH}")
            return
        if not PKL_PATH.exists():
            print(f"[inference] ❌ pkl 파일 없음: {PKL_PATH}")
            return

        try:
            with open(PKL_PATH, "rb") as f:
                stats = pickle.load(f)

            mu  = np.array(stats["mu"]).squeeze()
            sig = np.array(stats["sig"]).squeeze()
            sig[sig == 0] = 1e-7
            win_s  = int(stats["win_s"])
            n_feat = mu.shape[0]

            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            ckpt   = torch.load(MODEL_PATH, map_location=device, weights_only=False)

            n_out = ckpt["model_state_dict"]["fc.weight"].shape[0]
            model = CNNLSTM(win_s=win_s, num_features=n_feat, output_dim=n_out).to(device)
            model.load_state_dict(ckpt["model_state_dict"])
            model.eval()

            rmse_train = np.array(ckpt["rmse_train_list"], dtype=np.float32)

            # ── 피처별 임계값: 원본 값 우선, 나머지는 RMSE+sigma ──
            min_len    = min(len(rmse_train), len(sig))
            thresholds = rmse_train[:min_len] + sig[:min_len]
            for feat_idx, override_val in FAIL_THRESHOLDS_OVERRIDE.items():
                if feat_idx < min_len:
                    thresholds[feat_idx] = override_val

            self._model      = model
            self._device     = device
            self._mu         = mu
            self._sig        = sig
            self._win_s      = win_s
            self._n_feat     = n_feat
            self._n_out      = n_out
            self._thresholds = thresholds
            self._rmse_train = rmse_train
            self._ready      = True

            print(f"[inference] ✅ 모델 로드 완료 win_s={win_s} n_feat={n_feat} n_out={n_out} device={device}")

        except Exception as e:
            print(f"[inference] ❌ 로드 실패: {e}")

    @property
    def ready(self):
        return self._ready

    def _get_state(self, drone_id):
        if drone_id not in self._drone_states:
            self._drone_states[drone_id] = _DroneState(
                num_features=self._n_feat,
                rmse_train=self._rmse_train.tolist(),
            )
        return self._drone_states[drone_id]

    def _normalize(self, x):
        return (x - self._mu) / self._sig

    def _inverse_normalize(self, y_norm):
        return y_norm * self._sig[:self._n_out] + self._mu[:self._n_out]

    @staticmethod
    def _fix_yaw(X):
        X = X.copy()
        for col in [5, 8]:
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

    def run(self, drone_id: str) -> List[dict]:
        if not self._ready:
            return []

        window = get_window(drone_id)
        if window is None:
            return []

        state = self._get_state(drone_id)

        window_fixed = self._fix_yaw(window)
        x_norm       = self._normalize(window_fixed)  # (20, 27)

        y_true_norm = torch.tensor(x_norm[-1], dtype=torch.float32)

        # 입력: (1, 27, 20)
        x_tensor = torch.tensor(
            x_norm.T, dtype=torch.float32
        ).unsqueeze(0).to(self._device)

        with torch.no_grad():
            y_pred_norm = self._model(x_tensor).squeeze(0).cpu()

        y_pred   = self._inverse_normalize(y_pred_norm.numpy())
        y_true   = self._inverse_normalize(y_true_norm.numpy())
        err      = np.abs(y_pred - y_true)
        err_norm = np.abs(y_pred_norm.numpy() - y_true_norm.numpy())

        alerts = []
        n = min(self._n_out, self._n_feat)
        thresholds = self._thresholds[:n]

        # ── fail count (점진적 이상) ──────────────────────
        for j in range(n):
            if err[j] >= thresholds[j]:
                state.fail_cnt[j] += 1
            else:
                state.pre_fail_cnt[j] = 0
                state.fail_cnt[j]     = 0
                continue

            if state.fail_cnt[j] >= DETECT_FAIL_CNT:
                feat_name = FEATURE_NAMES[j] if j < len(FEATURE_NAMES) else f"feature_{j}"
                system, msg = FEATURE_MESSAGES.get(feat_name, ("Unknown", f"피처 {j} 이상"))
                alerts.append({
                    "system":    system,
                    "level":     "danger",
                    "source":    "cnn_lstm",
                    "method":    "fail_count",
                    "feature":   feat_name,
                    "msg":       msg,
                    "err":       round(float(err[j]), 6),
                    "threshold": round(float(thresholds[j]), 6),
                })
                state.pre_fail_cnt[j] = 0
                state.fail_cnt[j]     = 0
            else:
                state.pre_fail_cnt[j] = state.fail_cnt[j]

        # ── CUSUM (순간적 이상) ───────────────────────────
        err_norm_arr = err_norm[:n].reshape(1, n)
        mu0          = self._rmse_train[:n]
        state.S      = np.maximum(0, state.S + (err_norm_arr - mu0 - CUSUM_DRIFT))
        cusum_flags  = (state.S > CUSUM_THRESHOLD).squeeze(0)

        for j in range(n):
            if cusum_flags[j]:
                feat_name = FEATURE_NAMES[j] if j < len(FEATURE_NAMES) else f"feature_{j}"
                system, msg = FEATURE_MESSAGES.get(feat_name, ("Unknown", f"피처 {j} 이상"))
                already = any(a["feature"] == feat_name and a["method"] == "fail_count" for a in alerts)
                if not already:
                    alerts.append({
                        "system":  system,
                        "level":   "warning",
                        "source":  "cnn_lstm",
                        "method":  "cusum",
                        "feature": feat_name,
                        "msg":     msg,
                        "cusum":   round(float(state.S[0, j]), 4),
                    })
                state.S[0, j] = 0.0

        return alerts

    def reset(self, drone_id: str) -> None:
        if drone_id in self._drone_states:
            self._drone_states[drone_id].reset()
        reset_window(drone_id)
        print(f"[inference] {drone_id} 상태 초기화 완료")

    def reset_all(self) -> None:
        for state in self._drone_states.values():
            state.reset()

    def get_cusum_values(self, drone_id: str) -> Optional[dict]:
        state = self._drone_states.get(drone_id)
        if state is None:
            return None
        return {FEATURE_NAMES[i]: float(state.S[0, i]) for i in range(min(self._n_out, len(FEATURE_NAMES)))}

    def get_fail_counts(self, drone_id: str) -> Optional[dict]:
        state = self._drone_states.get(drone_id)
        if state is None:
            return None
        return {FEATURE_NAMES[i]: int(state.fail_cnt[i]) for i in range(min(self._n_out, len(FEATURE_NAMES)))}


_engine: Optional[InferenceEngine] = None

def get_inference_engine() -> InferenceEngine:
    global _engine
    if _engine is None:
        _engine = InferenceEngine()
    return _engine