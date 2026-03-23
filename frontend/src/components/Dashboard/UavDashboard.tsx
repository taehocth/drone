import { useEffect, useRef, useState } from "react"
import { NaverMap } from "@/components/Map/NaverMap"
import { WeatherInfoCard } from "@/components/Dashboard/WeatherInfoCard"
import DroneSimulation, { DroneData } from "./DroneSimulation"
import { RealtimeCBMStatusCard } from "@/components/Dashboard/RealtimeCBMStatusCard"
import { GeminiChatCard } from "@/components/Dashboard/GeminiChatCard"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
} from "lucide-react"

// ==========================
// 기본 지도 설정
// ==========================
const DEFAULT_MAP_OPTIONS = {
  zoom: 11,
  center: { lat: 36.7881, lng: 126.4664 },
}

// ==========================
// 헬퍼 컴포넌트
// ==========================

const HelpHint = ({ text }: { text: string }) => (
  <button
    type="button"
    title={text}
    aria-label={text}
    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/70 bg-white/80 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-300"
  >
    ?
  </button>
)

// 단계별 상황 안내 배너
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
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-5 py-4 dark:border-amber-800/40 dark:bg-amber-900/15">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
          <WifiOff className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            1단계: 드론 연결이 필요합니다
          </p>
          <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-300/80">
            아래 "기체 실시간 정보" 패널에서 드론을 연결하면 관제를 시작할 수
            있습니다.
          </p>
        </div>
      </div>
    )
  }
  if (!droneData) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-sky-200/60 bg-sky-50/80 px-5 py-4 dark:border-sky-800/40 dark:bg-sky-900/15">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300">
          <Wifi className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">
            연결됨 — 데이터 수신 중...
          </p>
          <p className="mt-0.5 text-xs text-sky-700/80 dark:text-sky-300/80">
            잠시 후 드론 위치와 상태 정보가 표시됩니다.
          </p>
        </div>
      </div>
    )
  }
  if (alertLevel === "danger") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200/60 bg-red-50/80 px-5 py-4 dark:border-red-800/40 dark:bg-red-900/15">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 animate-pulse items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-red-900 dark:text-red-200">
            위험 경고 발생 — 즉시 확인하세요
          </p>
          <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-300/80">
            아래 "임계값 알림" 카드에서 원인을 확인하고 조치하세요.
          </p>
        </div>
      </div>
    )
  }
  if (alertLevel === "caution") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-5 py-4 dark:border-amber-800/40 dark:bg-amber-900/15">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            주의 항목 있음 — 알림 카드를 확인하세요
          </p>
          <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-300/80">
            즉각 위험은 아니지만 빠른 점검이 필요한 항목이 있습니다.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200/60 bg-emerald-50/80 px-5 py-4 dark:border-emerald-800/40 dark:bg-emerald-900/15">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
        <Activity className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          정상 운항 중
        </p>
        <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-300/80">
          모든 지표가 안전 범위입니다. 지도에서 드론 위치를 확인하세요.
        </p>
      </div>
    </div>
  )
}

// 핵심 수치 요약 카드 (초보자용)
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
    safe: "border-emerald-200/60 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-900/10",
    caution:
      "border-amber-200/60 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-900/10",
    danger:
      "border-red-200/60 bg-red-50/60 dark:border-red-800/40 dark:bg-red-900/10",
    off: "border-slate-200/40 bg-slate-50/60 dark:border-slate-700/40 dark:bg-slate-800/20",
  }[level ?? "off"]

  const valueStyle = {
    safe: "text-emerald-700 dark:text-emerald-300",
    caution: "text-amber-700 dark:text-amber-300",
    danger: "text-red-600 dark:text-red-400",
    off: "text-slate-400 dark:text-slate-500",
  }[level ?? "off"]

  return (
    <div
      className={`group relative rounded-2xl border p-4 transition-all ${levelStyle}`}
    >
      <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
        <HelpHint text={hint} />
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {label}
        </span>
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

// 섹션 헤더 (접기/펼치기 지원)
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
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        {desc && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
        )}
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

