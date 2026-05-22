"""
cnnlstm_retrain.py

quadNormal_sortie1~4.csv 를 사용해서
CNN-LSTM 모델을 Early Stopping으로 재학습합니다.
Test Loss가 개선되지 않으면 자동 중단하고 최적 모델을 저장합니다.

실행 방법:
    cd backend/app/cbm/train
    python cnnlstm_retrain.py

결과물:
    trainResult/quadNormal_best_model.pth  ← 서버에 올릴 모델
    pkl_files/quadNormal_retrained_stats.pkl
"""

import os
import glob
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
import pickle
import matplotlib.pyplot as plt

from torch.utils.data import Dataset, DataLoader


# ══════════════════════════════════════════════
# 파라미터 설정
# ══════════════════════════════════════════════
DATA_DIR  = "csv_output/DM4_1"
PKL_PATH  = "pkl_files/DM4_1_stats.pkl"
SAVE_PATH = "trainResult/DM4_1_best_model.pth"
TEMP_PATH  = "trainResult/quadNormal_best_model_temp.pth"

WIN_S               = 20
NUM_EPOCHS          = 100   # 넉넉하게 (Early Stopping이 멈춰줌)
BATCH_SIZE          = 256
LR                  = 0.0005
EARLY_STOP_PATIENCE = 10    # Test Loss가 10번 연속 개선 안 되면 중단


# ══════════════════════════════════════════════
# 유틸 함수
# ══════════════════════════════════════════════
def load_csv(path):
    return pd.read_csv(path, header=None).values

def convert_yawSign(X):
    X = X.copy()
    for col in [5, 8]:
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

def normalize(X, Y, mu, sig):
    X_norm = [(x - mu) / sig for x in X]
    Y_norm = [(y - mu.squeeze()) / sig.squeeze() for y in Y]
    return X_norm, Y_norm

def inverse_normalize(Y_norm, mu, sig):
    return Y_norm * sig.squeeze() + mu.squeeze()

def compute_rmse(preds, targets):
    return [float(np.sqrt(np.mean((preds[:, i] - targets[:, i]) ** 2)))
            for i in range(preds.shape[1])]


# ══════════════════════════════════════════════
# Dataset
# ══════════════════════════════════════════════
class SequenceDataset(Dataset):
    def __init__(self, X_list, Y_list):
        self.X = [torch.tensor(x, dtype=torch.float32).permute(2, 0, 1).squeeze(0) for x in X_list]
        self.Y = [torch.tensor(y, dtype=torch.float32) for y in Y_list]

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.Y[idx]


# ══════════════════════════════════════════════
# CNN-LSTM 모델
# ══════════════════════════════════════════════
class CNNLSTM(nn.Module):
    def __init__(self, win_s, num_features, output_dim,
                 filter_size=(3, 1), num_filters=32, lstm_hidden=128):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, num_filters, kernel_size=filter_size, padding='same'),
            nn.ReLU(),
            nn.Conv2d(num_filters, num_filters*2, kernel_size=filter_size, padding='same'),
            nn.ReLU(),
        )
        self.lstm_input_size = num_filters * 2 * num_features
        self.lstm = nn.LSTM(self.lstm_input_size, lstm_hidden, batch_first=True)
        self.fc   = nn.Linear(lstm_hidden, output_dim)

    def forward(self, x):
        x = x.unsqueeze(1)
        x = self.conv(x)
        b, C, T, F = x.shape
        x = x.permute(0, 2, 1, 3).contiguous().view(b, T, C * F)
        _, (hn, _) = self.lstm(x)
        return self.fc(hn[-1])


