import { useEffect, useState, useRef } from "react"
import type { JSX } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  AlertTriangle,
  CheckCircle,
  Battery,
  Satellite,
  Zap,
  Cpu,
  Brain,
  Activity,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Waves,
  Fan,
} from "lucide-react"

interface RuleSystem {
  system: string
  level: "safe" | "warning" | "danger"
  msg: string
}

interface AiAlert {
  system: string
  level: "warning" | "danger"
  source: string
  method: string // "fail_count" | "cusum" | "severe"
  feature: string
  msg: string
  position?: string // 모터 물리 위치 (pwm_dev 알람에만)
  err?: number
  threshold?: number
  cusum?: number
  severity_ratio?: number
}

interface CbmWsPayload {
  drone_id: string
  window_size: number
  model_ready: boolean
  has_alert: boolean
  systems: AiAlert[]
  cusum_values: Record<string, number> | null
  fail_counts: Record<string, number> | null
}

interface RealtimeCBMStatusCardProps {
  connected: boolean
  droneId?: string
  droneData?: {
    battery?: number
    altitude?: number
    speed?: number
    gpsFixType?: number
    gpsSatellites?: number
  }
}

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1"

const WS_RECONNECT_DELAY_MS = 5000
const ALERT_HOLD_MS = 10000

// AI가 감시하는 표시 그룹 — 14피처 모델 기준
//   Power: volt/current · Roll/Pitch/Yaw: 자세 명령/상태 · Motor: pwm_dev1~4 · Vibration: 진동 메트릭
interface AiDisplayGroup {
  name: string
  label: string
  match: (feature: string) => boolean
}

const AI_DISPLAY_GROUPS: AiDisplayGroup[] = [
  { name: "Power", label: "전원", match: (f) => f === "volt" || f === "current" },
  { name: "Roll", label: "Roll", match: (f) => f.startsWith("att_") && f.endsWith("roll") },
  { name: "Pitch", label: "Pitch", match: (f) => f.startsWith("att_") && f.endsWith("pitch") },
  { name: "Yaw", label: "Yaw", match: (f) => f.startsWith("att_") && f.endsWith("yaw") },
  { name: "Motor", label: "모터 편차", match: (f) => f.startsWith("pwm_dev") },
  { name: "Vibration", label: "진동", match: (f) => f.endsWith("_vib_metric") },
]

// 모터 번호 → 물리 위치 (서버 position 이 없을 때의 fallback, PX4 Quad X 표준)
const MOTOR_POSITION: Record<string, string> = {
  pwm_dev1: "전방 우측",
  pwm_dev2: "후방 좌측",
  pwm_dev3: "전방 좌측",
  pwm_dev4: "후방 우측",
}

function matchGroup(group: AiDisplayGroup, feature: string | undefined): boolean {
  if (typeof feature !== "string" || feature.length === 0) return false
  return group.match(feature)
}

function methodLabel(method: string): string {
  switch (method) {
    case "severe":
      return "즉시 확정"
    case "cusum":
      return "누적 이탈"
    case "fail_count":
      return "연속 초과"
    default:
      return method
  }
}

