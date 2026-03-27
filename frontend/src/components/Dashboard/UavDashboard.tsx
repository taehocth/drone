import { useEffect, useRef, useState, useCallback } from "react"
import { NaverMap } from "@/components/Map/NaverMap"
import { WeatherInfoCard } from "@/components/Dashboard/WeatherInfoCard"
import DroneSimulation, {
  DroneData,
  DroneWsState,
  FlightStatusBadge,
} from "./DroneSimulation"
import { RealtimeCBMStatusCard } from "@/components/Dashboard/RealtimeCBMStatusCard"
import { convertGRID_GPS } from "@/utils/convertGrid"
import { GeminiChatCard } from "@/components/Dashboard/GeminiChatCard"
import {
  MapPin,
  Cloud,
  Activity,
  AlertTriangle,
  ArrowUp,
  MessageCircle,
  X,
  ChevronDown,
  ChevronUp,
  Wifi,
  WifiOff,
  Battery,
  Gauge,
  Navigation,
  Wrench,
  CheckCircle2,
  XCircle,
  Wind,
  Timer,
  BatteryLow,
  TrendingDown,
  PlaneLanding,
  Bell,
  BellOff,
  Lightbulb,
  Clock,
  Target,
  Radio,
} from "lucide-react"
import { createPortal } from "react-dom"

const DEFAULT_MAP_OPTIONS = {
  zoom: 11,
  center: { lat: 36.7881, lng: 126.4664 },
}

// ==========================
// Web Notification 훅
// ==========================
function useWebNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "denied",
  )

  useEffect(() => {
    if (!("Notification" in window)) return
    setPermission(Notification.permission)
  }, [])

  const requestPermission = async () => {
    if (!("Notification" in window)) return
    const result = await Notification.requestPermission()
    setPermission(result)
  }

  const sendNotification = (title: string, body: string, tag?: string) => {
    if (!("Notification" in window)) return
    if (Notification.permission !== "granted") return
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: tag ?? "drone-alert",
      requireInteraction: true,
    })
  }

  return { permission, requestPermission, sendNotification }
}

// ==========================
// 헬퍼 컴포넌트
// ==========================
const HelpHint = ({ text }: { text: string }) => (
  <button
    type="button"
    title={text}
    aria-label={text}
    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/70 bg-white/80 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800"
  >
    ?
  </button>
)

const GuideBanner = ({
  droneConnected,
  alertLevel,
  droneData,
}: {
  droneConnected: boolean
  alertLevel: "safe" | "caution" | "danger"
  droneData: DroneData | null
}) => {
  if (!droneConnected) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-5 py-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <WifiOff className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-900">
            1단계: 드론 연결이 필요합니다
          </p>
          <p className="mt-0.5 text-xs text-amber-700/80">
            아래 "기체 실시간 정보" 패널에서 드론을 연결하면 관제를 시작할 수
            있습니다.
          </p>
        </div>
      </div>
    )
  }
  if (!droneData) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-sky-200/60 bg-sky-50/80 px-5 py-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
          <Wifi className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-sky-900">
            연결됨 — 데이터 수신 중...
          </p>
          <p className="mt-0.5 text-xs text-sky-700/80">
            잠시 후 드론 위치와 상태 정보가 표시됩니다.
          </p>
        </div>
      </div>
    )
  }
  if (alertLevel === "danger") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200/60 bg-red-50/80 px-5 py-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 animate-pulse items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-red-900">
            위험 경고 발생 — 즉시 확인하세요
          </p>
          <p className="mt-0.5 text-xs text-red-700/80">
            아래 "임계값 알림" 카드에서 원인을 확인하고 조치하세요.
          </p>
        </div>
      </div>
    )
  }
  if (alertLevel === "caution") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-5 py-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-900">
            주의 항목 있음 — 알림 카드를 확인하세요
          </p>
          <p className="mt-0.5 text-xs text-amber-700/80">
            즉각 위험은 아니지만 빠른 점검이 필요한 항목이 있습니다.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200/60 bg-emerald-50/80 px-5 py-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <Activity className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-emerald-900">정상 운항 중</p>
        <p className="mt-0.5 text-xs text-emerald-700/80">
          모든 지표가 안전 범위입니다. 지도에서 드론 위치를 확인하세요.
        </p>
      </div>
    </div>
  )
}

const StatCard = ({
  icon,
  label,
  value,
  unit,
  level,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string | number | null
  unit?: string
  level?: "safe" | "caution" | "danger" | "off"
  hint: string
}) => {
  const levelStyle = {
    safe: "border-emerald-200/60 bg-emerald-50/60",
    caution: "border-amber-200/60 bg-amber-50/60",
    danger: "border-red-200/60 bg-red-50/60",
    off: "border-slate-200/40 bg-slate-50/60",
  }[level ?? "off"]
  const valueStyle = {
    safe: "text-emerald-700",
    caution: "text-amber-700",
    danger: "text-red-600",
    off: "text-slate-400",
  }[level ?? "off"]
  return (
    <div
      className={`group relative rounded-2xl border p-4 transition-all ${levelStyle}`}
    >
      <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
        <HelpHint text={hint} />
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className={`text-2xl font-semibold tracking-tight ${valueStyle}`}>
        {value ?? "—"}
        {value !== null && unit && (
          <span className="ml-1 text-sm font-normal opacity-70">{unit}</span>
        )}
      </div>
    </div>
  )
}

const SectionHeader = ({
  icon,
  title,
  desc,
  collapsible,
  collapsed,
  onToggle,
  badge,
}: {
  icon: React.ReactNode
  title: string
  desc?: string
  collapsible?: boolean
  collapsed?: boolean
  onToggle?: () => void
  badge?: React.ReactNode
}) => (
  <div
    className={`flex items-center justify-between gap-3 ${collapsible ? "cursor-pointer select-none" : ""}`}
    onClick={collapsible ? onToggle : undefined}
  >
    <div className="flex items-center gap-3">
      <div className="rounded-2xl bg-gradient-to-br from-slate-600 to-slate-500 p-2 shadow-sm [&>*]:h-4 [&>*]:w-4 [&>*]:text-white">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {desc && <p className="text-xs text-slate-500">{desc}</p>}
      </div>
    </div>
    <div className="flex items-center gap-2">
      {badge}
      {collapsible && (
        <span className="text-slate-400">
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </span>
      )}
    </div>
  </div>
)

