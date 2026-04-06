import { useEffect, useRef, useState, useCallback } from "react"
import { NaverMap } from "@/components/Map/NaverMap"
import { WeatherInfoCard } from "@/components/Dashboard/WeatherInfoCard"
import DroneSimulation, {
  DroneData,
  DroneWsState,
  FlightStatusBadge,
  MissionWaypoint,
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
  AlertOctagon,
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
  droneOffline,
}: {
  droneConnected: boolean
  alertLevel: "safe" | "caution" | "danger"
  droneData: DroneData | null
  droneOffline: boolean
}) => {
  if (droneOffline) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200/60 bg-red-50/80 px-5 py-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 animate-pulse items-center justify-center rounded-full bg-red-100 text-red-600">
          <WifiOff className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-red-900">
            기체 신호 끊김 — 재연결 대기 중
          </p>
          <p className="mt-0.5 text-xs text-red-700/80">
            기체로부터 데이터가 수신되지 않습니다. LTE 통신 상태와 기체 전원을
            확인하세요.
          </p>
        </div>
      </div>
    )
  }
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
  collapsed,
  onToggle,
}: {
  droneConnected: boolean
  droneData: DroneData | null
  alerts: Array<{
    id: string
    level: "safe" | "caution" | "danger"
    label: string
  }>
  collapsed: boolean
  onToggle: () => void
}) {
  const guides = buildActionGuides(droneConnected, droneData, alerts)
  const topGuide = guides[0]
  if (!topGuide) return null
  const cfg = PRIORITY_CONFIG[topGuide.priority]
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
      <div
        className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 transition-colors hover:bg-slate-100/60"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 p-1.5 shadow-sm">
            <Lightbulb className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
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
        <div className="space-y-2.5 p-3">
          {guides.map((guide, idx) => {
            const c = PRIORITY_CONFIG[guide.priority]
            return (
              <div
                key={idx}
                className={`rounded-2xl border ${c.border} ${c.bg} overflow-hidden`}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${c.iconBg} text-white shadow-sm`}
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
                <div className="space-y-1.5 border-t border-white/60 px-3 py-2.5">
                  {guide.steps.map((step, si) => (
                    <div key={si} className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold ${c.text}`}
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
  tooltip?: string
  category?:
    | "battery"
    | "altitude"
    | "speed"
    | "gps"
    | "connection"
    | "signal"
    | "flight"
    | "system"
}

const PERIODIC_INTERVAL_MS = 60_000

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
    speed: null as number | null,
    satellites: null as number | null,
    latencyMs: null as number | null,
    isFlying: false,
  })

  const addLog = useCallback(
    (
      level: FlightLogEntry["level"],
      message: string,
      value?: string,
      category?: FlightLogEntry["category"],
      tooltip?: string,
    ) => {
      setLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ts: new Date(),
          level,
          message,
          value,
          category,
          tooltip,
        },
        ...prev.slice(0, 199),
      ])
    },
    [],
  )

  useEffect(() => {
    if (droneConnected && !prevRef.current.connected) {
      addLog(
        "success",
        "기체 연결됨",
        undefined,
        "connection",
        "WebSocket 연결 성공. 텔레메트리 수신을 시작합니다.",
      )
    } else if (!droneConnected && prevRef.current.connected) {
      addLog(
        "warn",
        "기체 연결 끊김",
        undefined,
        "connection",
        "WebSocket 연결이 끊겼습니다. 네트워크 상태와 기체 전원을 확인하세요.",
      )
      prevRef.current.battery = null
      prevRef.current.altitude = null
      prevRef.current.speed = null
      prevRef.current.satellites = null
      prevRef.current.latencyMs = null
      prevRef.current.isFlying = false
    }
    prevRef.current.connected = droneConnected
  }, [droneConnected, addLog])

  const snapshotDoneRef = useRef(false)
  useEffect(() => {
    if (!droneConnected || !droneData) {
      snapshotDoneRef.current = false
      return
    }
    if (snapshotDoneRef.current) return
    snapshotDoneRef.current = true
    const b = droneData.battery,
      a = droneData.altitude,
      s = droneData.speed,
      sat = droneData.gpsSatellites
    addLog(
      "info",
      "── 연결 시점 상태 스냅샷 ──",
      undefined,
      "system",
      "드론 연결 직후 측정된 초기 상태값입니다.",
    )
    if (b != null)
      addLog(
        b <= 20 ? "danger" : b <= 35 ? "warn" : "info",
        "초기 배터리",
        `${b.toFixed(0)}%`,
        "battery",
        `배터리 ${b.toFixed(0)}%`,
      )
    if (a != null)
      addLog(
        a > 150 ? "danger" : a > 120 ? "warn" : "info",
        "초기 고도",
        `${a.toFixed(0)}m`,
        "altitude",
        `고도 ${a.toFixed(0)}m`,
      )
    if (s != null)
      addLog(
        s > 35 ? "danger" : s > 25 ? "warn" : "info",
        "초기 속도",
        `${s.toFixed(1)}m/s`,
        "speed",
        `속도 ${s.toFixed(1)}m/s`,
      )
    if (sat != null)
      addLog(
        sat < 6 ? "danger" : sat < 10 ? "warn" : "info",
        "초기 GPS",
        `${sat}위성`,
        "gps",
        `위성 ${sat}개`,
      )
    prevRef.current.battery = b ?? null
    prevRef.current.altitude = a ?? null
    prevRef.current.speed = s ?? null
    prevRef.current.satellites = sat ?? null
  }, [droneConnected, droneData, addLog])

  useEffect(() => {
    if (!droneConnected) return
    const prev = prevRef.current.alertLevel
    if (alertLevel === "danger" && prev !== "danger")
      addLog(
        "danger",
        "⚠ 위험 경고 발생",
        undefined,
        "system",
        "임계값 초과 항목 발생",
      )
    else if (alertLevel === "caution" && prev === "safe")
      addLog("warn", "주의 항목 감지", undefined, "system", "주의 임계값 도달")
    else if (alertLevel === "safe" && prev !== "safe")
      addLog(
        "success",
        "전체 상태 정상 회복",
        undefined,
        "system",
        "모든 항목 정상 복귀",
      )
    prevRef.current.alertLevel = alertLevel
  }, [alertLevel, droneConnected, addLog])

  useEffect(() => {
    if (!droneConnected) return
    const b = droneData?.battery ?? null,
      prev = prevRef.current.battery
    if (b === null || prev === null) {
      prevRef.current.battery = b
      return
    }
    const bands = [
      {
        value: 20,
        downLevel: "danger" as const,
        downMsg: "배터리 위험 — 즉시 귀환 (≤20%)",
        downTip: "RTL 즉시 실행",
        upTip: "20% 이상 회복",
      },
      {
        value: 30,
        downLevel: "danger" as const,
        downMsg: "배터리 위험 임박 (≤30%)",
        downTip: "즉시 귀환 시작",
        upTip: "30% 이상 회복",
      },
      {
        value: 35,
        downLevel: "warn" as const,
        downMsg: "배터리 주의 — 귀환 준비 (≤35%)",
        downTip: "5분 내 귀환 준비",
        upTip: "35% 이상 회복",
      },
      {
        value: 50,
        downLevel: "info" as const,
        downMsg: "배터리 50% 이하",
        downTip: "귀환 계획 재검토",
        upTip: "50% 이상 충전",
      },
      {
        value: 70,
        downLevel: "info" as const,
        downMsg: "배터리 70% 이하",
        downTip: "장거리 임무 점검",
        upTip: "70% 이상 충전",
      },
    ]
    for (const band of bands) {
      if (b <= band.value && prev > band.value)
        addLog(
          band.downLevel,
          band.downMsg,
          `${b.toFixed(0)}%`,
          "battery",
          band.downTip,
        )
      else if (b > band.value && prev <= band.value)
        addLog(
          "info",
          `배터리 ${band.value}% 초과 회복`,
          `${b.toFixed(0)}%`,
          "battery",
          band.upTip,
        )
    }
    prevRef.current.battery = b
  }, [droneData?.battery, droneConnected, addLog])

  useEffect(() => {
    if (!droneConnected) return
    const a = droneData?.altitude ?? null,
      prev = prevRef.current.altitude
    if (a === null || prev === null) {
      prevRef.current.altitude = a
      return
    }
    const bands = [
      {
        threshold: 150,
        upLevel: "danger" as const,
        upMsg: "고도 법정 한계 초과 (>150m)",
        upTip: "즉시 하강 필요",
        downLevel: "info" as const,
        downMsg: "고도 150m 이하 복귀",
        downTip: "법적 한도 이하 복귀",
      },
      {
        threshold: 120,
        upLevel: "warn" as const,
        upMsg: "고도 주의 구간 진입 (>120m)",
        upTip: "상승 중단 권고",
        downLevel: "info" as const,
        downMsg: "고도 안전 구간 복귀 (≤120m)",
        downTip: "안전 고도 복귀",
      },
      {
        threshold: 50,
        upLevel: "info" as const,
        upMsg: "고도 50m 돌파",
        upTip: "장애물 주의",
        downLevel: "info" as const,
        downMsg: "고도 50m 이하",
        downTip: "저고도 장애물 유의",
      },
      {
        threshold: 5,
        upLevel: "info" as const,
        upMsg: "이륙 감지",
        upTip: "이륙 후 GPS 안정화 대기",
        downLevel: "success" as const,
        downMsg: "착지 감지",
        downTip: "프로펠러 정지 후 접근",
      },
    ]
    for (const band of bands) {
      if (a > band.threshold && prev <= band.threshold)
        addLog(
          band.upLevel,
          band.upMsg,
          `${a.toFixed(0)}m`,
          "altitude",
          band.upTip,
        )
      else if (a <= band.threshold && prev > band.threshold)
        addLog(
          band.downLevel,
          band.downMsg,
          `${a.toFixed(0)}m`,
          "altitude",
          band.downTip,
        )
    }
    prevRef.current.altitude = a
  }, [droneData?.altitude, droneConnected, addLog])

  useEffect(() => {
    if (!droneConnected) return
    const s = droneData?.speed ?? null,
      prev = prevRef.current.speed
    if (s === null || prev === null) {
      prevRef.current.speed = s
      return
    }
    const bands = [
      {
        threshold: 35,
        upLevel: "danger" as const,
        upMsg: "과속 위험 (>35m/s)",
        upTip: "즉시 감속",
        downLevel: "info" as const,
        downMsg: "과속 해제 (≤35m/s)",
        downTip: "감속 완료",
      },
      {
        threshold: 25,
        upLevel: "warn" as const,
        upMsg: "속도 주의 (>25m/s)",
        upTip: "감속 권장",
        downLevel: "info" as const,
        downMsg: "속도 정상 복귀 (≤25m/s)",
        downTip: "안전 속도 복귀",
      },
      {
        threshold: 1,
        upLevel: "info" as const,
        upMsg: "기체 이동 시작",
        upTip: "이동 감지",
        downLevel: "info" as const,
        downMsg: "기체 정지",
        downTip: "정지 또는 착지",
      },
    ]
    for (const band of bands) {
      if (s > band.threshold && prev <= band.threshold)
        addLog(
          band.upLevel,
          band.upMsg,
          `${s.toFixed(1)}m/s`,
          "speed",
          band.upTip,
        )
      else if (s <= band.threshold && prev > band.threshold)
        addLog(
          band.downLevel,
          band.downMsg,
          `${s.toFixed(1)}m/s`,
          "speed",
          band.downTip,
        )
    }
    const isFlying = s > 1,
      wasFlying = prevRef.current.isFlying
    if (isFlying && !wasFlying)
      addLog(
        "success",
        "비행 시작 감지",
        `${s.toFixed(1)}m/s`,
        "flight",
        "비행 상태 전환",
      )
    if (!isFlying && wasFlying)
      addLog(
        "info",
        "착지/정지 감지",
        undefined,
        "flight",
        "정지 또는 착지 상태",
      )
    prevRef.current.isFlying = isFlying
    prevRef.current.speed = s
  }, [droneData?.speed, droneConnected, addLog])

  useEffect(() => {
    if (!droneConnected) return
    const sat = droneData?.gpsSatellites ?? null,
      prev = prevRef.current.satellites
    if (sat === null || prev === null) {
      prevRef.current.satellites = sat
      return
    }
    const bands = [
      {
        threshold: 6,
        upLevel: "success" as const,
        upMsg: "GPS 신호 정상 회복 (≥6위성)",
        upTip: "위치 추적 가능",
        downLevel: "danger" as const,
        downMsg: "GPS 위성 위험 수준 (<6위성)",
        downTip: "착륙 검토 필요",
      },
      {
        threshold: 10,
        upLevel: "info" as const,
        upMsg: "GPS 위성 증가 (≥10위성)",
        upTip: "정확도 향상",
        downLevel: "warn" as const,
        downMsg: "GPS 위성 감소 (<10위성)",
        downTip: "정밀 비행 주의",
      },
      {
        threshold: 20,
        upLevel: "info" as const,
        upMsg: "GPS 신호 양호 (≥20위성)",
        upTip: "최적 GPS 환경",
        downLevel: "info" as const,
        downMsg: "GPS 위성 20개 이하",
        downTip: "모니터링 유지",
      },
    ]
    for (const band of bands) {
      if (sat > band.threshold && prev <= band.threshold)
        addLog(band.upLevel, band.upMsg, `${sat}위성`, "gps", band.upTip)
      else if (sat <= band.threshold && prev > band.threshold)
        addLog(band.downLevel, band.downMsg, `${sat}위성`, "gps", band.downTip)
    }
    prevRef.current.satellites = sat
  }, [droneData?.gpsSatellites, droneConnected, addLog])

  useEffect(() => {
    if (!droneConnected || !droneData?.timestamp) return
    const id = setInterval(() => {
      if (!droneData?.timestamp) return
      const ageMs = Date.now() - new Date(droneData.timestamp).getTime()
      if (isNaN(ageMs)) return
      const prev = prevRef.current.latencyMs
      const latencyBands = [
        {
          threshold: 15000,
          level: "danger" as const,
          msg: "통신 두절 15초 — 페일세이프 위험",
          tip: "즉시 육안 확인 필요",
        },
        {
          threshold: 8000,
          level: "warn" as const,
          msg: "통신 지연 8초 이상",
          tip: "LTE 신호 확인",
        },
        {
          threshold: 3000,
          level: "info" as const,
          msg: "통신 지연 3초 이상",
          tip: "경미한 지연 감지",
        },
      ]
      for (const band of latencyBands) {
        if (ageMs >= band.threshold && (prev === null || prev < band.threshold))
          addLog(
            band.level,
            band.msg,
            `${(ageMs / 1000).toFixed(1)}초`,
            "signal",
            band.tip,
          )
        if (prev !== null && prev >= band.threshold && ageMs < band.threshold)
          addLog(
            "success",
            `통신 지연 해소 (<${band.threshold / 1000}초)`,
            `${(ageMs / 1000).toFixed(1)}초`,
            "signal",
            "정상 수신 재개",
          )
      }
      prevRef.current.latencyMs = ageMs
    }, 1000)
    return () => clearInterval(id)
  }, [droneConnected, droneData?.timestamp, addLog])

  useEffect(() => {
    if (!droneConnected) return
    const id = setInterval(() => {
      const d = droneData
      if (!d) return
      const parts: string[] = []
      if (d.battery != null) parts.push(`배터리 ${d.battery.toFixed(0)}%`)
      if (d.altitude != null) parts.push(`고도 ${d.altitude.toFixed(0)}m`)
      if (d.speed != null) parts.push(`속도 ${d.speed.toFixed(1)}m/s`)
      if (d.gpsSatellites != null) parts.push(`GPS ${d.gpsSatellites}위성`)
      if (parts.length > 0)
        addLog("info", `[1분 요약] ${parts.join(" · ")}`, undefined, "system")
    }, PERIODIC_INTERVAL_MS)
    return () => clearInterval(id)
  }, [droneConnected, droneData, addLog])

  return { logs, addLog }
}