function calcRuleSystems(
  connected: boolean,
  droneData?: RealtimeCBMStatusCardProps["droneData"],
): RuleSystem[] {
  if (!connected) {
    return [
      { system: "Battery", level: "warning", msg: "연결되지 않음" },
      { system: "ESC", level: "warning", msg: "연결되지 않음" },
      { system: "FCC", level: "warning", msg: "연결되지 않음" },
      { system: "GNSS", level: "warning", msg: "연결되지 않음" },
    ]
  }
  if (!droneData) {
    return [
      { system: "Battery", level: "warning", msg: "데이터 수신 대기 중" },
      { system: "ESC", level: "warning", msg: "데이터 수신 대기 중" },
      { system: "FCC", level: "warning", msg: "데이터 수신 대기 중" },
      { system: "GNSS", level: "warning", msg: "데이터 수신 대기 중" },
    ]
  }

  const systems: RuleSystem[] = []

  if (typeof droneData.battery === "number") {
    const b = droneData.battery
    systems.push(
      b > 80
        ? { system: "Battery", level: "safe", msg: `정상 (${b.toFixed(1)}%)` }
        : b > 50
          ? { system: "Battery", level: "warning", msg: `주의 (${b.toFixed(1)}%)` }
          : { system: "Battery", level: "danger", msg: `위험 (${b.toFixed(1)}%)` },
    )
  } else {
    systems.push({ system: "Battery", level: "warning", msg: "데이터 없음" })
  }

  if (typeof droneData.speed === "number") {
    const s = droneData.speed
    systems.push(
      s <= 20
        ? { system: "ESC", level: "safe", msg: `정상 (${s.toFixed(1)} m/s)` }
        : s <= 30
          ? { system: "ESC", level: "warning", msg: `주의 (${s.toFixed(1)} m/s)` }
          : { system: "ESC", level: "danger", msg: `위험 (${s.toFixed(1)} m/s)` },
    )
  } else {
    systems.push({ system: "ESC", level: "warning", msg: "데이터 없음" })
  }

  if (typeof droneData.altitude === "number") {
    const a = droneData.altitude
    systems.push(
      a <= 120
        ? { system: "FCC", level: "safe", msg: `정상 (${a.toFixed(1)} m)` }
        : a <= 150
          ? { system: "FCC", level: "warning", msg: `주의 (${a.toFixed(1)} m)` }
          : { system: "FCC", level: "danger", msg: `위험 (${a.toFixed(1)} m)` },
    )
  } else {
    systems.push({ system: "FCC", level: "warning", msg: "데이터 없음" })
  }

  const { gpsFixType: fixType, gpsSatellites: sats } = droneData
  if (sats != null) {
    systems.push(
      sats > 25
        ? { system: "GNSS", level: "safe", msg: `정상 (위성 ${sats})` }
        : sats > 20
          ? { system: "GNSS", level: "warning", msg: `주의 (${sats}위성)` }
          : { system: "GNSS", level: "danger", msg: `신호 부족 (${sats}위성)` },
    )
  } else if (fixType != null) {
    systems.push(
      fixType >= 3
        ? { system: "GNSS", level: "safe", msg: "정상" }
        : { system: "GNSS", level: "warning", msg: `신호 약함 (Fix ${fixType})` },
    )
  } else {
    systems.push({ system: "GNSS", level: "warning", msg: "데이터 없음" })
  }

  return systems
}

function aiOverallLevel(
  alerts: AiAlert[],
  modelReady: boolean,
  windowSize: number,
): "safe" | "warning" | "danger" | "off" {
  if (!modelReady) return "off"
  if (windowSize < 20) return "off"
  if (alerts.some((a) => a.level === "danger")) return "danger"
  if (alerts.some((a) => a.level === "warning")) return "warning"
  return "safe"
}