const StatusBadge = ({
  level,
  label,
}: {
  level: "safe" | "caution" | "danger" | "off"
  label: string
}) => {
  const style = {
    safe: "bg-emerald-100 text-emerald-700",
    caution: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
    off: "bg-slate-100 text-slate-500",
  }[level]
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}
    >
      {label}
    </span>
  )
}

// ==========================
// 상황 판단 가이드
// ==========================
interface ActionGuide {
  priority: "immediate" | "soon" | "monitor" | "standby"
  title: string
  steps: string[]
  why: string
  icon: React.ReactNode
}

function buildActionGuides(
  droneConnected: boolean,
  droneData: DroneData | null,
  alerts: Array<{
    id: string
    level: "safe" | "caution" | "danger"
    label: string
  }>,
): ActionGuide[] {
  const guides: ActionGuide[] = []

  if (!droneConnected) {
    guides.push({
      priority: "standby",
      title: "연결 대기 중",
      steps: [
        "기체 전원이 켜져 있는지 확인하세요",
        "GCS와 기체가 동일 네트워크에 있는지 확인하세요",
        "'기체 실시간 정보' 패널에서 연결을 시도하세요",
      ],
      why: "기체가 연결되지 않으면 관제를 시작할 수 없습니다.",
      icon: <WifiOff className="h-5 w-5" />,
    })
    return guides
  }

  const battery = droneData?.battery ?? null
  const altitude = droneData?.altitude ?? null

  if (battery !== null && battery <= 20) {
    guides.push({
      priority: "immediate",
      title: "즉시 귀환 (RTL) 실행",
      steps: [
        "현재 임무를 즉시 중단하세요",
        "비행 모드를 'RTL(Return to Launch)'로 전환하세요",
        "착륙 지점 주변 인원을 대피시키세요",
        "착륙 완료 후 즉시 배터리를 분리하세요",
      ],
      why: `배터리가 ${battery.toFixed(0)}%로 위험 수준입니다. RTL 비행 중 방전 시 추락합니다.`,
      icon: <BatteryLow className="h-5 w-5" />,
    })
  } else if (battery !== null && battery <= 35) {
    guides.push({
      priority: "soon",
      title: "귀환 준비 시작",
      steps: [
        "현재 임무 단계를 마무리하세요",
        "5분 내 귀환 비행을 시작할 준비를 하세요",
        "자동 귀환 배터리 임계값(통상 25%)에 도달하기 전에 수동 복귀하세요",
      ],
      why: `배터리 ${battery.toFixed(0)}% — 귀환까지 여유가 줄어들고 있습니다.`,
      icon: <Battery className="h-5 w-5" />,
    })
  }

  if (altitude !== null && altitude > 150) {
    guides.push({
      priority: "immediate",
      title: "즉시 고도 낮추기",
      steps: [
        "수동 모드로 전환하고 하강 명령을 내리세요",
        "목표 고도 120m 이하로 안전하게 하강시키세요",
        "항공법 위반 상황 — 인근 관제탑에 보고가 필요할 수 있습니다",
      ],
      why: `현재 고도 ${altitude.toFixed(0)}m는 항공법상 허용 한도(150m)를 초과합니다.`,
      icon: <Navigation className="h-5 w-5" />,
    })
  }

  if (droneData?.timestamp) {
    const ageMs = Date.now() - new Date(droneData.timestamp).getTime()
    if (!isNaN(ageMs) && ageMs > 15000) {
      guides.push({
        priority: "immediate",
        title: "통신 이상 — 즉각 대응",
        steps: [
          "GCS 화면에서 수동 개입이 가능한지 확인하세요",
          "기체가 페일세이프 동작(자동 호버링/귀환)을 수행하는지 목시 확인하세요",
          "통신 복구를 기다리되 복구 안 되면 수동 RTL 명령을 시도하세요",
        ],
        why: "15초 이상 데이터가 끊겼습니다. 기체가 페일세이프 모드로 진입했을 수 있습니다.",
        icon: <Radio className="h-5 w-5" />,
      })
    }
  }

  if (guides.length === 0 && droneData) {
    guides.push({
      priority: "monitor",
      title: "정상 운항 — 지속 모니터링",
      steps: [
        `배터리: ${battery?.toFixed(0) ?? "—"}% — ${(battery ?? 100) > 50 ? "충분. 계속 모니터링하세요" : "절반 이하. 귀환 계획 수립하세요"}`,
        `고도: ${altitude?.toFixed(0) ?? "—"}m — ${(altitude ?? 0) <= 120 ? "안전 범위" : "주의 고도"}`,
        "GPS 신호 및 통신 상태를 30초마다 확인하세요",
        "비행 중 주변 공역 변화(다른 항공기 등)를 주시하세요",
      ],
      why: "현재 모든 지표가 정상 범위입니다. 예방적 모니터링을 유지하세요.",
      icon: <Target className="h-5 w-5" />,
    })
  }

  return guides
}