# ══════════════════════════════════════════════
# 메인
# ══════════════════════════════════════════════
if __name__ == "__main__":

    # ── 1. 데이터 로드 ──────────────────────────
    file_list = sorted(glob.glob(os.path.join(DATA_DIR, "*.csv")))
    print(f"[데이터] 파일 수: {len(file_list)}")
    for f in file_list:
        print(f"  {os.path.basename(f)}")

    XTrain, YTrain = [], []
    XTest,  YTest  = [], []

    for path in file_list:
        data  = load_csv(path)
        n     = len(data)
        split = int(0.9 * n)

        for d, Xl, Yl in [(data[:split], XTrain, YTrain),
                           (data[split:], XTest,  YTest)]:
            for k in range(len(d) - WIN_S):
                seg = convert_yawSign(d[k:k+WIN_S+1])
                Xl.append(seg[:WIN_S][..., np.newaxis])
                Yl.append(seg[WIN_S])

    print(f"[데이터] Train: {len(XTrain)}개, Test: {len(XTest)}개")

    # ── 2. 정규화 ───────────────────────────────
    XTrain_concat = np.concatenate(XTrain, axis=0)
    mu  = np.mean(XTrain_concat, axis=0)
    sig = np.std(XTrain_concat,  axis=0)
    sig[sig == 0] = 1e-7

    XTrain, YTrain = normalize(XTrain, YTrain, mu, sig)
    XTest,  YTest  = normalize(XTest,  YTest,  mu, sig)

    # ── 3. DataLoader ───────────────────────────
    train_loader = DataLoader(SequenceDataset(XTrain, YTrain), batch_size=BATCH_SIZE, shuffle=True)
    test_loader  = DataLoader(SequenceDataset(XTest,  YTest),  batch_size=32, shuffle=False)

    # ── 4. 모델 초기화 ──────────────────────────
    num_features  = XTrain[0].shape[1]
    num_responses = YTrain[0].shape[0]
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"[모델] features={num_features}, responses={num_responses}, device={device}")

    model     = CNNLSTM(WIN_S, num_features, num_responses).to(device)
    optimizer = optim.Adam(model.parameters(), lr=LR)
    criterion = nn.MSELoss()

    # ── 5. 학습 (Early Stopping) ─────────────────
    print(f"\n[학습] max_epoch={NUM_EPOCHS}, patience={EARLY_STOP_PATIENCE}, batch={BATCH_SIZE}")
    print("Test Loss가 개선되지 않으면 자동 중단됩니다.\n")

    train_losses, test_losses = [], []
    best_test_loss   = float('inf')
    best_epoch       = 0
    patience_counter = 0

    os.makedirs(os.path.dirname(SAVE_PATH), exist_ok=True)

    for epoch in range(NUM_EPOCHS):
        # Train
        model.train()
        train_loss = 0
        for Xb, Yb in train_loader:
            Xb, Yb = Xb.to(device), Yb.to(device)
            optimizer.zero_grad()
            loss = criterion(model(Xb), Yb)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * Xb.size(0)
        train_loss /= len(train_loader.dataset)

        # Test
        model.eval()
        test_loss = 0
        with torch.no_grad():
            for Xb, Yb in test_loader:
                Xb, Yb = Xb.to(device), Yb.to(device)
                loss = criterion(model(Xb), Yb)
                test_loss += loss.item() * Xb.size(0)
        test_loss /= len(test_loader.dataset)

        train_losses.append(train_loss)
        test_losses.append(test_loss)

        print(f"  Epoch {epoch+1:3d}/{NUM_EPOCHS} "
              f"| Train: {train_loss:.6f} | Test: {test_loss:.6f}", end="")

        # Early Stopping 체크
        if test_loss < best_test_loss:
            best_test_loss   = test_loss
            best_epoch       = epoch + 1
            patience_counter = 0
            torch.save(model.state_dict(), TEMP_PATH)
            print(f"  ✅ Best! (epoch={best_epoch})")
        else:
            patience_counter += 1
            print(f"  patience={patience_counter}/{EARLY_STOP_PATIENCE}")
            if patience_counter >= EARLY_STOP_PATIENCE:
                print(f"\n🛑 Early Stopping! Best epoch={best_epoch}, Test Loss={best_test_loss:.6f}")
                break

    # ── 6. 최적 모델 복원 ────────────────────────
    print(f"\n[모델] Best epoch={best_epoch} 모델 복원 중...")
    model.load_state_dict(torch.load(TEMP_PATH, map_location=device))
    model.eval()

    # ── 7. RMSE 계산 ─────────────────────────────
    print("[RMSE] 계산 중...")
    preds_norm, targets_norm = [], []
    with torch.no_grad():
        for Xb, Yb in train_loader:
            preds_norm.append(model(Xb.to(device)).cpu().numpy())
            targets_norm.append(Yb.numpy())

    preds_norm   = np.concatenate(preds_norm)
    targets_norm = np.concatenate(targets_norm)
    preds   = inverse_normalize(preds_norm,   mu.squeeze(), sig.squeeze())
    targets = inverse_normalize(targets_norm, mu.squeeze(), sig.squeeze())

    rmse_list = compute_rmse(preds, targets)
    print("[RMSE] 피처별 결과:")
    for i, r in enumerate(rmse_list):
        print(f"  Feature {i:2d}: {r:.6f}")

    # ── 8. 저장 ──────────────────────────────────
    os.makedirs(os.path.dirname(PKL_PATH), exist_ok=True)

    torch.save({
        'model_state_dict': model.state_dict(),
        'rmse_train_list':  rmse_list,
    }, SAVE_PATH)

    with open(PKL_PATH, 'wb') as f:
        pickle.dump({
            'win_s':  WIN_S,
            'mu':     mu,
            'sig':    sig,
            'XTrain': XTrain[:10],
            'YTrain': YTrain[:10],
            'XTest':  XTest[:10],
            'YTest':  YTest[:10],
        }, f)

    print(f"\n✅ 저장 완료!")
    print(f"  모델 : {SAVE_PATH}  (Best epoch={best_epoch})")
    print(f"  통계 : {PKL_PATH}")

    # ── 9. Loss 그래프 ───────────────────────────
    plt.figure(figsize=(10, 4))
    plt.plot(train_losses, label='Train Loss')
    plt.plot(test_losses,  label='Test Loss')
    plt.axvline(x=best_epoch-1, color='r', linestyle='--', label=f'Best epoch={best_epoch}')
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.title(f'CNN-LSTM Early Stopping (Best epoch={best_epoch})')
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig('trainResult/loss_curve_early_stop.png')
    plt.show()
    print("  그래프: trainResult/loss_curve_early_stop.png")