const LOG_STYLE: Record<
  FlightLogEntry["level"],
  { dot: string; text: string; bg: string; border: string }
> = {
  danger: {
    dot: "bg-red-500",
    text: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200/60",
  },
  warn: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200/60",
  },
  info: {
    dot: "bg-sky-400",
    text: "text-slate-700",
    bg: "bg-slate-50",
    border: "border-slate-200/40",
  },
  success: {
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200/60",
  },
}

const CATEGORY_LABEL: Record<
  NonNullable<FlightLogEntry["category"]>,
  string
> = {
  battery: "배터리",
  altitude: "고도",
  speed: "속도",
  gps: "GPS",
  connection: "연결",
  signal: "통신",
  flight: "비행",
  system: "시스템",
}

const CATEGORY_COLOR: Record<
  NonNullable<FlightLogEntry["category"]>,
  string
> = {
  battery: "bg-amber-100 text-amber-700",
  altitude: "bg-sky-100 text-sky-700",
  speed: "bg-purple-100 text-purple-700",
  gps: "bg-teal-100 text-teal-700",
  connection: "bg-indigo-100 text-indigo-700",
  signal: "bg-rose-100 text-rose-700",
  flight: "bg-emerald-100 text-emerald-700",
  system: "bg-slate-100 text-slate-500",
}