// 상태 뱃지
const StatusBadge = ({
  level,
  label,
}: {
  level: "safe" | "caution" | "danger" | "off"
  label: string
}) => {
  const style = {
    safe: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    caution:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    off: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
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
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showAlertDetails, setShowAlertDetails] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  // 섹션 접기/펼치기 상태
  const [collapseMonitor, setCollapseMonitor] = useState(false)
  const [collapseWeather, setCollapseWeather] = useState(false)
  const [collapseCBM, setCollapseCBM] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 320)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // ==========================
  // 알림 계산
  // ==========================
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

  const alertTone =
    alertLevel === "danger"
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      : alertLevel === "caution"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"

  const connectionLabel = droneConnected ? "연결됨" : "연결 대기"
  const connectionTone = droneConnected
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"

  const lastUpdateLabel = formatLastUpdate(droneData?.timestamp ?? null)

  // ==========================
  // 핵심 수치 (상단 요약 카드용)
  // ==========================
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

  return (
    <div className="relative min-h-screen overflow-x-hidden scroll-smooth text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {/* ==================== 헤더 ==================== */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-sm">
              <Activity className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                드론 관제 센터
              </h1>
              <p className="text-xs uppercase tracking-widest text-slate-400">
                Drone Operations Hub
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            <span className="text-xs text-slate-400 dark:text-slate-500">
              업데이트 {lastUpdateLabel}
            </span>
          </div>
        </div>

        {/* ==================== 상황 안내 배너 (초보자용) ==================== */}
        <GuideBanner
          droneConnected={droneConnected}
          alertLevel={alertLevel}
          droneData={droneData}
        />

        {/* ==================== Sticky 관제 상태바 ==================== */}
        <div className="sticky top-2 z-20 rounded-2xl border border-slate-200/60 bg-white/90 px-4 py-3 shadow-lg shadow-slate-200/40 ring-1 ring-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-900/85 dark:shadow-none dark:ring-slate-800/70">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold uppercase tracking-widest text-slate-400">
                운영 상태
              </span>

              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <Wifi className="h-3.5 w-3.5" />
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${connectionTone}`}
                >
                  {connectionLabel}
                </span>
              </span>

              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="text-slate-400">마지막 갱신</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {lastUpdateLabel}
                </span>
              </span>

              <button
                type="button"
                onClick={() =>
                  setShowAlertDetails((prev) => (alerts.length ? !prev : prev))
                }
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition ${alertTone} ${alerts.length ? "hover:opacity-80" : "cursor-default"}`}
                aria-expanded={showAlertDetails}
                disabled={!alerts.length}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                알림 {alerts.length ? `${alerts.length}건` : "없음"}
              </button>
            </div>
            <HelpHint text="관제 핵심 상태를 한 줄로 요약합니다. 알림 건수를 클릭하면 상세 내용을 볼 수 있습니다." />
          </div>

          {/* 알림 상세 인라인 드롭다운 */}
          {showAlertDetails && alerts.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-slate-200/60 pt-3 dark:border-slate-700/60">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                    alert.level === "danger"
                      ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                  }`}
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

        {/* ==================== 핵심 수치 요약 (초보자용 카드 4개) ==================== */}
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
              hint="연결된 GPS 위성 수입니다. 위성이 적을수록 위치 정확도가 낮아집니다."
            />
          </div>
        )}

        {/* ==================== 드론 위치 지도 ==================== */}
        <Card className="overflow-hidden rounded-3xl border-slate-200/60 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900">
          <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 dark:border-slate-800/60 dark:bg-slate-800/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-2 shadow-sm">
                  <MapPin className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-base">드론 위치</CardTitle>
                  <CardDescription className="text-xs">
                    지도를 클릭하면 해당 위치의 기상 정보를 조회합니다
                  </CardDescription>
                </div>
              </div>
              <HelpHint text="드론의 실시간 위치를 지도에서 확인합니다. 지도를 클릭하면 오른쪽 기상 패널에 해당 좌표의 날씨가 표시됩니다." />
            </div>
          </CardHeader>
          <CardContent className="p-0">
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
              />
            </div>
          </CardContent>
        </Card>

        {/* ==================== 2단 그리드: 실시간 정보 + 기상/CBM ==================== */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* 왼쪽: 기체 실시간 정보 + 임계값 알림 */}
          <div className="space-y-5">
            {/* 기체 실시간 정보 */}
            <div className="rounded-3xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800/60">
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
              {!collapseMonitor && (
                <div className="p-4">
                  <DroneSimulation
                    onConnectionChange={setDroneConnected}
                    onData={setDroneData}
                  />
                </div>
              )}
            </div>

            {/* 연결 안내 (미연결 시) */}
            {!droneConnected && (
              <div className="rounded-3xl border border-amber-200/60 bg-amber-50/70 p-5 dark:border-amber-800/40 dark:bg-amber-900/10">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 p-2 shadow-sm">
                    <AlertTriangle className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      연결이 안 될 때 확인하세요
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs text-amber-800/80 dark:text-amber-300/80">
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

            {/* 임계값 알림 */}
            <div className="rounded-3xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800/60">
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
                  <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                    기체 연결 후 임계값 알림을 확인할 수 있습니다.
                  </p>
                ) : alerts.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-300">
                    모든 항목이 정상 범위입니다.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`rounded-2xl border px-4 py-3 text-xs font-medium ${
                          alert.level === "danger"
                            ? "border-red-200/60 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-900/15 dark:text-red-300"
                            : "border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/15 dark:text-amber-300"
                        }`}
                      >
                        {alert.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 오른쪽: 기상 정보 + CBM */}
          <div className="space-y-5">
            {/* 기상 정보 */}
            <div className="rounded-3xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800/60">
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

            {/* CBM 상태 기반 정비 */}
            <div className="rounded-3xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800/60">
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
          </div>
        </div>
      </div>

      {/* ==================== 플로팅: AI 채팅 버튼 ==================== */}
      <button
        type="button"
        onClick={() => setChatOpen((v) => !v)}
        className="fixed bottom-6 left-6 z-30 flex items-center gap-2 rounded-full border border-indigo-200/60 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-lg shadow-indigo-200/40 transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-indigo-800/40 dark:bg-slate-900 dark:text-indigo-300 dark:shadow-none"
        aria-label="AI 채팅 열기"
      >
        <MessageCircle className="h-4 w-4" />
        AI 상담
      </button>

      {/* AI 채팅 패널 (플로팅) */}
      {chatOpen && (
        <div className="fixed bottom-20 left-6 z-30 w-[min(420px,calc(100vw-3rem))] rounded-3xl border border-slate-200/60 bg-white shadow-2xl dark:border-slate-800/60 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800/60">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                AI 운영 상담
              </span>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            <GeminiChatCard />
          </div>
        </div>
      )}

      {/* ==================== 맨 위로 버튼 ==================== */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 rounded-full border border-slate-200/70 bg-white/90 p-3 text-slate-600 shadow-lg backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-300"
          aria-label="맨 위로 이동"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