export function RealtimeCBMStatusCard({
  connected,
  droneId,
  droneData,
}: RealtimeCBMStatusCardProps) {
  const ruleSystems = calcRuleSystems(connected, droneData)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAlertRef = useRef<CbmWsPayload | null>(null)
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [wsConnected, setWsConnected] = useState(false)
  const [cbmPayload, setCbmPayload] = useState<CbmWsPayload | null>(null)
  const [aiExpanded, setAiExpanded] = useState(true)

  useEffect(() => {
    if (!connected || !droneId) {
      wsRef.current?.close()
      wsRef.current = null
      setCbmPayload(null)
      setWsConnected(false)
      lastAlertRef.current = null
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current)
      return
    }

    const protocol = API_BASE_URL.startsWith("https") ? "wss" : "ws"
    const host = API_BASE_URL.replace(/^https?:\/\//, "").replace(/\/api\/v1$/, "")
    const url = `${protocol}://${host}/api/v1/cbm/ws/cbm?drone_id=${droneId}`

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => setWsConnected(true)
      ws.onclose = () => {
        setWsConnected(false)
        if (connected) {
          reconnectTimer.current = setTimeout(connect, WS_RECONNECT_DELAY_MS)
        }
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const payload: CbmWsPayload = JSON.parse(e.data)
          if (payload.has_alert) {
            lastAlertRef.current = payload
            if (alertTimerRef.current) clearTimeout(alertTimerRef.current)
            alertTimerRef.current = setTimeout(() => {
              lastAlertRef.current = null
            }, ALERT_HOLD_MS)
            setCbmPayload(payload)
          } else if (!lastAlertRef.current) {
            setCbmPayload(payload)
          }
        } catch {}
      }
    }

    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connected, droneId])

  const ruleIcon: Record<string, JSX.Element> = {
    Battery: <Battery className="h-4 w-4 text-amber-500" />,
    ESC: <Zap className="h-4 w-4 text-rose-500" />,
    FCC: <Cpu className="h-4 w-4 text-orange-500" />,
    GNSS: <Satellite className="h-4 w-4 text-sky-500" />,
  }

  const ruleTone: Record<"safe" | "warning" | "danger", string> = {
    safe: "bg-emerald-50/60 border-emerald-200/70 text-emerald-700",
    warning: "bg-amber-50/60  border-amber-200/70  text-amber-700",
    danger: "bg-rose-50/60   border-rose-200/70   text-rose-700",
  }

  const aiLevelTone: Record<string, string> = {
    danger: "bg-rose-50/60   border-rose-200/70   text-rose-700",
    warning: "bg-amber-50/60  border-amber-200/70  text-amber-700",
    safe: "bg-emerald-50/60 border-emerald-200/70 text-emerald-700",
    off: "bg-slate-50/60  border-slate-200/60  text-slate-500",
  }

  const modelReady = cbmPayload?.model_ready ?? false
  const windowSize = cbmPayload?.window_size ?? 0
  const aiAlerts = cbmPayload?.systems ?? []
  const aiLevel = aiOverallLevel(aiAlerts, modelReady, windowSize)

  const alertsByGroup = AI_DISPLAY_GROUPS.reduce<Record<string, AiAlert[]>>((acc, g) => {
    acc[g.name] = aiAlerts.filter((a) => matchGroup(g, a.feature))
    return acc
  }, {})

  const systemIconMap: Record<string, JSX.Element> = {
    Power: <Battery className="h-4 w-4 text-amber-500" />,
    Roll: <Activity className="h-4 w-4 text-blue-500" />,
    Pitch: <Activity className="h-4 w-4 text-indigo-500" />,
    Yaw: <Activity className="h-4 w-4 text-violet-500" />,
    Motor: <Fan className="h-4 w-4 text-red-500" />,
    Vibration: <Waves className="h-4 w-4 text-orange-500" />,
  }

  const aiActive = modelReady && windowSize >= 20

  return (
    <Card className="rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] ring-1 ring-white/70 backdrop-blur-xl transition-all duration-300 hover:shadow-lg dark:border-slate-800/60 dark:bg-slate-900/70 dark:ring-slate-800/70">
      <CardHeader className="border-b border-slate-200/60 dark:border-slate-800/60">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          AI 기체 상태 진단
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* ── 규칙 기반 섹션 ── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            규칙 기반 지표
          </p>
          {ruleSystems.map((sys, idx) => (
            <div
              key={`${sys.system}-${idx}`}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${ruleTone[sys.level]}`}
            >
              <div className="flex items-center gap-2">
                {ruleIcon[sys.system] ?? <CheckCircle className="h-4 w-4" />}
                <span className="text-sm font-medium">{sys.system}</span>
              </div>
              <span className="text-xs">{sys.msg}</span>
            </div>
          ))}
        </div>

        {/* ── AI 이상 탐지 섹션 ── */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setAiExpanded((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-indigo-500" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                AI 이상 탐지 (CNN-LSTM · 14피처)
              </p>
              {connected &&
                droneId &&
                (wsConnected ? (
                  <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 animate-pulse text-slate-400" />
                ))}
            </div>
            {aiExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {aiExpanded && (
            <div className="space-y-2">
              {(!connected || !droneId) && (
                <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2 text-xs text-slate-400">
                  기체 연결 후 AI 탐지가 시작됩니다
                </div>
              )}

              {connected && droneId && (
                <>
                  <div
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${aiLevelTone[aiLevel]}`}
                  >
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      <span className="font-medium">{droneId} 모델</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200/60">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${windowSize >= 20 ? "bg-emerald-500" : "bg-amber-400"}`}
                            style={{ width: `${(windowSize / 20) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums">{windowSize}/20</span>
                      </div>
                      <span className="font-semibold">
                        {aiLevel === "off"
                          ? "수집 중"
                          : aiLevel === "safe"
                            ? "정상"
                            : aiLevel === "warning"
                              ? "주의"
                              : "이상 감지"}
                      </span>
                    </div>
                  </div>

                  {aiLevel === "off" && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
                      <Activity className="h-4 w-4 shrink-0 animate-pulse" />
                      데이터 수집 중입니다 (1초 간격 20개 채워지면 탐지 시작)
                    </div>
                  )}

                  {aiActive &&
                    AI_DISPLAY_GROUPS.map((group) => {
                      const alerts = alertsByGroup[group.name] ?? []
                      const hasDanger = alerts.some((a) => a.level === "danger")
                      const hasWarning = alerts.some((a) => a.level === "warning")
                      const tone = hasDanger
                        ? "border-rose-200/70 bg-rose-50/60"
                        : hasWarning
                          ? "border-amber-200/70 bg-amber-50/60"
                          : "border-emerald-200/70 bg-emerald-50/60"
                      const labelColor = hasDanger
                        ? "text-rose-700"
                        : hasWarning
                          ? "text-amber-700"
                          : "text-emerald-700"

                      return (
                        <div
                          key={group.name}
                          className={`rounded-xl border px-3 py-2 text-xs ${tone}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {systemIconMap[group.name] ?? (
                                <CheckCircle className="h-4 w-4 text-slate-400" />
                              )}
                              <span className={`font-semibold ${labelColor}`}>{group.label}</span>
                            </div>
                            {alerts.length === 0 && (
                              <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                <CheckCircle className="h-3 w-3" />
                                정상
                              </span>
                            )}
                          </div>

                          {alerts.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {alerts.map((a, i) => {
                                const pos = a.position ?? MOTOR_POSITION[a.feature]
                                const isSevere = a.method === "severe"
                                return (
                                  <div key={i} className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <span className="text-slate-700">{a.msg}</span>
                                      {pos && group.name === "Motor" && (
                                        <span className="ml-1 rounded bg-rose-100 px-1 py-0.5 text-[10px] font-semibold text-rose-700">
                                          {pos} 점검
                                        </span>
                                      )}
                                      {typeof a.err === "number" && typeof a.threshold === "number" && (
                                        <div className="text-[10px] text-slate-500 tabular-nums">
                                          오차 {a.err.toFixed(2)} / 임계 {a.threshold.toFixed(2)}
                                          {typeof a.severity_ratio === "number" && ` (${a.severity_ratio}×)`}
                                        </div>
                                      )}
                                    </div>
                                    <span
                                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                        isSevere
                                          ? "bg-rose-600 text-white"
                                          : a.level === "danger"
                                            ? "bg-rose-100 text-rose-700"
                                            : "bg-amber-100 text-amber-700"
                                      }`}
                                    >
                                      {methodLabel(a.method)}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}