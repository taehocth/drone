import { useEffect, useState, useRef } from "react"
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
  Radio,
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
  method: string
  feature: string
  msg: string
  err?: number
  threshold?: number
  cusum?: number
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
const ALERT_HOLD_MS = 10000 // 알람 유지 시간 (10초)

// AI가 감시하는 표시 그룹 (항상 화면에 표시: 정상이면 초록, 이상이면 알람)
// 8피처 모델 기준 — Power(volt,current), 자세는 Roll/Pitch/Yaw 축별로 분리 표시
// 각 그룹은 알람의 feature 이름으로 매칭한다 (예: att_cmd_roll, att_state_roll → Roll)
interface AiDisplayGroup {
  name: string
  match: (feature: string) => boolean
}

const AI_DISPLAY_GROUPS: AiDisplayGroup[] = [
  { name: "Power", match: (f) => f === "volt" || f === "current" },
  { name: "Roll", match: (f) => f.endsWith("roll") },
  { name: "Pitch", match: (f) => f.endsWith("pitch") },
  { name: "Yaw", match: (f) => f.endsWith("yaw") },
]

// feature 문자열이 없는 알람(서버 형식 차이 등)으로부터 화면 크래시를 방지하는 안전 매칭
function matchGroup(group: AiDisplayGroup, feature: string | undefined): boolean {
  if (typeof feature !== "string" || feature.length === 0) return false
  return group.match(feature)
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
          ? {
              system: "Battery",
              level: "warning",
              msg: `주의 (${b.toFixed(1)}%)`,
            }
          : {
              system: "Battery",
              level: "danger",
              msg: `위험 (${b.toFixed(1)}%)`,
            },
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
          ? {
              system: "ESC",
              level: "warning",
              msg: `주의 (${s.toFixed(1)} m/s)`,
            }
          : {
              system: "ESC",
              level: "danger",
              msg: `위험 (${s.toFixed(1)} m/s)`,
            },
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
        : {
            system: "GNSS",
            level: "warning",
            msg: `신호 약함 (Fix ${fixType})`,
          },
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

  // ── useRef는 반드시 컴포넌트 최상단에서 선언 ──
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAlertRef = useRef<CbmWsPayload | null>(null) // ← 최상단으로 이동
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // ← 최상단으로 이동

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
    const host = API_BASE_URL.replace(/^https?:\/\//, "").replace(
      /\/api\/v1$/,
      "",
    )
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
            // 이상 감지 시 10초간 알람 유지
            lastAlertRef.current = payload
            if (alertTimerRef.current) clearTimeout(alertTimerRef.current)
            alertTimerRef.current = setTimeout(() => {
              lastAlertRef.current = null
            }, ALERT_HOLD_MS)
            setCbmPayload(payload)
          } else {
            // 정상 신호: 알람 유지 중이면 마지막 알람 상태 유지
            if (!lastAlertRef.current) {
              setCbmPayload(payload)
            }
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

  // 알람을 표시 그룹(Power/Roll/Pitch/Yaw)별로 분류 — feature 이름 기준
  const alertsByGroup = AI_DISPLAY_GROUPS.reduce<Record<string, AiAlert[]>>(
    (acc, g) => {
      acc[g.name] = aiAlerts.filter((a) => matchGroup(g, a.feature))
      return acc
    },
    {},
  )

  const systemIconMap: Record<string, JSX.Element> = {
    Power: <Battery className="h-4 w-4 text-amber-500" />,
    Roll: <Activity className="h-4 w-4 text-blue-500" />,
    Pitch: <Activity className="h-4 w-4 text-indigo-500" />,
    Yaw: <Activity className="h-4 w-4 text-violet-500" />,
    GPS: <Satellite className="h-4 w-4 text-sky-500" />,
    Flight: <Activity className="h-4 w-4 text-blue-500" />,
    EKF: <Radio className="h-4 w-4 text-purple-500" />,
    Gyro: <Zap className="h-4 w-4 text-rose-500" />,
    Accel: <Cpu className="h-4 w-4 text-orange-500" />,
    Motor: <Zap className="h-4 w-4 text-red-500" />,
  }

  // AI 모델이 추론 중(수집 완료 + 모델 준비)일 때만 시스템별 정상/이상을 신뢰 표시
  const aiActive = modelReady && windowSize >= 20

  return (
    <Card className="rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] ring-1 ring-white/70 backdrop-blur-xl transition-all duration-300 hover:shadow-lg dark:border-slate-800/60 dark:bg-slate-900/70 dark:ring-slate-800/70">
      <CardHeader className="border-b border-slate-200/60 dark:border-slate-800/60">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          상태 기반 정비 (CBM)
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
                AI 이상 탐지 (CNN-LSTM)
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
                        <span className="text-[10px] tabular-nums">
                          {windowSize}/20
                        </span>
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

                  {/* 수집 중(off): 아직 추론 전이라 시스템별 상태를 신뢰할 수 없음 */}
                  {aiLevel === "off" && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
                      <Activity className="h-4 w-4 shrink-0 animate-pulse" />
                      데이터 수집 중입니다 (20개 채워지면 탐지 시작)
                    </div>
                  )}

                  {/* 추론 활성: 감시 그룹(Power·Roll·Pitch·Yaw)을 항상 표시.
                      이상 없으면 초록 '정상', 있으면 해당 그룹만 알람 상세 */}
                  {aiActive &&
                    AI_DISPLAY_GROUPS.map((group) => {
                      const sysName = group.name
                      const alerts = alertsByGroup[sysName] ?? []
                      const hasDanger = alerts.some((a) => a.level === "danger")
                      const hasWarning = alerts.some(
                        (a) => a.level === "warning",
                      )
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
                          key={sysName}
                          className={`rounded-xl border px-3 py-2 text-xs ${tone}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {systemIconMap[sysName] ?? (
                                <CheckCircle className="h-4 w-4 text-slate-400" />
                              )}
                              <span className={`font-semibold ${labelColor}`}>
                                {sysName}
                              </span>
                            </div>
                            {/* 정상일 때: 초록 체크 + '정상' 배지 */}
                            {alerts.length === 0 && (
                              <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                <CheckCircle className="h-3 w-3" />
                                정상
                              </span>
                            )}
                          </div>

                          {/* 이상일 때: 기존 알람 상세 목록 */}
                          {alerts.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {alerts.map((a, i) => (
                                <div
                                  key={i}
                                  className="flex items-start justify-between gap-2"
                                >
                                  <span className="text-slate-600">{a.msg}</span>
                                  <span
                                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${a.level === "danger" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}
                                  >
                                    {a.method === "cusum" ? "CUSUM" : "연속 초과"}
                                  </span>
                                </div>
                              ))}
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