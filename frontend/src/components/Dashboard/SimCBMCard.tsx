import { useEffect, useMemo, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Brain,
  Wifi,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import {
  CbmFeatureTiles,
  ALL_FEATURES,
  AI_DISABLED_FEATURES,
  overallLevel,
  summarize,
  type AiAlert,
  type FeatureErrors,
} from "@/components/Dashboard/CbmFeatureTiles"

/* =============================================================
 * SimCBMCard — 시뮬레이션 전용 CNN-LSTM 이상탐지 카드
 * -------------------------------------------------------------
 * RealtimeCBMStatusCard 와 동일한 14피처 타일 레이아웃(공용 CbmFeatureTiles).
 * 백엔드 없이 시뮬 데이터(배터리/속도/고도/위성)로 규칙 지표를 판정하고,
 * AI 타일은 합성 오차(평시 10~35% + 노이즈)로 살아 움직이게 한다.
 *   - 배터리 주의/위험 → 전류 타일이 80%/130% 로 올라가며 경보 연동
 * ============================================================= */

const TH = {
  battery: { danger: 25, caution: 40 },
  speed: { danger: 15, caution: 12 },
  altitude: { danger: 120, caution: 100 },
  gps: { danger: 10, caution: 20 },
}

interface SimCBMData {
  battery?: number | null
  altitude?: number | null
  speed?: number | null
  gpsFixType?: number | null
  gpsSatellites?: number | null
}

interface SimCBMCardProps {
  droneId?: string
  data?: SimCBMData
}

type Status = "ok" | "warn" | "danger"

const ROW_TONE: Record<Status, string> = {
  ok: "border-emerald-200/70 bg-emerald-50/60 text-emerald-700",
  warn: "border-amber-200/70 bg-amber-50/60 text-amber-700",
  danger: "border-red-200/70 bg-red-50/60 text-red-700",
}

const StatusIcon = ({ status }: { status: Status }) =>
  status === "ok" ? (
    <CheckCircle className="h-4 w-4" />
  ) : status === "warn" ? (
    <AlertTriangle className="h-4 w-4" />
  ) : (
    <XCircle className="h-4 w-4" />
  )

// 피처별 평시 오차 비율 기준값 (실제 리플레이의 정상 비행 분포를 참고한 시연값)
const BASE_RATIO: Record<string, number> = {
  current: 0.12,
  att_cmd_roll: 0.1, att_cmd_pitch: 0.12, att_cmd_yaw: 0.25,
  att_state_roll: 0.08, att_state_pitch: 0.1, att_state_yaw: 0.22,
  pwm_dev1: 0.2, pwm_dev2: 0.25, pwm_dev3: 0.22, pwm_dev4: 0.18,
  accel_vib_metric: 0.15, gyro_vib_metric: 0.12,
}

export function SimCBMCard({ droneId = "drone-002", data }: SimCBMCardProps) {
  const [windowSize, setWindowSize] = useState(0)
  const [aiExpanded, setAiExpanded] = useState(true)
  const [tick, setTick] = useState(0)

  // 윈도우 채우기: 0 → 20 (약 2초), 이후 1초마다 tick (막대 노이즈 갱신)
  useEffect(() => {
    const fill = setInterval(() => setWindowSize((w) => (w >= 20 ? 20 : w + 1)), 100)
    const tk = setInterval(() => setTick((t) => t + 1), 1000)
    return () => {
      clearInterval(fill)
      clearInterval(tk)
    }
  }, [])

  const aiActive = windowSize >= 20

  // ── 시뮬 값 (없으면 시연용 기본값) ────────────────────
  const battery = data?.battery ?? 67
  const speed = data?.speed ?? 8
  const altitude = data?.altitude ?? 50
  const satellites = data?.gpsSatellites ?? 31

  // ── 규칙 기반 판정 ────────────────────────────────────
  const batteryStatus: Status =
    battery <= TH.battery.danger ? "danger" : battery <= TH.battery.caution ? "warn" : "ok"
  const speedStatus: Status =
    speed > TH.speed.danger ? "danger" : speed > TH.speed.caution ? "warn" : "ok"
  const altitudeStatus: Status =
    altitude > TH.altitude.danger ? "danger" : altitude > TH.altitude.caution ? "warn" : "ok"
  const gpsStatus: Status =
    satellites < TH.gps.danger ? "danger" : satellites < TH.gps.caution ? "warn" : "ok"

  const label = (st: Status, ok: string, warn: string, danger: string) =>
    st === "danger" ? danger : st === "warn" ? warn : ok

  const ruleRows: Array<{ s: string; status: Status; m: string }> = [
    { s: "Battery", status: batteryStatus,
      m: label(batteryStatus, `정상 (${battery.toFixed(0)}%)`, `주의 (${battery.toFixed(0)}%)`, `위험 (${battery.toFixed(0)}%)`) },
    { s: "ESC", status: speedStatus,
      m: label(speedStatus, `정상 (${speed.toFixed(1)} m/s)`, `주의 (${speed.toFixed(1)} m/s)`, `위험 (${speed.toFixed(1)} m/s)`) },
    { s: "FCC", status: altitudeStatus,
      m: label(altitudeStatus, `정상 (${altitude.toFixed(0)} m)`, `주의 (${altitude.toFixed(0)} m)`, `위험 (${altitude.toFixed(0)} m)`) },
    { s: "GNSS", status: gpsStatus,
      m: label(gpsStatus, `정상 (위성 ${satellites})`, `주의 (위성 ${satellites})`, `위험 (위성 ${satellites})`) },
  ]

  // ── AI 합성 데이터: 피처별 오차/임계 (임계는 1로 두고 오차를 비율로) ──
  const featureErrors: FeatureErrors = useMemo(() => {
    const out: FeatureErrors = {}
    for (const f of ALL_FEATURES) {
      if (AI_DISABLED_FEATURES.has(f)) continue
      // 결정적 노이즈 (tick 기반) — 새로고침마다 같은 패턴, 초당 자연스럽게 출렁임
      const seed = (tick * 7 + f.length * 13) % 17
      const noise = ((seed / 17) - 0.5) * 0.12 // ±6%
      let ratio = (BASE_RATIO[f] ?? 0.15) + noise
      // 배터리 상태 → 전류 타일 연동
      if (f === "current") {
        if (batteryStatus === "danger") ratio = 1.3 + noise
        else if (batteryStatus === "warn") ratio = 0.85 + noise
      }
      out[f] = { err: Math.max(0, +ratio.toFixed(3)), threshold: 1 }
    }
    return out
  }, [tick, batteryStatus])

  // ── AI 알람 (배터리 위험 시 전류 경보) ──────────────────
  const alerts: AiAlert[] = useMemo(() => {
    if (!aiActive) return []
    if (batteryStatus === "danger") {
      return [{
        system: "Power", level: "danger", source: "sim", method: "fail_count",
        feature: "current", msg: "전류 이상 감지 — 전력 급감 패턴",
        err: featureErrors.current?.err, threshold: 1,
      }]
    }
    if (batteryStatus === "warn") {
      return [{
        system: "Power", level: "warning", source: "sim", method: "cusum",
        feature: "current", msg: "전류 소모 상승 — 주의",
        err: featureErrors.current?.err, threshold: 1,
      }]
    }
    return []
  }, [aiActive, batteryStatus, featureErrors])

  const worst = aiActive ? overallLevel(alerts) : "safe"
  const summary = summarize(alerts, featureErrors)
  const modelLabel = !aiActive ? "수집 중" : worst === "danger" ? "이상 감지" : worst === "warning" ? "주의" : "정상"
  const modelTone = !aiActive
    ? "bg-slate-50/60 border-slate-200/60 text-slate-500"
    : worst === "danger"
      ? "bg-red-50/60 border-red-200/70 text-red-700"
      : worst === "warning"
        ? "bg-amber-50/60 border-amber-200/70 text-amber-700"
        : "bg-emerald-50/60 border-emerald-200/70 text-emerald-700"
  const barColor = !aiActive ? "bg-amber-400" : worst === "danger" ? "bg-red-500" : worst === "warning" ? "bg-amber-500" : "bg-emerald-500"

  const advisory =
    aiActive && batteryStatus === "danger"
      ? "배터리 전력이 위험 수준입니다. 즉시 RTL(자동 귀환)로 전환하세요."
      : aiActive && batteryStatus === "warn"
        ? "배터리 소모가 빨라지고 있습니다. 귀환을 준비하세요."
        : null

  return (
    <Card className="rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] ring-1 ring-white/70 backdrop-blur-xl">
      <CardHeader className="border-b border-slate-200/60">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          AI 기체 상태 진단
          <span className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            시뮬레이션
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* 규칙 기반 지표 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">규칙 기반 지표</p>
          {ruleRows.map((r) => (
            <div key={r.s} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${ROW_TONE[r.status]}`}>
              <div className="flex items-center gap-2">
                <StatusIcon status={r.status} />
                <span className="text-sm font-medium">{r.s}</span>
              </div>
              <span className="text-xs font-semibold">{r.m}</span>
            </div>
          ))}
        </div>

        {/* AI 이상 탐지 */}
        <div className="space-y-2">
          <button type="button" onClick={() => setAiExpanded((v) => !v)} className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-indigo-500" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                AI 이상 탐지 (CNN-LSTM · 14피처)
              </p>
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            {aiExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>

          {aiExpanded && (
            <div className="space-y-2">
              <div className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${modelTone}`}>
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  <span className="font-medium">{droneId} 모델</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200/60">
                      <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${(windowSize / 20) * 100}%` }} />
                    </div>
                    <span className="text-[10px] tabular-nums">{windowSize}/20</span>
                  </div>
                  <span className="font-semibold">{modelLabel}</span>
                </div>
              </div>

              {!aiActive && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
                  <Activity className="h-4 w-4 shrink-0 animate-pulse" />
                  데이터 수집 중입니다 (1초 간격 20개 채워지면 탐지 시작)
                </div>
              )}

              {aiActive && (
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                    summary.level === "danger"
                      ? "border-rose-300 bg-rose-50 text-rose-800"
                      : summary.level === "warning"
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-emerald-200/70 bg-emerald-50/60 text-emerald-700"
                  }`}
                >
                  {summary.level === "safe" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                  <span>{summary.text}</span>
                </div>
              )}

              {aiActive && <CbmFeatureTiles alerts={alerts} featureErrors={featureErrors} />}

              {advisory && (
                <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                  batteryStatus === "danger" ? "border-red-200/70 bg-red-50/70 text-red-700" : "border-amber-200/70 bg-amber-50/70 text-amber-700"
                }`}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{advisory}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}