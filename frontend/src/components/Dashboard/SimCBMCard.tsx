import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Battery,
  Activity,
  Brain,
  Wifi,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

/* =============================================================
 * SimCBMCard — 시뮬레이션 전용 CNN-LSTM 이상탐지 카드
 * -------------------------------------------------------------
 * RealtimeCBMStatusCard 와 동일한 모양.
 * ★ 개선: 이제 실제 시뮬 데이터(배터리/속도/고도/위성)를 prop 으로
 *   받아서 규칙 기반 지표와 AI 이상 탐지를 '실시간'으로 판정한다.
 *   - 배터리가 위험/주의 수준이면 빨강/노랑으로 표시하고
 *     AI Power 그룹도 이상(경고)으로 전환된다.
 * ============================================================= */

// UavDashboard 의 THRESHOLD 와 동일 기준 (독립 상수로 보관)
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

const AI_GROUPS = ["Power", "Roll", "Pitch", "Yaw"] as const

const GROUP_ICON: Record<string, JSX.Element> = {
  Power: <Battery className="h-4 w-4 text-amber-500" />,
  Roll: <Activity className="h-4 w-4 text-blue-500" />,
  Pitch: <Activity className="h-4 w-4 text-indigo-500" />,
  Yaw: <Activity className="h-4 w-4 text-violet-500" />,
}

// 상태별 색상 클래스
const ROW_TONE: Record<Status, string> = {
  ok: "border-emerald-200/70 bg-emerald-50/60 text-emerald-700",
  warn: "border-amber-200/70 bg-amber-50/60 text-amber-700",
  danger: "border-red-200/70 bg-red-50/60 text-red-700",
}
const BADGE_TONE: Record<Status, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
}

const StatusIcon = ({ status }: { status: Status }) =>
  status === "ok" ? (
    <CheckCircle className="h-4 w-4" />
  ) : status === "warn" ? (
    <AlertTriangle className="h-4 w-4" />
  ) : (
    <XCircle className="h-4 w-4" />
  )