function LogItem({
  log,
  s,
  fmt,
}: {
  log: FlightLogEntry
  s: { dot: string; text: string; bg: string; border: string }
  fmt: (d: Date) => string
}) {
  const [showTip, setShowTip] = useState(false)
  const [tipStyle, setTipStyle] = useState<React.CSSProperties>({})
  const [arrowSide, setArrowSide] = useState<"top" | "bottom">("bottom")
  const itemRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = () => {
    if (!log.tooltip || !itemRef.current) return
    const rect = itemRef.current.getBoundingClientRect()
    const TIP_W = 288,
      TIP_H_EST = 160,
      GAP = 8,
      MARGIN = 12
    let left = rect.left
    if (left + TIP_W + MARGIN > window.innerWidth)
      left = Math.max(MARGIN, rect.right - TIP_W)
    const spaceAbove = rect.top
    let top: number, side: "top" | "bottom"
    if (spaceAbove >= TIP_H_EST + GAP) {
      top = rect.top - GAP - TIP_H_EST
      side = "bottom"
    } else {
      top = rect.bottom + GAP
      side = "top"
    }
    setTipStyle({ position: "fixed", top, left, width: TIP_W, zIndex: 9999 })
    setArrowSide(side)
    setShowTip(true)
  }

  const levelIcon = { danger: "⚠", warn: "!", info: "i", success: "✓" }[
    log.level
  ]
  const tipBg = {
    danger: "bg-red-950 border-red-700/50 text-red-100",
    warn: "bg-amber-950 border-amber-700/50 text-amber-100",
    info: "bg-slate-800 border-slate-600/50 text-slate-100",
    success: "bg-emerald-950 border-emerald-700/50 text-emerald-100",
  }[log.level]
  const tipAccent = {
    danger: "text-red-400",
    warn: "text-amber-400",
    info: "text-sky-400",
    success: "text-emerald-400",
  }[log.level]
  const arrowColorClass = {
    danger: "border-red-700/50 bg-red-950",
    warn: "border-amber-700/50 bg-amber-950",
    info: "border-slate-600/50 bg-slate-800",
    success: "border-emerald-700/50 bg-emerald-950",
  }[log.level]

  const tooltipPortal =
    showTip && log.tooltip
      ? createPortal(
          <div
            className={`pointer-events-none rounded-2xl border shadow-2xl ${tipBg} px-4 py-3`}
            style={tipStyle}
          >
            <div
              className={`absolute left-4 ${arrowSide === "bottom" ? "top-full" : "bottom-full"}`}
            >
              <div
                className={`h-2 w-2 rotate-45 border ${arrowSide === "bottom" ? "-translate-y-1 border-l-0 border-t-0" : "translate-y-1 border-b-0 border-r-0"} ${arrowColorClass}`}
              />
            </div>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${log.level === "danger" ? "border-red-500/60 text-red-400" : log.level === "warn" ? "border-amber-500/60 text-amber-400" : log.level === "success" ? "border-emerald-500/60 text-emerald-400" : "border-sky-500/60 text-sky-400"}`}
              >
                {levelIcon}
              </span>
              <span className={`text-[11px] font-semibold ${tipAccent}`}>
                {log.category ? CATEGORY_LABEL[log.category] : "이벤트"} 상세
              </span>
              {log.value && (
                <span className="ml-auto shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold opacity-80">
                  {log.value}
                </span>
              )}
            </div>
            <div className="mb-2 h-px bg-white/10" />
            <p className="text-[11px] leading-relaxed opacity-90">
              {log.tooltip}
            </p>
            <p className="mt-2 text-[10px] tabular-nums opacity-40">
              {fmt(log.ts)}
            </p>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <div
        ref={itemRef}
        className={`group relative flex items-center gap-2.5 rounded-xl border ${s.border} ${s.bg} px-3 py-2 transition-all ${log.tooltip ? "cursor-help hover:shadow-sm hover:brightness-[0.97]" : ""}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTip(false)}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
        <span className="w-[4.5rem] shrink-0 text-[11px] tabular-nums text-slate-400">
          {fmt(log.ts)}
        </span>
        {log.category && (
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${CATEGORY_COLOR[log.category]}`}
          >
            {CATEGORY_LABEL[log.category]}
          </span>
        )}
        <span className={`flex-1 text-xs font-medium ${s.text}`}>
          {log.message}
        </span>
        {log.value && (
          <span className="shrink-0 rounded-lg bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {log.value}
          </span>
        )}
        {log.tooltip && (
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold opacity-40 transition-opacity group-hover:opacity-100 ${log.level === "danger" ? "border-red-400 text-red-500" : log.level === "warn" ? "border-amber-400 text-amber-500" : log.level === "success" ? "border-emerald-400 text-emerald-600" : "border-slate-300 text-slate-400"}`}
          >
            ?
          </span>
        )}
      </div>
      {tooltipPortal}
    </>
  )
}