const PRIORITY_CONFIG = {
  immediate: {
    label: "즉시 조치",
    border: "border-red-200/60",
    bg: "bg-red-50/80",
    iconBg: "from-red-500 to-rose-500",
    text: "text-red-700",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500 animate-ping",
  },
  soon: {
    label: "곧 조치",
    border: "border-amber-200/60",
    bg: "bg-amber-50/80",
    iconBg: "from-amber-500 to-yellow-400",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
  monitor: {
    label: "모니터링",
    border: "border-emerald-200/60",
    bg: "bg-emerald-50/80",
    iconBg: "from-emerald-500 to-teal-500",
    text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  standby: {
    label: "대기 중",
    border: "border-slate-200/60",
    bg: "bg-slate-50/80",
    iconBg: "from-slate-400 to-slate-500",
    text: "text-slate-600",
    badge: "bg-slate-100 text-slate-500",
    dot: "bg-slate-400",
  },
}

function ActionGuideWidget({
  droneConnected,
  droneData,
  alerts,
}: {
  droneConnected: boolean
  droneData: DroneData | null
  alerts: Array<{
    id: string
    level: "safe" | "caution" | "danger"
    label: string
  }>
}) {
  const [collapsed, setCollapsed] = useState(false)
  const guides = buildActionGuides(droneConnected, droneData, alerts)
  const topGuide = guides[0]
  if (!topGuide) return null
  const cfg = PRIORITY_CONFIG[topGuide.priority]

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
      <div
        className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-4 transition-colors hover:bg-slate-100/60"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 p-2 shadow-sm">
            <Lightbulb className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">
              지금 뭘 해야 하나요?
            </p>
            <p className="text-xs text-slate-500">
              현재 상태에 따른 단계별 행동 가이드
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}
          >
            {cfg.label}
          </span>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="space-y-3 p-4">
          {guides.map((guide, idx) => {
            const c = PRIORITY_CONFIG[guide.priority]
            return (
              <div
                key={idx}
                className={`rounded-2xl border ${c.border} ${c.bg} overflow-hidden`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${c.iconBg} text-white shadow-sm`}
                  >
                    {guide.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span
                          className={`absolute inline-flex h-full w-full rounded-full opacity-50 ${c.dot}`}
                        />
                        <span
                          className={`relative inline-flex h-2 w-2 rounded-full ${c.dot.replace("animate-ping", "")}`}
                        />
                      </span>
                      <p className={`text-sm font-bold ${c.text}`}>
                        {guide.title}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{guide.why}</p>
                  </div>
                </div>
                <div className="space-y-2 border-t border-white/60 px-4 py-3">
                  {guide.steps.map((step, si) => (
                    <div key={si} className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/80 text-xs font-bold ${c.text}`}
                      >
                        {si + 1}
                      </span>
                      <p className="text-xs leading-relaxed text-slate-700">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ==========================
// 비행 이벤트 로그
// ==========================
interface FlightLogEntry {
  id: string
  ts: Date
  level: "info" | "warn" | "danger" | "success"
  message: string
  value?: string
}

function useFlightLog(
  droneConnected: boolean,
  droneData: DroneData | null,
  alertLevel: "safe" | "caution" | "danger",
) {
  const [logs, setLogs] = useState<FlightLogEntry[]>([])
  const prevRef = useRef({
    connected: false,
    alertLevel: "safe" as "safe" | "caution" | "danger",
    battery: null as number | null,
    altitude: null as number | null,
  })

  const addLog = useCallback(
    (level: FlightLogEntry["level"], message: string, value?: string) => {
      setLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          ts: new Date(),
          level,
          message,
          value,
        },
        ...prev.slice(0, 49),
      ])
    },
    [],
  )

  useEffect(() => {
    if (droneConnected && !prevRef.current.connected)
      addLog("success", "기체 연결됨")
    else if (!droneConnected && prevRef.current.connected)
      addLog("warn", "기체 연결 끊김")
    prevRef.current.connected = droneConnected
  }, [droneConnected, addLog])

  useEffect(() => {
    if (alertLevel === "danger" && prevRef.current.alertLevel !== "danger")
      addLog("danger", "⚠️ 위험 경고 발생")
    else if (alertLevel === "caution" && prevRef.current.alertLevel === "safe")
      addLog("warn", "주의 항목 감지")
    else if (alertLevel === "safe" && prevRef.current.alertLevel !== "safe")
      addLog("success", "상태 정상 회복")
    prevRef.current.alertLevel = alertLevel
  }, [alertLevel, addLog])

  useEffect(() => {
    const b = droneData?.battery ?? null
    const prev = prevRef.current.battery
    if (b !== null && prev !== null) {
      if (b <= 20 && prev > 20)
        addLog("danger", "배터리 위험 임계값 도달", `${b.toFixed(0)}%`)
      else if (b <= 35 && prev > 35)
        addLog("warn", "배터리 주의 임계값 도달", `${b.toFixed(0)}%`)
      else if (b <= 50 && prev > 50)
        addLog("info", "배터리 50% 이하", `${b.toFixed(0)}%`)
    }
    prevRef.current.battery = b
  }, [droneData?.battery, addLog])

  useEffect(() => {
    const a = droneData?.altitude ?? null
    const prev = prevRef.current.altitude
    if (a !== null && prev !== null) {
      if (a > 150 && prev <= 150)
        addLog("danger", "고도 법정 한계 초과", `${a.toFixed(0)}m`)
      else if (a > 120 && prev <= 120)
        addLog("warn", "고도 주의 구간 진입", `${a.toFixed(0)}m`)
      else if (a <= 120 && prev > 120)
        addLog("info", "고도 안전 구간 복귀", `${a.toFixed(0)}m`)
    }
    prevRef.current.altitude = a
  }, [droneData?.altitude, addLog])

  return { logs, addLog }
}

const LOG_STYLE: Record<
  FlightLogEntry["level"],
  { dot: string; text: string; bg: string }
> = {
  danger: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
  warn: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
  info: { dot: "bg-sky-400", text: "text-slate-700", bg: "bg-slate-50" },
  success: {
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
  },
}

function FlightLogWidget({ logs }: { logs: FlightLogEntry[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const fmt = (d: Date) =>
    d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
      <div
        className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-4 transition-colors hover:bg-slate-100/60"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 p-2 shadow-sm">
            <Clock className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">
              비행 이벤트 로그
            </p>
            <p className="text-xs text-slate-500">
              상태 변화, 경고, 연결 이벤트를 시간순 기록
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
            {logs.length}건
          </span>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="p-4">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Clock className="h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400">이벤트가 없습니다</p>
              <p className="text-xs text-slate-300">
                드론 연결 시 이벤트가 자동 기록됩니다
              </p>
            </div>
          ) : (
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {logs.map((log) => {
                const s = LOG_STYLE[log.level]
                return (
                  <div
                    key={log.id}
                    className={`flex items-center gap-3 rounded-xl ${s.bg} px-3 py-2.5`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`}
                    />
                    <span className="w-20 shrink-0 text-xs tabular-nums text-slate-400">
                      {fmt(log.ts)}
                    </span>
                    <span className={`flex-1 text-xs font-medium ${s.text}`}>
                      {log.message}
                    </span>
                    {log.value && (
                      <span className="shrink-0 rounded-lg bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {log.value}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ==========================
// 배터리 RTL 예측
// ==========================
interface RtlPrediction {
  drainRatePerMin: number | null
  remainingSec: number | null
  elapsedSec: number
  level: "safe" | "caution" | "danger" | "off"
  startBattery: number | null
}

const RTL_RESERVE_PCT = 20

function useRtlPrediction(
  droneActive: boolean,
  battery: number | undefined | null,
): RtlPrediction {
  const startRef = useRef<{ battery: number; time: number } | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (droneActive && battery != null) {
      if (!startRef.current) startRef.current = { battery, time: Date.now() }
    } else {
      startRef.current = null
      setElapsedSec(0)
    }
  }, [droneActive])

  useEffect(() => {
    if (!droneActive) return
    const id = setInterval(() => {
      if (startRef.current)
        setElapsedSec(Math.floor((Date.now() - startRef.current.time) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [droneActive])

  if (!droneActive || battery == null || startRef.current == null) {
    return {
      drainRatePerMin: null,
      remainingSec: null,
      elapsedSec: 0,
      level: "off",
      startBattery: null,
    }
  }

  const elapsedMin = elapsedSec / 60
  const consumed = startRef.current.battery - battery

  if (elapsedMin < 0.5 || consumed < 0.1) {
    return {
      drainRatePerMin: null,
      remainingSec: null,
      elapsedSec,
      level: "off",
      startBattery: startRef.current.battery,
    }
  }

  const drainRatePerMin = consumed / elapsedMin
  const usableBattery = battery - RTL_RESERVE_PCT
  const remainingSec =
    usableBattery > 0 ? Math.floor((usableBattery / drainRatePerMin) * 60) : 0
  const level: RtlPrediction["level"] =
    remainingSec <= 0
      ? "danger"
      : remainingSec <= 180
        ? "danger"
        : remainingSec <= 360
          ? "caution"
          : "safe"

  return {
    drainRatePerMin,
    remainingSec,
    elapsedSec,
    level,
    startBattery: startRef.current.battery,
  }
}

function RtlPredictionWidget({
  droneActive,
  battery,
}: {
  droneActive: boolean
  battery: number | undefined | null
}) {
  const rtl = useRtlPrediction(droneActive, battery)

  const formatTime = (sec: number) => {
    if (sec <= 0) return "0분 0초"
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m > 0 ? `${m}분 ${s}초` : `${s}초`
  }

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m > 0 ? `${m}분 ${s}초` : `${s}초`
  }

  const levelStyle = {
    safe: {
      border: "border-emerald-200/60",
      bg: "bg-emerald-50/80",
      iconBg: "from-emerald-500 to-teal-500",
      text: "text-emerald-700",
      bar: "bg-emerald-500",
    },
    caution: {
      border: "border-amber-200/60",
      bg: "bg-amber-50/80",
      iconBg: "from-amber-500 to-yellow-400",
      text: "text-amber-700",
      bar: "bg-amber-500",
    },
    danger: {
      border: "border-red-200/60",
      bg: "bg-red-50/80",
      iconBg: "from-red-500 to-rose-500",
      text: "text-red-700",
      bar: "bg-red-500",
    },
    off: {
      border: "border-slate-200/60",
      bg: "bg-slate-50/80",
      iconBg: "from-slate-400 to-slate-500",
      text: "text-slate-500",
      bar: "bg-slate-300",
    },
  }[rtl.level]

  const batteryPct = battery ?? 0
  const usablePct = Math.max(0, batteryPct - RTL_RESERVE_PCT)
  const reservePct = Math.min(batteryPct, RTL_RESERVE_PCT)

  const mainLabel = !droneActive
    ? "기체 연결 후 예측 시작"
    : rtl.remainingSec === null
      ? "데이터 수집 중... (30초 후 계산)"
      : rtl.remainingSec <= 0
        ? "즉시 귀환 필요"
        : `약 ${formatTime(rtl.remainingSec)} 더 비행 가능`

  const sublabel = !droneActive
    ? "드론이 활성화되면 소모율을 추적합니다"
    : rtl.remainingSec === null
      ? `비행 시작 후 ${formatElapsed(rtl.elapsedSec)} 경과`
      : rtl.level === "danger"
        ? "귀환 후 충전하세요"
        : rtl.level === "caution"
          ? "귀환을 준비하세요"
          : "여유 있습니다"

  return (
    <div
      className={`rounded-3xl border ${levelStyle.border} ${levelStyle.bg} overflow-hidden`}
    >
      <div className="flex items-center gap-4 px-6 py-5">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${levelStyle.iconBg} text-white shadow-lg`}
        >
          <PlaneLanding className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            배터리 RTL 예측
          </h3>
          <p className={`mt-0.5 text-lg font-bold ${levelStyle.text}`}>
            {mainLabel}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{sublabel}</p>
        </div>
        {droneActive && rtl.elapsedSec > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-400">비행 경과</p>
            <p className="text-base font-semibold tabular-nums text-slate-700">
              {formatElapsed(rtl.elapsedSec)}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-4 border-t border-slate-200/50 px-6 py-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-slate-500">
              <BatteryLow className="h-3.5 w-3.5" />
              배터리 잔량
            </span>
            <span className={`font-semibold ${levelStyle.text}`}>
              {battery != null ? `${battery.toFixed(0)}%` : "—"}
            </span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200/60">
            <div
              className={`h-full transition-all duration-500 ${levelStyle.bar}`}
              style={{ width: `${usablePct}%` }}
            />
            <div
              className="h-full bg-red-300/70 transition-all duration-500"
              style={{ width: `${reservePct}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-400">
            <span>예비 {RTL_RESERVE_PCT}% 제외</span>
            <span>
              시작 시{" "}
              {rtl.startBattery != null
                ? `${rtl.startBattery.toFixed(0)}%`
                : "—"}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/70 px-3 py-2.5 text-center">
            <TrendingDown className="mx-auto mb-1 h-4 w-4 text-slate-400" />
            <p className="text-xs text-slate-500">분당 소모</p>
            <p className="text-sm font-semibold tabular-nums text-slate-700">
              {rtl.drainRatePerMin != null
                ? `${rtl.drainRatePerMin.toFixed(2)}%`
                : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/70 px-3 py-2.5 text-center">
            <Timer className="mx-auto mb-1 h-4 w-4 text-slate-400" />
            <p className="text-xs text-slate-500">남은 시간</p>
            <p
              className={`text-sm font-semibold tabular-nums ${rtl.remainingSec != null ? levelStyle.text : "text-slate-400"}`}
            >
              {rtl.remainingSec != null ? formatTime(rtl.remainingSec) : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/70 px-3 py-2.5 text-center">
            <PlaneLanding className="mx-auto mb-1 h-4 w-4 text-slate-400" />
            <p className="text-xs text-slate-500">RTL 기준</p>
            <p className="text-sm font-semibold text-slate-700">
              {RTL_RESERVE_PCT}% 예비
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ==========================
// 비행 가능 여부 종합 위젯
// ==========================
interface FlightFeasibilityWidgetProps {
  droneConnected: boolean
  droneData: DroneData | null
  alertLevel: "safe" | "caution" | "danger"
  alerts: Array<{
    id: string
    level: "safe" | "caution" | "danger"
    label: string
  }>
  allDroneStates: DroneWsState[]
}

type FeasibilityResult = "go" | "caution" | "no-go" | "unknown"

interface CheckItem {
  id: string
  label: string
  result: "pass" | "warn" | "fail" | "unknown"
  detail: string
}

function FlightFeasibilityWidget({
  droneConnected,
  droneData,
  alertLevel,
  alerts,
  allDroneStates,
}: FlightFeasibilityWidgetProps) {
  const checks: CheckItem[] = []

  checks.push({
    id: "connection",
    label: "드론 연결",
    result: droneConnected ? "pass" : "fail",
    detail: droneConnected ? "연결됨" : "연결 안 됨 — 기체를 선택하세요",
  })

  const battery = droneData?.battery
  checks.push({
    id: "battery",
    label: "배터리",
    result:
      battery == null
        ? "unknown"
        : battery > 50
          ? "pass"
          : battery > 30
            ? "warn"
            : "fail",
    detail:
      battery == null
        ? "데이터 없음"
        : battery > 50
          ? `${battery.toFixed(0)}% — 충분`
          : battery > 30
            ? `${battery.toFixed(0)}% — 짧은 비행만 가능`
            : `${battery.toFixed(0)}% — 충전 필요`,
  })

  const hasgps =
    typeof droneData?.latitude === "number" &&
    typeof droneData?.longitude === "number"
  const satellites = droneData?.gpsSatellites
  checks.push({
    id: "gps",
    label: "GPS",
    result: !droneConnected
      ? "unknown"
      : hasgps && (satellites == null || satellites > 6)
        ? "pass"
        : hasgps
          ? "warn"
          : "fail",
    detail: !droneConnected
      ? "데이터 없음"
      : hasgps
        ? `위성 ${satellites ?? "?"}개 — 위치 확인됨`
        : "GPS 신호 없음 — 비행 불가",
  })

  const timestampAge = droneData?.timestamp
    ? Date.now() - new Date(droneData.timestamp).getTime()
    : null
  checks.push({
    id: "latency",
    label: "통신 지연",
    result:
      timestampAge == null
        ? "unknown"
        : timestampAge < 5000
          ? "pass"
          : timestampAge < 10000
            ? "warn"
            : "fail",
    detail:
      timestampAge == null
        ? "데이터 없음"
        : timestampAge < 5000
          ? "정상 (<5초)"
          : timestampAge < 10000
            ? `${(timestampAge / 1000).toFixed(0)}초 지연 — 주의`
            : `${(timestampAge / 1000).toFixed(0)}초 지연 — 통신 점검 필요`,
  })

  const dangerAlerts = alerts.filter((a) => a.level === "danger")
  const cautionAlerts = alerts.filter((a) => a.level === "caution")
  checks.push({
    id: "alerts",
    label: "위험 알림",
    result: !droneConnected
      ? "unknown"
      : dangerAlerts.length > 0
        ? "fail"
        : cautionAlerts.length > 0
          ? "warn"
          : "pass",
    detail: !droneConnected
      ? "연결 후 확인"
      : dangerAlerts.length > 0
        ? `위험 ${dangerAlerts.length}건 발생`
        : cautionAlerts.length > 0
          ? `주의 ${cautionAlerts.length}건`
          : "이상 없음",
  })

  const feasibility: FeasibilityResult = !droneConnected
    ? "unknown"
    : checks.some((c) => c.result === "fail")
      ? "no-go"
      : checks.some((c) => c.result === "warn")
        ? "caution"
        : "go"

  const feasibilityConfig = {
    go: {
      label: "비행 가능",
      sublabel: "모든 항목이 정상입니다",
      icon: <CheckCircle2 className="h-8 w-8" />,
      bg: "from-emerald-500 to-teal-500",
      border: "border-emerald-200/60",
      bg2: "bg-emerald-50/80",
      text: "text-emerald-700",
    },
    caution: {
      label: "주의 필요",
      sublabel: "일부 항목을 확인하세요",
      icon: <AlertTriangle className="h-8 w-8" />,
      bg: "from-amber-500 to-yellow-400",
      border: "border-amber-200/60",
      bg2: "bg-amber-50/80",
      text: "text-amber-700",
    },
    "no-go": {
      label: "비행 불가",
      sublabel: "위험 항목을 해결하세요",
      icon: <XCircle className="h-8 w-8 animate-pulse" />,
      bg: "from-red-500 to-rose-500",
      border: "border-red-200/60",
      bg2: "bg-red-50/80",
      text: "text-red-700",
    },
    unknown: {
      label: "판단 불가",
      sublabel: "드론을 연결하세요",
      icon: <Wind className="h-8 w-8" />,
      bg: "from-slate-400 to-slate-500",
      border: "border-slate-200/60",
      bg2: "bg-slate-50/80",
      text: "text-slate-500",
    },
  }[feasibility]

  const resultIcon = {
    pass: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    fail: <XCircle className="h-4 w-4 text-red-500" />,
    unknown: (
      <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-300" />
    ),
  }

  return (
    <div
      className={`rounded-3xl border ${feasibilityConfig.border} ${feasibilityConfig.bg2} overflow-hidden`}
    >
      <div className="flex items-center gap-5 px-6 py-5">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${feasibilityConfig.bg} text-white shadow-lg`}
        >
          {feasibilityConfig.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`text-xl font-bold ${feasibilityConfig.text}`}>
            {feasibilityConfig.label}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {feasibilityConfig.sublabel}
          </p>
        </div>
        <div className="hidden shrink-0 flex-col gap-1.5 sm:flex">
          {allDroneStates.map((state, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-20 truncate text-xs text-slate-500">
                {["DM4_1", "DM4_2", "DM3"][idx]}
              </span>
              <FlightStatusBadge
                status={state.connected ? state.flightStatus : "unknown"}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-200/50 px-6 py-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {checks.map((check) => (
            <div
              key={check.id}
              className="flex items-start gap-2.5 rounded-xl bg-white/70 px-3 py-2.5"
            >
              <span className="mt-0.5 shrink-0">
                {resultIcon[check.result]}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">
                  {check.label}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {check.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ==========================
// 유틸리티
// ==========================
const formatLastUpdate = (timestamp?: string | number | null) => {
  if (!timestamp) return "—"
  const ms =
    typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime()
  if (Number.isNaN(ms)) return "—"
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (diffSec < 5) return "방금"
  if (diffSec < 60) return `${diffSec}초 전`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}분 전`
  return `${Math.floor(diffMin / 60)}시간 전`
}

const getBatteryLevel = (
  v?: number | null,
): "safe" | "caution" | "danger" | "off" => {
  if (v == null) return "off"
  if (v <= 20) return "danger"
  if (v <= 35) return "caution"
  return "safe"
}

const getAltitudeLevel = (
  v?: number | null,
): "safe" | "caution" | "danger" | "off" => {
  if (v == null) return "off"
  if (v > 150) return "danger"
  if (v > 120) return "caution"
  return "safe"
}

const getSpeedLevel = (
  v?: number | null,
): "safe" | "caution" | "danger" | "off" => {
  if (v == null) return "off"
  if (v > 35) return "danger"
  if (v > 25) return "caution"
  return "safe"
}

// ==========================
// UAV Dashboard Component
// ==========================
export function UavDashboard() {
  const [clickedCoordinates, setClickedCoordinates] = useState<{
    nx: number
    ny: number
  } | null>(null)
  const [droneConnected, setDroneConnected] = useState(false)
  const [droneData, setDroneData] = useState<DroneData | null>(null)

  // ★ 기체 위치가 바뀌면 자동으로 날씨 업데이트
  useEffect(() => {
    if (droneData?.latitude != null && droneData?.longitude != null) {
      const { nx, ny } = convertGRID_GPS(
        "toXY",
        droneData.latitude,
        droneData.longitude,
      )
      setClickedCoordinates({ nx, ny })
    }
  }, [droneData?.latitude, droneData?.longitude])

  const [showAlertDetails, setShowAlertDetails] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const [allDroneStates, setAllDroneStates] = useState<DroneWsState[]>([
    {
      wsConnected: false,
      droneActive: false,
      connected: false,
      data: null,
      flightStatus: "unknown",
    },
    {
      wsConnected: false,
      droneActive: false,
      connected: false,
      data: null,
      flightStatus: "unknown",
    },
    {
      wsConnected: false,
      droneActive: false,
      connected: false,
      data: null,
      flightStatus: "unknown",
    },
  ])

  const [collapseMap, setCollapseMap] = useState(false)
  const [collapseMonitor, setCollapseMonitor] = useState(false)
  const [collapseWeather, setCollapseWeather] = useState(false)
  const [collapseCBM, setCollapseCBM] = useState(false)

  const { permission, requestPermission, sendNotification } =
    useWebNotification()
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const prevAlertLevelRef = useRef<"safe" | "caution" | "danger">("safe")

  const alerts = (() => {
    if (!droneConnected) return []
    if (!droneData)
      return [
        {
          id: "waiting",
          level: "caution" as const,
          label: "데이터 수신 대기 중",
        },
      ]

    const next: Array<{
      id: string
      level: "safe" | "caution" | "danger"
      label: string
    }> = []

    if (typeof droneData.battery === "number") {
      if (droneData.battery <= 20)
        next.push({
          id: "battery",
          level: "danger",
          label: `배터리 위험 (${droneData.battery.toFixed(0)}%) — 즉시 복귀`,
        })
      else if (droneData.battery <= 35)
        next.push({
          id: "battery",
          level: "caution",
          label: `배터리 주의 (${droneData.battery.toFixed(0)}%)`,
        })
    }
    if (typeof droneData.altitude === "number") {
      if (droneData.altitude > 150)
        next.push({
          id: "altitude",
          level: "danger",
          label: `고도 초과 (${droneData.altitude.toFixed(0)}m > 150m)`,
        })
      else if (droneData.altitude > 120)
        next.push({
          id: "altitude",
          level: "caution",
          label: `고도 주의 (${droneData.altitude.toFixed(0)}m)`,
        })
    }
    if (typeof droneData.speed === "number") {
      if (droneData.speed > 35)
        next.push({
          id: "speed",
          level: "danger",
          label: `과속 위험 (${droneData.speed.toFixed(0)}m/s)`,
        })
      else if (droneData.speed > 25)
        next.push({
          id: "speed",
          level: "caution",
          label: `과속 주의 (${droneData.speed.toFixed(0)}m/s)`,
        })
    }

    const hasGps =
      typeof droneData.latitude === "number" &&
      typeof droneData.longitude === "number"
    if (!hasGps)
      next.push({
        id: "gps",
        level: "caution",
        label: "GPS 신호 약함 — 위치 정확도 저하",
      })

    if (droneData.timestamp) {
      const ageMs = Date.now() - new Date(droneData.timestamp).getTime()
      if (!Number.isNaN(ageMs)) {
        if (ageMs > 15000)
          next.push({
            id: "stale",
            level: "danger",
            label: "데이터 지연 15초+ — 통신 점검 필요",
          })
        else if (ageMs > 8000)
          next.push({
            id: "stale",
            level: "caution",
            label: "데이터 지연 8초+",
          })
      }
    }
    return next
  })()

  const alertLevel = alerts.some((a) => a.level === "danger")
    ? "danger"
    : alerts.some((a) => a.level === "caution")
      ? "caution"
      : "safe"

  useEffect(() => {
    if (
      alertLevel === "danger" &&
      prevAlertLevelRef.current !== "danger" &&
      notifyEnabled &&
      permission === "granted"
    ) {
      const dangerBody = alerts
        .filter((a) => a.level === "danger")
        .map((a) => a.label)
        .join("\n")
      sendNotification("🚨 드론 위험 경고", dangerBody, "drone-danger")
    }
    prevAlertLevelRef.current = alertLevel
  }, [alertLevel]) // eslint-disable-line react-hooks/exhaustive-deps

  const { logs } = useFlightLog(droneConnected, droneData, alertLevel)

  const alertTone =
    alertLevel === "danger"
      ? "bg-red-100 text-red-700"
      : alertLevel === "caution"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700"

  const connectionLabel = droneConnected ? "연결됨" : "연결 대기"
  const connectionTone = droneConnected
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-700"
  const lastUpdateLabel = formatLastUpdate(droneData?.timestamp ?? null)
  const batteryVal =
    droneData?.battery != null ? `${droneData.battery.toFixed(0)}` : null
  const altitudeVal =
    droneData?.altitude != null ? `${droneData.altitude.toFixed(0)}` : null
  const speedVal =
    droneData?.speed != null ? `${droneData.speed.toFixed(1)}` : null
  const gpsVal =
    droneData?.latitude != null && droneData?.longitude != null
      ? `${droneData.gpsSatellites ?? "?"} 위성`
      : null

  const renderNotificationButton = () => {
    if (typeof window === "undefined" || !("Notification" in window))
      return null
    if (permission === "denied") {
      return (
        <span
          className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400"
          title="브라우저 설정에서 알림을 허용해주세요"
        >
          <BellOff className="h-3.5 w-3.5" />
          알림 차단됨
        </span>
      )
    }
    if (permission === "default") {
      return (
        <button
          type="button"
          onClick={requestPermission}
          className="flex items-center gap-1.5 rounded-full border border-indigo-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
        >
          <Bell className="h-3.5 w-3.5" />
          알림 허용
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={() => setNotifyEnabled((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 ${notifyEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
      >
        {notifyEnabled ? (
          <Bell className="h-3.5 w-3.5" />
        ) : (
          <BellOff className="h-3.5 w-3.5" />
        )}
        {notifyEnabled ? "알림 켜짐" : "알림 꺼짐"}
      </button>
    )
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden scroll-smooth text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {/* 헤더 */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-sm">
              <Activity className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                드론 관제 센터
              </h1>
              <p className="text-xs uppercase tracking-widest text-slate-400">
                Drone Operations Hub
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {renderNotificationButton()}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${connectionTone}`}
            >
              <span className="relative flex h-2 w-2">
                {droneConnected && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
              </span>
              {connectionLabel}
            </span>
            <span className="text-xs text-slate-400">
              업데이트 {lastUpdateLabel}
            </span>
          </div>
        </div>

        {/* 상황 안내 배너 */}
        <GuideBanner
          droneConnected={droneConnected}
          alertLevel={alertLevel}
          droneData={droneData}
        />

        {/* 비행 가능 여부 종합 위젯 */}
        {/* 비행 가능 여부 + 지금 뭘 해야 하나요? — 2분할 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FlightFeasibilityWidget
            droneConnected={droneConnected}
            droneData={droneData}
            alertLevel={alertLevel}
            alerts={alerts}
            allDroneStates={allDroneStates}
          />
          <ActionGuideWidget
            droneConnected={droneConnected}
            droneData={droneData}
            alerts={alerts}
          />
        </div>

        {/* Sticky 관제 상태바 */}
        <div className="sticky top-2 z-20 rounded-2xl border border-slate-200/60 bg-white/90 px-4 py-3 shadow-lg shadow-slate-200/40 ring-1 ring-white/70 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold uppercase tracking-widest text-slate-400">
                운영 상태
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <Wifi className="h-3.5 w-3.5" />
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${connectionTone}`}
                >
                  {connectionLabel}
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="text-slate-400">마지막 갱신</span>
                <span className="font-semibold text-slate-800">
                  {lastUpdateLabel}
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  setShowAlertDetails((prev) => (alerts.length ? !prev : prev))
                }
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition ${alertTone} ${alerts.length ? "hover:opacity-80" : "cursor-default"}`}
                disabled={!alerts.length}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                알림 {alerts.length ? `${alerts.length}건` : "없음"}
              </button>
            </div>
            <HelpHint text="관제 핵심 상태를 한 줄로 요약합니다." />
          </div>
          {showAlertDetails && alerts.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-slate-200/60 pt-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${alert.level === "danger" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${alert.level === "danger" ? "bg-red-500" : "bg-amber-500"}`}
                  />
                  {alert.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 핵심 수치 요약 카드 */}
        {droneConnected && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={<Battery className="h-4 w-4" />}
              label="배터리"
              value={batteryVal}
              unit="%"
              level={getBatteryLevel(droneData?.battery)}
              hint="배터리 잔량입니다. 35% 이하이면 복귀를 준비하세요."
            />
            <StatCard
              icon={<Navigation className="h-4 w-4" />}
              label="고도"
              value={altitudeVal}
              unit="m"
              level={getAltitudeLevel(droneData?.altitude)}
              hint="현재 비행 고도입니다. 150m를 초과하면 법적 제한에 걸릴 수 있습니다."
            />
            <StatCard
              icon={<Gauge className="h-4 w-4" />}
              label="속도"
              value={speedVal}
              unit="m/s"
              level={getSpeedLevel(droneData?.speed)}
              hint="현재 비행 속도입니다. 25m/s를 초과하면 주의가 필요합니다."
            />
            <StatCard
              icon={<MapPin className="h-4 w-4" />}
              label="GPS"
              value={gpsVal}
              level={gpsVal ? "safe" : droneConnected ? "caution" : "off"}
              hint="연결된 GPS 위성 수입니다."
            />
          </div>
        )}

        {/* 드론 위치 지도 */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
          <div
            className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-4 transition-colors hover:bg-slate-100/60"
            onClick={() => setCollapseMap((v) => !v)}
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-2 shadow-sm">
                <MapPin className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">
                  드론 위치
                </p>
                <p className="text-xs text-slate-500">
                  지도를 클릭하면 해당 위치의 기상 정보를 조회합니다
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <HelpHint text="드론의 실시간 위치를 지도에서 확인합니다." />
              </div>
              <span className="text-slate-400">
                {collapseMap ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </span>
            </div>
          </div>
          {!collapseMap && (
            <div className="aspect-video overflow-hidden">
              <NaverMap
                lat={DEFAULT_MAP_OPTIONS.center.lat}
                lng={DEFAULT_MAP_OPTIONS.center.lng}
                dronePosition={
                  droneData &&
                  typeof droneData.latitude === "number" &&
                  typeof droneData.longitude === "number"
                    ? {
                        lat: droneData.latitude,
                        lng: droneData.longitude,
                        yaw: droneData.yawInt,
                        satellites: droneData.gpsSatellites,
                      }
                    : undefined
                }
                onMapClick={(nx, ny) => setClickedCoordinates({ nx, ny })}
                droneStats={{
                  battery: droneData?.battery,
                  altitude: droneData?.altitude,
                  speed: droneData?.speed,
                }}
              />
            </div>
          )}
        </div>

        {/* ==================== 2단 그리드 ==================== */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* 왼쪽: 기체 실시간 정보 + 이벤트 로그 + 임계값 알림 */}
          <div className="space-y-5">
            {/* 기체 실시간 정보 */}
            <div className="rounded-3xl border border-slate-200/60 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <SectionHeader
                  icon={<Activity />}
                  title="기체 실시간 정보"
                  desc="자세, 속도, 배터리, 위치를 실시간 모니터링"
                  collapsible
                  collapsed={collapseMonitor}
                  onToggle={() => setCollapseMonitor((v) => !v)}
                  badge={
                    <StatusBadge
                      level={droneConnected ? "safe" : "off"}
                      label={droneConnected ? "수신 중" : "미연결"}
                    />
                  }
                />
              </div>
              <div className="p-4">
                <div className={collapseMonitor ? "hidden" : ""}>
                  <DroneSimulation
                    onConnectionChange={setDroneConnected}
                    onData={setDroneData}
                    onAllDroneStates={setAllDroneStates}
                  />
                </div>
              </div>
            </div>

            {/* 비행 이벤트 로그 */}
            <FlightLogWidget logs={logs} />

            {/* 임계값 알림 — 왼쪽 하단 (기존 체크리스트 자리) */}
            <div className="rounded-3xl border border-slate-200/60 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <SectionHeader
                  icon={<AlertTriangle />}
                  title="임계값 알림"
                  desc="배터리·고도·속도·GPS·통신 지연 감지"
                  badge={
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowAlertDetails((prev) =>
                          alerts.length ? !prev : prev,
                        )
                      }}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${alertTone} ${alerts.length ? "hover:opacity-80" : "cursor-default"}`}
                    >
                      {droneConnected
                        ? alerts.length
                          ? `${alerts.length}건 주의`
                          : "정상"
                        : "미연결"}
                    </button>
                  }
                />
              </div>
              <div className="p-4">
                {!droneConnected ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    기체 연결 후 임계값 알림을 확인할 수 있습니다.
                  </p>
                ) : alerts.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 px-4 py-3 text-sm font-medium text-emerald-700">
                    모든 항목이 정상 범위입니다.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`rounded-2xl border px-4 py-3 text-xs font-medium ${alert.level === "danger" ? "border-red-200/60 bg-red-50 text-red-700" : "border-amber-200/60 bg-amber-50 text-amber-700"}`}
                      >
                        {alert.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 오른쪽: 기상 정보 + CBM + 연결 안내 */}
          <div className="space-y-5">
            {/* 기상 정보 */}
            <div className="rounded-3xl border border-slate-200/60 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <SectionHeader
                  icon={<Cloud />}
                  title="기상 정보"
                  desc="지도 클릭 위치의 실시간 기상 및 비행 안전성"
                  collapsible
                  collapsed={collapseWeather}
                  onToggle={() => setCollapseWeather((v) => !v)}
                />
              </div>
              {!collapseWeather && (
                <div className="p-4">
                  <WeatherInfoCard clickedCoordinates={clickedCoordinates} />
                </div>
              )}
            </div>

            {/* 상태 기반 정비 (CBM) */}
            <div className="rounded-3xl border border-slate-200/60 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <SectionHeader
                  icon={<Wrench />}
                  title="상태 기반 정비 (CBM)"
                  desc="배터리·고도·속도·GPS 기반 정비 지표"
                  collapsible
                  collapsed={collapseCBM}
                  onToggle={() => setCollapseCBM((v) => !v)}
                  badge={
                    <StatusBadge
                      level={droneConnected ? alertLevel : "off"}
                      label={
                        droneConnected
                          ? alertLevel === "safe"
                            ? "정상"
                            : "점검 필요"
                          : "미연결"
                      }
                    />
                  }
                />
              </div>
              {!collapseCBM && (
                <div className="p-4">
                  <RealtimeCBMStatusCard
                    connected={droneConnected}
                    droneData={
                      droneData
                        ? {
                            battery: droneData.battery,
                            altitude: droneData.altitude,
                            speed: droneData.speed,
                            gpsFixType: droneData.gpsFixType,
                            gpsSatellites: droneData.gpsSatellites,
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </div>

            {/* 연결 안내 (미연결 시) */}
            {!droneConnected && (
              <div className="rounded-3xl border border-amber-200/60 bg-amber-50/70 p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 p-2 shadow-sm">
                    <AlertTriangle className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      연결이 안 될 때 확인하세요
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs text-amber-800/80">
                      <li className="flex items-start gap-1.5">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        드론 전원 및 통신 모듈(LTE/RFD) 상태를 확인합니다.
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        지상국(GCS)과 동일 네트워크/포트를 사용하는지
                        확인합니다.
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        연결 후에도 값이 안 보이면 "마지막 갱신" 시각이
                        업데이트되는지 확인합니다.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==================== 배터리 RTL 예측 — 맨 아래 full-width ==================== */}
        {droneConnected && (
          <RtlPredictionWidget
            droneActive={droneData !== null}
            battery={droneData?.battery}
          />
        )}
      </div>

      {/* 우하단 고정 버튼 */}
      {createPortal(
        <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
          {chatOpen && (
            <div className="w-[min(420px,calc(100vw-3rem))] rounded-3xl border border-slate-200/60 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-slate-800">
                    AI 운영 상담
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4">
                <GeminiChatCard />
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setChatOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-indigo-200/60 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-lg shadow-indigo-200/40 transition-all hover:-translate-y-0.5 hover:shadow-xl"
          >
            <MessageCircle className="h-4 w-4" />
            AI 상담
          </button>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="rounded-full border border-slate-200/70 bg-white/90 p-3 text-slate-600 shadow-lg backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-xl"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