export function SimCBMCard({ droneId = "drone-002", data }: SimCBMCardProps) {
  const [windowSize, setWindowSize] = useState(0)
  const [aiExpanded, setAiExpanded] = useState(true)

  // 윈도우 채우기: 0 → 20 (약 2초), 이후 추론 활성 유지
  useEffect(() => {
    const id = setInterval(() => {
      setWindowSize((w) => (w >= 20 ? 20 : w + 1))
    }, 100)
    return () => clearInterval(id)
  }, [])

  const aiActive = windowSize >= 20

  // ── 실시간 값 (없으면 시연용 기본값) ─────────────────────
  const battery = data?.battery ?? 67
  const speed = data?.speed ?? 8
  const altitude = data?.altitude ?? 50
  const satellites = data?.gpsSatellites ?? 31

  // ── 규칙 기반 판정 ───────────────────────────────────────
  const batteryStatus: Status =
    battery <= TH.battery.danger
      ? "danger"
      : battery <= TH.battery.caution
        ? "warn"
        : "ok"
  const speedStatus: Status =
    speed > TH.speed.danger ? "danger" : speed > TH.speed.caution ? "warn" : "ok"
  const altitudeStatus: Status =
    altitude > TH.altitude.danger
      ? "danger"
      : altitude > TH.altitude.caution
        ? "warn"
        : "ok"
  const gpsStatus: Status =
    satellites < TH.gps.danger
      ? "danger"
      : satellites < TH.gps.caution
        ? "warn"
        : "ok"

  const ruleRows: Array<{ s: string; status: Status; m: string }> = [
    {
      s: "Battery",
      status: batteryStatus,
      m:
        batteryStatus === "danger"
          ? `위험 (${battery.toFixed(0)}%)`
          : batteryStatus === "warn"
            ? `주의 (${battery.toFixed(0)}%)`
            : `정상 (${battery.toFixed(0)}%)`,
    },
    {
      s: "ESC",
      status: speedStatus,
      m:
        speedStatus === "danger"
          ? `위험 (${speed.toFixed(1)} m/s)`
          : speedStatus === "warn"
            ? `주의 (${speed.toFixed(1)} m/s)`
            : `정상 (${speed.toFixed(1)} m/s)`,
    },
    {
      s: "FCC",
      status: altitudeStatus,
      m:
        altitudeStatus === "danger"
          ? `위험 (${altitude.toFixed(0)} m)`
          : altitudeStatus === "warn"
            ? `주의 (${altitude.toFixed(0)} m)`
            : `정상 (${altitude.toFixed(0)} m)`,
    },
    {
      s: "GNSS",
      status: gpsStatus,
      m:
        gpsStatus === "danger"
          ? `위험 (위성 ${satellites})`
          : gpsStatus === "warn"
            ? `주의 (위성 ${satellites})`
            : `정상 (위성 ${satellites})`,
    },
  ]

  // ── AI 이상 탐지 그룹 판정 ───────────────────────────────
  // Power 그룹은 배터리 상태와 연동 (배터리 위험 → Power 이상 감지)
  const groupStatus: Record<string, Status> = {
    Power: batteryStatus,
    Roll: "ok",
    Pitch: "ok",
    Yaw: "ok",
  }
  const groupDetail: Record<string, string> = {
    Power:
      batteryStatus === "danger"
        ? "전력 급감 — 이상 패턴 감지"
        : batteryStatus === "warn"
          ? "전력 소모 상승 — 주의"
          : "정상",
    Roll: "정상",
    Pitch: "정상",
    Yaw: "정상",
  }

  // 전체 모델 상태 = 그룹 중 최악
  const worst: Status = (["Power", "Roll", "Pitch", "Yaw"] as const).reduce<
    Status
  >((acc, g) => {
    const s = groupStatus[g]
    if (acc === "danger" || s === "danger") return "danger"
    if (acc === "warn" || s === "warn") return "warn"
    return "ok"
  }, "ok")

  const modelLabel = !aiActive
    ? "수집 중"
    : worst === "danger"
      ? "이상 감지"
      : worst === "warn"
        ? "주의"
        : "정상"
  const modelTone = !aiActive
    ? "bg-slate-50/60 border-slate-200/60 text-slate-500"
    : worst === "danger"
      ? "bg-red-50/60 border-red-200/70 text-red-700"
      : worst === "warn"
        ? "bg-amber-50/60 border-amber-200/70 text-amber-700"
        : "bg-emerald-50/60 border-emerald-200/70 text-emerald-700"
  const barColor = !aiActive
    ? "bg-amber-400"
    : worst === "danger"
      ? "bg-red-500"
      : worst === "warn"
        ? "bg-amber-500"
        : "bg-emerald-500"

  // 위험/주의 시 대응 가이드 문구
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
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* 규칙 기반 지표 (실시간 판정) */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            규칙 기반 지표
          </p>
          {ruleRows.map((r) => (
            <div
              key={r.s}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${ROW_TONE[r.status]}`}
            >
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
          <button
            type="button"
            onClick={() => setAiExpanded((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-indigo-500" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                AI 이상 탐지 (CNN-LSTM)
              </p>
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            {aiExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {aiExpanded && (
            <div className="space-y-2">
              {/* 모델 상태 줄 */}
              <div
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${modelTone}`}
              >
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  <span className="font-medium">{droneId} 모델</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200/60">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${(windowSize / 20) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums">
                      {windowSize}/20
                    </span>
                  </div>
                  <span className="font-semibold">{modelLabel}</span>
                </div>
              </div>

              {/* 수집 중 */}
              {!aiActive && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
                  <Activity className="h-4 w-4 shrink-0 animate-pulse" />
                  데이터 수집 중입니다 (20개 채워지면 탐지 시작)
                </div>
              )}

              {/* 추론 활성: 4그룹 실시간 판정 */}
              {aiActive &&
                AI_GROUPS.map((g) => {
                  const st = groupStatus[g]
                  return (
                    <div
                      key={g}
                      className={`rounded-xl border px-3 py-2 text-xs ${ROW_TONE[st]}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {GROUP_ICON[g]}
                          <span className="font-semibold">{g}</span>
                        </div>
                        <span
                          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_TONE[st]}`}
                        >
                          <StatusIcon status={st} />
                          {st === "ok"
                            ? "정상"
                            : st === "warn"
                              ? "주의"
                              : "이상"}
                        </span>
                      </div>
                      {st !== "ok" && (
                        <p className="mt-1 pl-5 text-[11px] font-medium">
                          {groupDetail[g]}
                        </p>
                      )}
                    </div>
                  )
                })}

              {/* 위험/주의 대응 가이드 */}
              {advisory && (
                <div
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                    batteryStatus === "danger"
                      ? "border-red-200/70 bg-red-50/70 text-red-700"
                      : "border-amber-200/70 bg-amber-50/70 text-amber-700"
                  }`}
                >
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