type FilterLevel = "all" | FlightLogEntry["level"]
type FilterCategory = "all" | NonNullable<FlightLogEntry["category"]>

function FlightLogWidget({ logs }: { logs: FlightLogEntry[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const [filterLevel, setFilterLevel] = useState<FilterLevel>("all")
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all")
  const listRef = useRef<HTMLDivElement>(null)

  const fmt = (d: Date) =>
    d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  const filtered = logs.filter((log) => {
    if (filterLevel !== "all" && log.level !== filterLevel) return false
    if (filterCategory !== "all" && log.category !== filterCategory)
      return false
    return true
  })
  const dangerCount = logs.filter((l) => l.level === "danger").length
  const warnCount = logs.filter((l) => l.level === "warn").length

  const levelButtons: Array<{
    key: FilterLevel
    label: string
    active: string
    idle: string
  }> = [
    {
      key: "all",
      label: "전체",
      active: "bg-slate-700 text-white",
      idle: "bg-slate-100 text-slate-500 hover:bg-slate-200",
    },
    {
      key: "danger",
      label: "위험",
      active: "bg-red-600 text-white",
      idle: "bg-red-50 text-red-600 hover:bg-red-100",
    },
    {
      key: "warn",
      label: "주의",
      active: "bg-amber-500 text-white",
      idle: "bg-amber-50 text-amber-600 hover:bg-amber-100",
    },
    {
      key: "success",
      label: "정상",
      active: "bg-emerald-600 text-white",
      idle: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    },
    {
      key: "info",
      label: "정보",
      active: "bg-sky-600 text-white",
      idle: "bg-sky-50 text-sky-600 hover:bg-sky-100",
    },
  ]

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
          {dangerCount > 0 && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
              위험 {dangerCount}
            </span>
          )}
          {warnCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
              주의 {warnCount}
            </span>
          )}
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
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <span className="text-xs text-slate-400">레벨:</span>
            {levelButtons.map((btn) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => setFilterLevel(btn.key)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${filterLevel === btn.key ? btn.active : btn.idle}`}
              >
                {btn.label}
              </button>
            ))}
            <span className="ml-2 text-xs text-slate-400">카테고리:</span>
            <select
              value={filterCategory}
              onChange={(e) =>
                setFilterCategory(e.target.value as FilterCategory)
              }
              className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 focus:outline-none"
            >
              <option value="all">전체</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="p-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Clock className="h-8 w-8 text-slate-200" />
                <p className="text-sm text-slate-400">
                  {logs.length === 0
                    ? "이벤트가 없습니다"
                    : "해당 조건의 로그가 없습니다"}
                </p>
                <p className="text-xs text-slate-300">
                  {logs.length === 0
                    ? "드론 연결 시 이벤트가 자동 기록됩니다"
                    : "필터를 변경해보세요"}
                </p>
              </div>
            ) : (
              <div
                ref={listRef}
                className="max-h-80 space-y-1 overflow-y-auto pr-1"
              >
                {filtered.map((log) => {
                  const s = LOG_STYLE[log.level]
                  return <LogItem key={log.id} log={log} s={s} fmt={fmt} />
                })}
              </div>
            )}
            {logs.length > 0 && (
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-400">
                <span>
                  표시 {filtered.length} / 전체 {logs.length}건
                  {logs.length >= 200 && (
                    <span className="ml-1 text-amber-500">(최대 200건)</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFilterLevel("all")
                    setFilterCategory("all")
                  }}
                  className="text-indigo-500 hover:underline"
                >
                  필터 초기화
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================
// 배터리 RTL 예측
// ==========================
const RTL_RESERVE_PCT = 20,
  WINDOW_SIZE = 10,
  MIN_SAMPLES = 3,
  MIN_INTERVAL_MS = 2000

interface BatterySample {
  battery: number
  time: number
}
interface RtlPrediction {
  drainRatePerMin: number | null
  remainingSec: number | null
  elapsedSec: number
  level: "safe" | "caution" | "danger" | "off"
  sampleCount: number
}

function filterOutliers(rates: number[]): number[] {
  if (rates.length < 4) return rates
  const sorted = [...rates].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)],
    q3 = sorted[Math.floor(sorted.length * 0.75)],
    iqr = q3 - q1
  return rates.filter((r) => r >= q1 - 1.5 * iqr && r <= q3 + 1.5 * iqr)
}

function useRtlPrediction(
  droneActive: boolean,
  battery: number | undefined | null,
): RtlPrediction {
  const samplesRef = useRef<BatterySample[]>([])
  const [tick, setTick] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (droneActive) {
      if (!startTimeRef.current) startTimeRef.current = Date.now()
    } else {
      samplesRef.current = []
      startTimeRef.current = null
      setElapsedSec(0)
      setTick(0)
    }
  }, [droneActive])

  useEffect(() => {
    if (!droneActive) return
    const id = setInterval(() => {
      if (startTimeRef.current)
        setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [droneActive])

  useEffect(() => {
    if (!droneActive || battery == null) return
    const now = Date.now(),
      last = samplesRef.current.at(-1)
    if (last && now - last.time < MIN_INTERVAL_MS) return
    samplesRef.current = [
      ...samplesRef.current.slice(-(WINDOW_SIZE - 1)),
      { battery, time: now },
    ]
    setTick((t) => t + 1)
  }, [droneActive, battery])

  const samples = samplesRef.current
  if (!droneActive || battery == null || samples.length < MIN_SAMPLES)
    return {
      drainRatePerMin: null,
      remainingSec: null,
      elapsedSec,
      level: "off",
      sampleCount: samples.length,
    }

  const rates: number[] = []
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].time - samples[i - 1].time) / 60000,
      dB = samples[i - 1].battery - samples[i].battery
    if (dt > 0 && dB >= 0) rates.push(dB / dt)
  }
  const filtered = filterOutliers(rates)
  if (filtered.length === 0)
    return {
      drainRatePerMin: null,
      remainingSec: null,
      elapsedSec,
      level: "off",
      sampleCount: samples.length,
    }

  const drainRatePerMin =
    filtered.reduce((sum, r) => sum + r, 0) / filtered.length
  const usable = Math.max(0, battery - RTL_RESERVE_PCT)
  const remainingSec =
    drainRatePerMin > 0 ? Math.floor((usable / drainRatePerMin) * 60) : null
  const level: RtlPrediction["level"] =
    remainingSec == null
      ? "off"
      : remainingSec <= 0
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
    sampleCount: samples.length,
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
    const m = Math.floor(sec / 60),
      s = sec % 60
    return m > 0 ? `${m}분 ${s}초` : `${s}초`
  }
  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60),
      s = sec % 60
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
  const batteryPct = battery ?? 0,
    usablePct = Math.max(0, batteryPct - RTL_RESERVE_PCT),
    reservePct = Math.min(batteryPct, RTL_RESERVE_PCT)
  const reliabilityLabel =
    rtl.sampleCount >= WINDOW_SIZE
      ? "높음"
      : rtl.sampleCount >= MIN_SAMPLES
        ? "보통"
        : `${rtl.sampleCount}/${MIN_SAMPLES}`
  const mainLabel = !droneActive
    ? "기체 연결 후 예측 시작"
    : rtl.remainingSec === null
      ? `데이터 수집 중... (${rtl.sampleCount}/${MIN_SAMPLES}샘플)`
      : rtl.remainingSec <= 0
        ? "즉시 귀환 필요"
        : `약 ${formatTime(rtl.remainingSec)} 더 비행 가능`
  const sublabel = !droneActive
    ? "드론이 활성화되면 소모율을 추적합니다"
    : rtl.remainingSec === null
      ? `비행 시작 후 ${formatElapsed(rtl.elapsedSec)} 경과`
      : rtl.level === "danger"
        ? "지금 바로 귀환하세요"
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
            <span>현재 배터리 기준</span>
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
            <p className="text-xs text-slate-500">신뢰도</p>
            <p className="text-sm font-semibold text-slate-700">
              {reliabilityLabel}
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
  // ★ 선택된 기체 1개 (또는 빈 배열)
  selectedDroneState: DroneWsState | null
  selectedDroneLabel: string | null
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
  selectedDroneState,
  selectedDroneLabel,
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
  const dangerAlerts = alerts.filter((a) => a.level === "danger"),
    cautionAlerts = alerts.filter((a) => a.level === "caution")
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
        {/* ★ 선택된 기체 1개만 표시 */}
        {selectedDroneState && selectedDroneLabel && (
          <div className="flex shrink-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-20 truncate text-xs text-slate-500">
                {selectedDroneLabel}
              </span>
              <FlightStatusBadge
                status={
                  selectedDroneState.connected
                    ? selectedDroneState.flightStatus
                    : "unknown"
                }
              />
            </div>
          </div>
        )}
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
): "safe" | "caution" | "danger" | "off" =>
  v == null ? "off" : v <= 20 ? "danger" : v <= 35 ? "caution" : "safe"
const getAltitudeLevel = (
  v?: number | null,
): "safe" | "caution" | "danger" | "off" =>
  v == null ? "off" : v > 150 ? "danger" : v > 120 ? "caution" : "safe"
const getSpeedLevel = (
  v?: number | null,
): "safe" | "caution" | "danger" | "off" =>
  v == null ? "off" : v > 35 ? "danger" : v > 25 ? "caution" : "safe"

// 드론 라벨 목록 (DroneSimulation과 순서 맞춤)
const DRONE_LABELS = ["DM4_1", "DM4_2", "DM3"]

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
  const [missionWaypoints, setMissionWaypoints] = useState<MissionWaypoint[]>(
    [],
  )

  // ★ 선택된 기체 정보 (DroneSimulation에서 올라옴)
  const [selectedDroneIdx, setSelectedDroneIdx] = useState<number | null>(null)
  const [selectedLteIp, setSelectedLteIp] = useState<string | null>(null)
  // ★ 기체 신호 끊김 상태
  const [isDroneOffline, setIsDroneOffline] = useState(false)
  useEffect(() => {
    if (!isDroneOffline) {
      if (selectedDroneIdx === null) setDroneConnected(false)
    }
  }, [isDroneOffline, selectedDroneIdx])

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
      droneOffline: false,
    },
    {
      wsConnected: false,
      droneActive: false,
      connected: false,
      data: null,
      flightStatus: "unknown",
      droneOffline: false,
    },
    {
      wsConnected: false,
      droneActive: false,
      connected: false,
      data: null,
      flightStatus: "unknown",
      droneOffline: false,
    },
  ])

  const [collapseMap, setCollapseMap] = useState(false)
  const [collapseMonitor, setCollapseMonitor] = useState(false)
  const [collapseCBM, setCollapseCBM] = useState(false)
  const [collapseAction, setCollapseAction] = useState(false)
  const [collapseTopPanel, setCollapseTopPanel] = useState(false)

  const { permission, requestPermission, sendNotification } =
    useWebNotification()
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const prevAlertLevelRef = useRef<"safe" | "caution" | "danger">("safe")
  const [modalDismissed, setModalDismissed] = useState(false)
  const prevModalKeyRef = useRef<string>("")

  const alerts = (() => {
    // ★ 기체 미선택 시 빈 배열 — 아무 경고도 표시 안 함
    if (selectedDroneIdx === null) return []
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

  interface DangerModalItem {
    id: string
    type: "battery" | "speed"
    label: string
    detail: string
    action: string
  }
  const dangerModalItems: DangerModalItem[] = []
  if (droneData?.battery != null && droneData.battery <= 20)
    dangerModalItems.push({
      id: "battery",
      type: "battery",
      label: "배터리 위험",
      detail: `현재 ${droneData.battery.toFixed(0)}% — RTL 비행 중 방전 시 추락합니다`,
      action: "즉시 RTL 모드로 전환 후 귀환하세요",
    })
  if (droneData?.speed != null && droneData.speed > 12)
    dangerModalItems.push({
      id: "speed",
      type: "speed",
      label: "과속 감지",
      detail: `현재 ${droneData.speed.toFixed(1)}m/s — 권장 속도(12m/s)를 초과했습니다`,
      action: "즉시 스로틀을 줄여 속도를 낮추세요",
    })

  const modalKey = dangerModalItems.map((a) => a.id).join(",")
  if (modalKey !== prevModalKeyRef.current) {
    prevModalKeyRef.current = modalKey
    if (modalKey) setModalDismissed(false)
  }
  const showDangerModal =
    droneConnected && dangerModalItems.length > 0 && !modalDismissed

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

  const { logs, addLog } = useFlightLog(droneConnected, droneData, alertLevel)

  useEffect(() => {
    const onQgcEvents = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        events: Array<{
          type: string
          level: string
          message: string
          time: string
        }>
        lteIp?: string
      }
      // ★ 선택된 기체의 이벤트만 처리
      if (selectedLteIp && detail.lteIp && detail.lteIp !== selectedLteIp)
        return
      if (!detail.events?.length) return
      const levelMap: Record<string, FlightLogEntry["level"]> = {
        danger: "danger",
        caution: "warn",
        success: "success",
        info: "info",
        debug: "info",
      }
      const categoryMap: Record<string, FlightLogEntry["category"]> = {
        battery_critical: "battery",
        battery_low: "battery",
        mode_change: "flight",
        waypoint_reached: "flight",
        mission_current: "flight",
        mission_uploaded: "flight",
        mission_ack: "flight",
        home_set: "flight",
        gps_status: "gps",
        statustext: "system",
        connected: "connection",
      }
      for (const ev of detail.events) {
        addLog(
          levelMap[ev.level] ?? "info",
          `[QGC] ${ev.message}`,
          undefined,
          categoryMap[ev.type] ?? "system",
          `QGC/MAVLink 수신 이벤트 (${ev.time})`,
        )
      }
    }
    window.addEventListener("qgcFlightEvents", onQgcEvents)
    return () => window.removeEventListener("qgcFlightEvents", onQgcEvents)
  }, [addLog, selectedLteIp])

  const alertTone =
    alertLevel === "danger"
      ? "bg-red-100 text-red-700"
      : alertLevel === "caution"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700"
  const connectionLabel = isDroneOffline
    ? "신호 끊김"
    : droneConnected
      ? "연결됨"
      : "연결 대기"
  const connectionTone = isDroneOffline
    ? "bg-red-100 text-red-700"
    : droneConnected
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
    if (permission === "denied")
      return (
        <span
          className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400"
          title="브라우저 설정에서 알림을 허용해주세요"
        >
          <BellOff className="h-3.5 w-3.5" />
          알림 차단됨
        </span>
      )
    if (permission === "default")
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
      {createPortal(
        showDangerModal ? (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-[min(480px,calc(100vw-2rem))] overflow-hidden rounded-3xl border-2 border-red-600/60 bg-red-950 shadow-2xl shadow-red-950/80">
              <div className="flex items-center gap-3 border-b border-red-800/60 bg-red-900/60 px-6 py-4">
                <span className="flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-red-500/20">
                  <AlertOctagon className="h-6 w-6 text-red-400" />
                </span>
                <div>
                  <p className="text-base font-bold tracking-wide text-red-200">
                    위험 경고 발생
                  </p>
                  <p className="text-xs text-red-500/80">
                    즉각적인 조치가 필요합니다
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-red-500/20 px-3 py-1 text-sm font-bold text-red-300">
                  {dangerModalItems.length}건
                </span>
              </div>
              <div className="space-y-3 px-6 py-5">
                {dangerModalItems.map((item) => {
                  const iconMap = {
                    battery: <BatteryLow className="h-5 w-5 text-red-400" />,
                    speed: <Gauge className="h-5 w-5 text-red-400" />,
                  }
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-red-700/40 bg-red-900/40 px-4 py-3.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
                          {iconMap[item.type]}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-red-200">
                            {item.label}
                          </p>
                          <p className="mt-0.5 text-xs text-red-400/80">
                            {item.detail}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-red-950/60 px-3 py-2">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                        <p className="text-[11px] font-medium text-red-300">
                          {item.action}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="border-t border-red-800/60 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setModalDismissed(true)}
                  className="w-full rounded-2xl bg-red-500 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-red-400 active:scale-[0.98]"
                >
                  네, 확인했습니다
                </button>
                <p className="mt-2 text-center text-[10px] text-red-600/60">
                  위험 상황이 해소되거나 새로운 경고 발생 시 다시 표시됩니다
                </p>
              </div>
            </div>
          </div>
        ) : null,
        document.body,
      )}

      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
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

        <GuideBanner
          droneConnected={droneConnected}
          alertLevel={alertLevel}
          droneData={droneData}
          droneOffline={isDroneOffline}
        />

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <ActionGuideWidget
            droneConnected={droneConnected}
            droneData={droneData}
            alerts={alerts}
            collapsed={collapseAction}
            onToggle={() => setCollapseAction((v) => !v)}
          />
          <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
            <div
              className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 transition-colors hover:bg-slate-100/60"
              onClick={() => setCollapseTopPanel((v) => !v)}
            >
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 p-1.5 shadow-sm">
                  <Cloud className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    기상 정보
                  </p>
                  <p className="text-xs text-slate-500">
                    지도 클릭 위치의 실시간 기상 및 비행 안전성
                  </p>
                </div>
              </div>
              <span className="text-slate-400">
                {collapseTopPanel ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </span>
            </div>
            {!collapseTopPanel && (
              <div className="p-3">
                <WeatherInfoCard clickedCoordinates={clickedCoordinates} />
              </div>
            )}
          </div>
        </div>

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
                flightPath={
                  missionWaypoints.length > 0
                    ? missionWaypoints.map((wp) => ({
                        lat: wp.lat,
                        lng: wp.lng,
                        alt: wp.alt,
                      }))
                    : undefined
                }
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-5">
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
              <div className={collapseMonitor ? "" : "p-4"}>
                <div
                  style={
                    collapseMonitor
                      ? {
                          visibility: "hidden",
                          height: 0,
                          overflow: "hidden",
                          padding: 0,
                          margin: 0,
                        }
                      : {}
                  }
                >
                  <DroneSimulation
                    onConnectionChange={(connected) => {
                      if (!isDroneOffline) setDroneConnected(connected)
                    }}
                    onData={(data) => {
                      if (data !== null) {
                        setDroneData(data)
                      } else if (!isDroneOffline) {
                        // offline 상태일 때 null이 와도 마지막 데이터 유지
                        setDroneData(null)
                      }
                    }}
                    onAllDroneStates={setAllDroneStates}
                    onMissionWaypoints={(wps) => setMissionWaypoints(wps ?? [])}
                    onSelectedDrone={({ idx, lteIp }) => {
                      setSelectedDroneIdx(idx)
                      setSelectedLteIp(lteIp)
                    }}
                    onDroneOffline={(offline) => {
                      setIsDroneOffline(offline)
                      if (offline) {
                        // offline이 되어도 connected는 true 유지
                        // → GuideBanner가 "신호 끊김" 배너를 표시
                        setDroneConnected(true)
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <FlightLogWidget logs={logs} />

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

          <div className="space-y-5">
            {/* ★ 선택된 기체 1개만 FlightFeasibilityWidget에 전달 */}
            <FlightFeasibilityWidget
              droneConnected={droneConnected}
              droneData={droneData}
              alertLevel={alertLevel}
              alerts={alerts}
              selectedDroneState={
                selectedDroneIdx !== null
                  ? allDroneStates[selectedDroneIdx]
                  : null
              }
              selectedDroneLabel={
                selectedDroneIdx !== null
                  ? DRONE_LABELS[selectedDroneIdx]
                  : null
              }
            />

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

        {droneConnected && (
          <RtlPredictionWidget
            droneActive={droneData !== null}
            battery={droneData?.battery}
          />
        )}
      </div>

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
