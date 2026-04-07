import { useEffect, useRef, useState } from "react"
import { convertGRID_GPS } from "@/utils/convertGrid"
import {
  Maximize2,
  Minimize2,
  Navigation,
  NavigationOff,
  Satellite,
  Battery,
  Gauge,
  ArrowUp,
  X,
  MapPin,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  WifiOff,
  PlaneLanding,
  Wind,
  Thermometer,
  Clock,
  TrendingDown,
  Info,
  Route,
  Trash2,
} from "lucide-react"

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1"

interface NaverMapProps {
  lat?: number
  lng?: number
  markers?: Array<{ lat: number; lng: number; id: number }>
  onMapClick?: (nx: number, ny: number) => void
  flightPath?: Array<{ lat: number; lng: number; alt?: number; time?: number }>
  dronePosition?: {
    lat: number
    lng: number
    yaw?: number
    satellites?: number
  }
  droneStats?: {
    battery?: number
    altitude?: number
    speed?: number
    armed?: boolean // ★ Arming 상태 추가
  }
  droneId?: string // ★ 미션 폴링용 드론 ID
}

const DEFAULT_LAT = 36.5941
const DEFAULT_LNG = 126.2932

type SafetyLevel = "safe" | "caution" | "danger"

interface SafetyItem {
  label: string
  level: SafetyLevel
  hint: string
}

function calcSafety(
  droneStats?: {
    battery?: number
    altitude?: number
    speed?: number
    armed?: boolean
  },
  satellites?: number | null,
  windSpeed?: number,
): { overall: SafetyLevel; items: SafetyItem[] } {
  const items: SafetyItem[] = []

  if (droneStats?.battery != null) {
    const b = droneStats.battery
    items.push(
      b <= 20
        ? {
            label: "배터리",
            level: "danger",
            hint: `${b.toFixed(0)}% — 즉시 복귀`,
          }
        : b <= 35
          ? {
              label: "배터리",
              level: "caution",
              hint: `${b.toFixed(0)}% — 복귀 준비`,
            }
          : { label: "배터리", level: "safe", hint: `${b.toFixed(0)}%` },
    )
  }

  if (droneStats?.altitude != null) {
    const a = droneStats.altitude
    items.push(
      a > 150
        ? {
            label: "고도",
            level: "danger",
            hint: `${a.toFixed(0)}m — 법적 제한 초과`,
          }
        : a > 120
          ? {
              label: "고도",
              level: "caution",
              hint: `${a.toFixed(0)}m — 제한 접근`,
            }
          : { label: "고도", level: "safe", hint: `${a.toFixed(0)}m` },
    )
  }

  if (droneStats?.speed != null) {
    const s = droneStats.speed
    items.push(
      s > 35
        ? { label: "속도", level: "danger", hint: `${s.toFixed(1)}m/s — 과속` }
        : s > 25
          ? {
              label: "속도",
              level: "caution",
              hint: `${s.toFixed(1)}m/s — 주의`,
            }
          : { label: "속도", level: "safe", hint: `${s.toFixed(1)}m/s` },
    )
  }

  if (satellites != null) {
    items.push(
      satellites < 10
        ? {
            label: "GNSS",
            level: "danger",
            hint: `${satellites}위성 — 신호 불량`,
          }
        : satellites < 25
          ? {
              label: "GNSS",
              level: "caution",
              hint: `${satellites}위성 — 보통`,
            }
          : { label: "GNSS", level: "safe", hint: `${satellites}위성` },
    )
  }

  if (windSpeed != null) {
    items.push(
      windSpeed >= 14
        ? {
            label: "풍속",
            level: "danger",
            hint: `${windSpeed}m/s — 비행 위험`,
          }
        : windSpeed >= 7
          ? { label: "풍속", level: "caution", hint: `${windSpeed}m/s — 주의` }
          : { label: "풍속", level: "safe", hint: `${windSpeed}m/s` },
    )
  }

  const overall: SafetyLevel = items.some((i) => i.level === "danger")
    ? "danger"
    : items.some((i) => i.level === "caution")
      ? "caution"
      : "safe"

  return { overall, items }
}

const levelText: Record<SafetyLevel, string> = {
  safe: "text-emerald-400",
  caution: "text-amber-400",
  danger: "text-red-400",
}

const getBatteryColor = (v: number) =>
  v <= 20 ? "text-red-400" : v <= 35 ? "text-amber-400" : "text-emerald-400"

const getAltitudeColor = (v: number) =>
  v > 150 ? "text-red-400" : v > 120 ? "text-amber-400" : "text-emerald-400"

const getSpeedColor = (v: number) =>
  v > 35 ? "text-red-400" : v > 25 ? "text-amber-400" : "text-emerald-400"

function SafetyBanner({
  overall,
  items,
  connected,
}: {
  overall: SafetyLevel
  items: SafetyItem[]
  connected: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (!connected) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-500/40 bg-slate-900/80 px-4 py-2 text-xs text-slate-300 shadow-lg backdrop-blur-md">
        <WifiOff className="h-4 w-4 text-slate-400" />
        <span className="font-semibold">
          드론 미연결 — 연결 후 안전 상태가 표시됩니다
        </span>
      </div>
    )
  }

  const bannerStyle =
    overall === "danger"
      ? "border-red-500/50 bg-red-950/80"
      : overall === "caution"
        ? "border-amber-500/50 bg-amber-950/80"
        : "border-emerald-500/50 bg-emerald-950/80"

  const Icon =
    overall === "danger"
      ? ShieldAlert
      : overall === "caution"
        ? AlertTriangle
        : CheckCircle

  const overallLabel =
    overall === "danger" ? "위험" : overall === "caution" ? "주의" : "정상"

  return (
    <div
      className={`rounded-xl border shadow-lg backdrop-blur-md transition-all ${bannerStyle}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-2 text-left"
      >
        <Icon className={`h-4 w-4 shrink-0 ${levelText[overall]}`} />
        <span className={`text-xs font-bold ${levelText[overall]}`}>
          비행 안전 {overallLabel}
        </span>
        <div className="ml-1 flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item.label}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                item.level === "danger"
                  ? "bg-red-500/20 text-red-300"
                  : item.level === "caution"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300"
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-white/30">
          {expanded ? "▲ 닫기" : "▼ 상세"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-4 py-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.label}
                className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${
                  item.level === "danger"
                    ? "bg-red-500/15 text-red-300"
                    : item.level === "caution"
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                <span className="font-semibold">{item.label}</span>
                <span className="text-white/70">{item.hint}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BatteryGuideCard({
  battery,
  altitude,
}: {
  battery?: number
  altitude?: number
}) {
  if (battery == null) return null

  const guide =
    battery <= 20
      ? {
          bg: "bg-red-950/90 border-red-500/50",
          dot: "bg-red-500 animate-ping",
          dotInner: "bg-red-500",
          title: "즉시 귀환하세요",
          titleColor: "text-red-300",
          desc: "배터리가 위험 수준입니다. 지금 바로 RTL을 실행하세요.",
          steps: [
            "1. 현재 임무 즉시 중단",
            "2. RTL 모드 전환",
            "3. 착륙 지점 확인",
          ],
          icon: <PlaneLanding className="h-4 w-4 text-red-400" />,
        }
      : battery <= 35
        ? {
            bg: "bg-amber-950/90 border-amber-500/50",
            dot: "bg-amber-500",
            dotInner: "bg-amber-500",
            title: "귀환 준비 시작",
            titleColor: "text-amber-300",
            desc: "배터리가 절반 이하입니다. 귀환 경로를 확인하세요.",
            steps: [
              "1. 임무 단계 마무리",
              "2. 귀환 루트 확인",
              "3. 5분 내 복귀 준비",
            ],
            icon: <Battery className="h-4 w-4 text-amber-400" />,
          }
        : battery <= 60
          ? {
              bg: "bg-slate-900/90 border-slate-500/40",
              dot: "bg-sky-400",
              dotInner: "bg-sky-400",
              title: "배터리 양호",
              titleColor: "text-sky-300",
              desc: "현재 상태 양호. 귀환 여유를 계획하세요.",
              steps: ["• 지속 모니터링", "• 35% 도달 전 귀환 계획 수립"],
              icon: <Battery className="h-4 w-4 text-sky-400" />,
            }
          : {
              bg: "bg-slate-900/90 border-emerald-500/30",
              dot: "bg-emerald-500",
              dotInner: "bg-emerald-500",
              title: "충분한 배터리",
              titleColor: "text-emerald-300",
              desc: "배터리 여유 충분. 정상 비행 가능합니다.",
              steps: ["• 정상 임무 수행 가능", "• 주기적 잔량 확인 권장"],
              icon: <Battery className="h-4 w-4 text-emerald-400" />,
            }

  const barColor =
    battery <= 20
      ? "bg-red-500"
      : battery <= 35
        ? "bg-amber-500"
        : battery <= 60
          ? "bg-sky-400"
          : "bg-emerald-500"

  return (
    <div
      className={`rounded-2xl border shadow-2xl backdrop-blur-md ${guide.bg} w-[220px]`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        {guide.icon}
        <span className={`text-xs font-bold ${guide.titleColor}`}>
          {guide.title}
        </span>
        <span className="relative ml-auto flex h-2 w-2 shrink-0">
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${guide.dot}`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${guide.dotInner}`}
          />
        </span>
      </div>

      <div className="px-3 pt-2.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] text-white/40">배터리 잔량</span>
          <span
            className={`text-xs font-bold tabular-nums ${guide.titleColor}`}
          >
            {battery.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${battery}%` }}
          />
        </div>
        <div className="relative mt-0.5 h-2 w-full">
          <div
            className="absolute top-0 h-full w-px bg-red-400/60"
            style={{ left: "20%" }}
            title="RTL 예비선 20%"
          />
          <span
            className="absolute text-[9px] text-red-400/60"
            style={{ left: "21%" }}
          >
            RTL
          </span>
        </div>
      </div>

      <div className="px-3 pb-3 pt-1.5">
        <p className="mb-1.5 text-[10px] leading-relaxed text-white/50">
          {guide.desc}
        </p>
        <div className="space-y-0.5">
          {guide.steps.map((step, i) => (
            <p
              key={i}
              className={`text-[10px] font-medium ${guide.titleColor}`}
            >
              {step}
            </p>
          ))}
        </div>
      </div>

      {altitude != null && (
        <div className="border-t border-white/10 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/40">현재 고도</span>
            <span
              className={`text-xs font-semibold tabular-nums ${getAltitudeColor(altitude)}`}
            >
              {altitude.toFixed(0)}m
              {altitude > 150 && (
                <span className="ml-1 text-[9px]">⚠ 초과</span>
              )}
              {altitude > 120 && altitude <= 150 && (
                <span className="ml-1 text-[9px]">주의</span>
              )}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getAltitudeColor(altitude).replace("text-", "bg-")}`}
              style={{ width: `${Math.min((altitude / 150) * 100, 100)}%` }}
            />
          </div>
          <div className="mt-0.5 flex justify-end">
            <span className="text-[9px] text-white/25">법적 한계 150m</span>
          </div>
        </div>
      )}
    </div>
  )
}

interface ChecklistCardProps {
  battery?: number
  altitude?: number
  speed?: number
  satellites?: number | null
  windSpeed?: number | null
  temperature?: number | null
  precipitation?: number | null
  connected: boolean
}

function ChecklistCard({
  battery,
  altitude,
  speed,
  satellites,
  windSpeed,
  temperature,
  precipitation,
  connected,
}: ChecklistCardProps) {
  const [showWeather, setShowWeather] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  type CheckResult = "pass" | "warn" | "fail" | "unknown"
  interface CheckRow {
    icon: React.ReactNode
    label: string
    value: string
    result: CheckResult
    tip: string
  }

  const checks: CheckRow[] = []

  if (!connected) {
    return (
      <div className="w-[220px] rounded-2xl border border-slate-500/40 bg-slate-900/90 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center gap-2 border-b border-white/10 px-3 py-2 text-left transition hover:bg-white/5"
        >
          <Info className="h-4 w-4 text-slate-400" />
          <span className="flex-1 text-xs font-bold text-slate-300">
            관제 체크리스트
          </span>
          <span className="text-[9px] text-white/25">
            {collapsed ? "▼" : "▲"}
          </span>
        </button>
        {!collapsed && (
          <div className="space-y-2 px-3 py-3">
            {[
              "배터리 셀 체크 확인",
              "조종기 / 기체 전원 확인",
              "QGC LTE 연결/ P900 연결 확인",
              "GPS 신호 확인 (25위성+)",
              "미션 플랜 경로 일치 확인",
              "수평캘리브레이션 확인",
              "식별장치 확인",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[9px] text-slate-500">
                  {i + 1}
                </span>
                <p className="text-[10px] text-slate-400">{item}</p>
              </div>
            ))}
            <p className="mt-2 border-t border-white/10 pt-2 text-[10px] text-slate-500">
              기체 연결 시 실시간 체크리스트로 전환됩니다.
            </p>
          </div>
        )}
      </div>
    )
  }

  checks.push({
    icon: <Battery className="h-3.5 w-3.5" />,
    label: "배터리",
    value: battery != null ? `${battery.toFixed(0)}%` : "—",
    result:
      battery == null
        ? "unknown"
        : battery <= 20
          ? "fail"
          : battery <= 35
            ? "warn"
            : "pass",
    tip:
      battery == null
        ? "수신 대기"
        : battery <= 20
          ? "즉시 귀환 필요"
          : battery <= 35
            ? "귀환 준비"
            : "정상",
  })
  checks.push({
    icon: <ArrowUp className="h-3.5 w-3.5" />,
    label: "고도",
    value: altitude != null ? `${altitude.toFixed(0)}m` : "—",
    result:
      altitude == null
        ? "unknown"
        : altitude > 150
          ? "fail"
          : altitude > 120
            ? "warn"
            : "pass",
    tip:
      altitude == null
        ? "수신 대기"
        : altitude > 150
          ? "법적 초과 — 즉시 하강"
          : altitude > 120
            ? "한계 접근"
            : "안전 고도",
  })
  checks.push({
    icon: <Gauge className="h-3.5 w-3.5" />,
    label: "속도",
    value: speed != null ? `${speed.toFixed(1)}m/s` : "—",
    result:
      speed == null
        ? "unknown"
        : speed > 35
          ? "fail"
          : speed > 25
            ? "warn"
            : "pass",
    tip:
      speed == null
        ? "수신 대기"
        : speed > 35
          ? "과속"
          : speed > 25
            ? "속도 주의"
            : "정상",
  })
  checks.push({
    icon: <Satellite className="h-3.5 w-3.5" />,
    label: "GNSS",
    value: satellites != null ? `${satellites}위성` : "—",
    result:
      satellites == null
        ? "unknown"
        : satellites < 10
          ? "fail"
          : satellites < 25
            ? "warn"
            : "pass",
    tip:
      satellites == null
        ? "수신 대기"
        : satellites < 10
          ? "신호 불량 — 착륙 권장"
          : satellites < 25
            ? "신호 보통"
            : "신호 양호",
  })
  if (windSpeed != null) {
    checks.push({
      icon: <Wind className="h-3.5 w-3.5" />,
      label: "풍속",
      value: `${windSpeed}m/s`,
      result: windSpeed >= 14 ? "fail" : windSpeed >= 7 ? "warn" : "pass",
      tip:
        windSpeed >= 14
          ? "비행 위험"
          : windSpeed >= 7
            ? "비행 주의"
            : "비행 가능",
    })
  }

  const passCount = checks.filter((c) => c.result === "pass").length
  const failCount = checks.filter((c) => c.result === "fail").length
  const warnCount = checks.filter((c) => c.result === "warn").length
  const overallResult: CheckResult =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass"

  const resultStyle: Record<
    CheckResult,
    { icon: React.ReactNode; color: string; bg: string }
  > = {
    pass: {
      icon: <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />,
      color: "text-emerald-300",
      bg: "bg-emerald-500/15",
    },
    warn: {
      icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
      color: "text-amber-300",
      bg: "bg-amber-500/15",
    },
    fail: {
      icon: <ShieldAlert className="h-3.5 w-3.5 text-red-400" />,
      color: "text-red-300",
      bg: "bg-red-500/15",
    },
    unknown: {
      icon: (
        <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-500" />
      ),
      color: "text-slate-400",
      bg: "bg-slate-500/10",
    },
  }

  return (
    <div className="w-[220px] overflow-hidden rounded-2xl border border-slate-600/40 bg-slate-900/90 shadow-2xl backdrop-blur-md">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:brightness-110 ${
          overallResult === "fail"
            ? "bg-red-950/60"
            : overallResult === "warn"
              ? "bg-amber-950/60"
              : "bg-emerald-950/40"
        }`}
      >
        {resultStyle[overallResult].icon}
        <span
          className={`flex-1 text-xs font-bold ${resultStyle[overallResult].color}`}
        >
          {overallResult === "fail"
            ? "위험 항목 발생"
            : overallResult === "warn"
              ? "주의 항목 있음"
              : "모든 항목 정상"}
        </span>
        <span className="mr-1 text-[10px] text-white/30">
          {passCount}/{checks.length}
        </span>
        <span className="text-[9px] text-white/25">
          {collapsed ? "▼" : "▲"}
        </span>
      </button>

      {!collapsed && (
        <>
          <div className="divide-y divide-white/5">
            {checks.map((check) => {
              const rs = resultStyle[check.result]
              return (
                <div
                  key={check.label}
                  className={`flex items-center gap-2 px-3 py-2 ${rs.bg}`}
                >
                  <span className={rs.color}>{check.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-semibold text-white/70">
                        {check.label}
                      </span>
                      <span
                        className={`text-[10px] font-bold tabular-nums ${rs.color}`}
                      >
                        {check.value}
                      </span>
                    </div>
                    <p className={`text-[9px] ${rs.color} opacity-80`}>
                      {check.tip}
                    </p>
                  </div>
                  <span className="shrink-0">{rs.icon}</span>
                </div>
              )
            })}
          </div>

          {(temperature != null ||
            windSpeed != null ||
            precipitation != null) && (
            <>
              <button
                type="button"
                onClick={() => setShowWeather((v) => !v)}
                className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2 text-left transition hover:bg-white/5"
              >
                <Thermometer className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-[10px] font-semibold text-white/50">
                  기상 정보
                </span>
                <span className="ml-auto text-[9px] text-white/25">
                  {showWeather ? "▲" : "▼"}
                </span>
              </button>
              {showWeather && (
                <div className="grid grid-cols-3 gap-2 border-t border-white/5 px-3 py-2.5 text-center">
                  {temperature != null && (
                    <div>
                      <p className="text-sm font-bold text-orange-300">
                        {temperature}°
                      </p>
                      <p className="text-[9px] text-white/30">기온</p>
                    </div>
                  )}
                  {windSpeed != null && (
                    <div>
                      <p
                        className={`text-sm font-bold ${windSpeed >= 14 ? "text-red-400" : windSpeed >= 7 ? "text-amber-400" : "text-emerald-400"}`}
                      >
                        {windSpeed}
                        <span className="text-[9px] font-normal">m/s</span>
                      </p>
                      <p className="text-[9px] text-white/30">풍속</p>
                      {windSpeed >= 14 && (
                        <span className="mt-0.5 inline-block rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
                          비행 위험
                        </span>
                      )}
                      {windSpeed >= 7 && windSpeed < 14 && (
                        <span className="mt-0.5 inline-block rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                          주의
                        </span>
                      )}
                    </div>
                  )}
                  {precipitation != null && (
                    <div>
                      <p className="text-sm font-bold text-sky-300">
                        {precipitation}
                        <span className="text-[9px] font-normal">mm</span>
                      </p>
                      <p className="text-[9px] text-white/30">강수</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function FlightStatusMiniCard({
  speed,
  altitude,
}: {
  speed?: number
  altitude?: number
}) {
  const [flightSec, setFlightSec] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    const isFlying = (speed ?? 0) > 1
    if (isFlying && !startRef.current) {
      startRef.current = Date.now()
    } else if (!isFlying) {
      startRef.current = null
      setFlightSec(0)
    }
  }, [speed])

  useEffect(() => {
    if (!startRef.current) return
    const id = setInterval(() => {
      if (startRef.current)
        setFlightSec(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [speed])

  const isFlying = (speed ?? 0) > 1
  const mm = Math.floor(flightSec / 60)
  const ss = flightSec % 60

  return (
    <div className="flex gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md">
        <Clock
          className={`h-3.5 w-3.5 ${isFlying ? "text-emerald-400" : "text-slate-500"}`}
        />
        <div className="flex flex-col leading-tight">
          <span className="text-[9px] text-white/30">비행 시간</span>
          <span
            className={`font-mono font-bold tabular-nums ${isFlying ? "text-emerald-300" : "text-slate-500"}`}
          >
            {isFlying
              ? `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
              : "--:--"}
          </span>
        </div>
      </div>
      {speed != null && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md">
          <TrendingDown className={`h-3.5 w-3.5 ${getSpeedColor(speed)}`} />
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] text-white/30">속도</span>
            <span
              className={`font-mono font-bold tabular-nums ${getSpeedColor(speed)}`}
            >
              {speed.toFixed(1)}
              <span className="text-[9px] font-normal"> m/s</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

interface MissionWaypoint {
  index: number
  lat: number
  lng: number
  alt: number
  command: number
}

interface MissionPlan {
  waypoints: MissionWaypoint[]
  totalDistanceM: number
}

const commandLabel = (cmd: number): string => {
  if (cmd === 22) return "이륙"
  if (cmd === 21) return "착륙"
  if (cmd === 20) return "RTL"
  if (cmd === 177) return "루프"
  return "WP"
}

function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function MissionInfoCard({
  plan,
  onClear,
  currentWpIndex,
}: {
  plan: MissionPlan
  onClear: () => void
  currentWpIndex: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  const distKm = (plan.totalDistanceM / 1000).toFixed(2)

  return (
    <div className="w-[200px] overflow-hidden rounded-2xl border border-blue-500/40 bg-slate-900/90 shadow-2xl backdrop-blur-md">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-white/10 px-3 py-2 text-left transition hover:bg-white/5"
      >
        <Route className="h-3.5 w-3.5 text-blue-400" />
        <span className="flex-1 text-xs font-bold text-blue-300">
          미션 플랜
        </span>
        <span className="text-[9px] text-white/25">
          {collapsed ? "▼" : "▲"}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          className="ml-1 rounded p-0.5 text-white/30 transition hover:bg-red-500/20 hover:text-red-400"
          title="미션 초기화"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </button>

      {!collapsed && (
        <>
          <div className="grid grid-cols-3 gap-1 border-b border-white/5 px-3 py-2 text-center">
            <div>
              <p className="text-sm font-bold text-blue-300">
                {plan.waypoints.length}
              </p>
              <p className="text-[9px] text-white/30">웨이포인트</p>
            </div>
            <div>
              <p className="text-sm font-bold text-sky-300">{distKm}</p>
              <p className="text-[9px] text-white/30">거리(km)</p>
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-300">
                {currentWpIndex >= 0 ? `${currentWpIndex + 1}` : "—"}
              </p>
              <p className="text-[9px] text-white/30">현재 WP</p>
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto">
            {plan.waypoints.map((wp, i) => {
              const isActive = i === currentWpIndex
              const isDone = currentWpIndex >= 0 && i < currentWpIndex
              const isStart = wp.command === 22
              const isLand = wp.command === 21 || wp.command === 20
              return (
                <div
                  key={wp.index}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[10px] ${
                    isActive
                      ? "bg-blue-500/20 text-blue-300"
                      : isDone
                        ? "text-white/25"
                        : "text-white/50"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      isActive
                        ? "bg-blue-500 text-white"
                        : isDone
                          ? "bg-white/10 text-white/30"
                          : isStart
                            ? "bg-emerald-500/30 text-emerald-400"
                            : isLand
                              ? "bg-amber-500/30 text-amber-400"
                              : "bg-white/10 text-white/50"
                    }`}
                  >
                    {isStart ? "↑" : isLand ? "↓" : i + 1}
                  </span>
                  <span className="flex-1">{commandLabel(wp.command)}</span>
                  <span className="tabular-nums text-white/30">
                    {wp.alt.toFixed(0)}m
                  </span>
                  {isActive && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 메인 NaverMap 컴포넌트
// ─────────────────────────────────────────────────────────────
export function NaverMap({
  lat,
  lng,
  markers: _markers = [],
  onMapClick,
  flightPath,
  dronePosition,
  droneStats,
  droneId,
}: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const currentMarker = useRef<any>(null)
  const droneMarkerRef = useRef<any>(null)
  const flightPathPolylineRef = useRef<any>(null)
  const lastWeatherUpdateRef = useRef<{ lat: number; lng: number } | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [clickedInfo, setClickedInfo] = useState<{
    lat: number
    lng: number
    address: string
  } | null>(null)
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [isAddressExpanded, setIsAddressExpanded] = useState(false)
  const [weatherData, setWeatherData] = useState<{
    temperature: number
    windSpeed: number
    precipitationAmount: number
  } | null>(null)
  const [isTrackingDrone, setIsTrackingDrone] = useState(true)
  const [isDroneConnected, setIsDroneConnected] = useState(false)
  const [satellites, setSatellites] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── 미션 플랜 상태 ─────────────────────────────────────────
  const [missionPlan, setMissionPlan] = useState<MissionPlan | null>(null)
  const [currentWpIndex, setCurrentWpIndex] = useState(-1)
  const missionPolylineRef = useRef<any>(null)
  const missionDoneLineRef = useRef<any>(null)
  const missionMarkersRef = useRef<any[]>([])

  // ★ Arming 상태 추적 (armed → 미션 자동 fetch)
  const wasArmedRef = useRef(false)
  const missionFetchedThisArm = useRef(false)

  const { overall: safetyOverall, items: safetyItems } = calcSafety(
    droneStats,
    isDroneConnected ? satellites : null,
    weatherData?.windSpeed,
  )

  // ── ★ Arming 감지 → 서버에서 미션 fetch ──────────────────
  useEffect(() => {
    const armed = droneStats?.armed ?? false

    // Disarm 시 초기화
    if (!armed && wasArmedRef.current) {
      missionFetchedThisArm.current = false
      setMissionPlan(null)
      setCurrentWpIndex(-1)
    }

    // Armed로 전환되는 순간 미션 fetch (1회만)
    if (armed && !wasArmedRef.current && !missionFetchedThisArm.current) {
      missionFetchedThisArm.current = true
      fetchMissionFromServer()
    }

    wasArmedRef.current = armed
  }, [droneStats?.armed, droneId])

  const fetchMissionFromServer = async () => {
    if (!droneId) return
    try {
      const res = await fetch(`${API_BASE_URL}/qgc/mission/${droneId}`)
      if (!res.ok) return
      const data = await res.json()
      const waypoints: MissionWaypoint[] = data.waypoints ?? []
      if (!waypoints.length) return

      let totalDistanceM = 0
      for (let i = 1; i < waypoints.length; i++) {
        totalDistanceM += haversineM(
          waypoints[i - 1].lat,
          waypoints[i - 1].lng,
          waypoints[i].lat,
          waypoints[i].lng,
        )
      }
      setMissionPlan({ waypoints, totalDistanceM })
      setCurrentWpIndex(-1)
      console.log(`[NaverMap] Arming 후 미션 로드 완료: ${waypoints.length}개`)
    } catch (e) {
      console.error("[NaverMap] 미션 fetch 실패:", e)
    }
  }

  // ── QGC passive 수신 (업로드 타이밍 맞춘 경우 유지) ──────
  useEffect(() => {
    const onMissionUpdate = (e: CustomEvent) => {
      const { waypoints } = e.detail
      if (!waypoints?.length) return
      let totalDistanceM = 0
      for (let i = 1; i < waypoints.length; i++) {
        totalDistanceM += haversineM(
          waypoints[i - 1].lat,
          waypoints[i - 1].lng,
          waypoints[i].lat,
          waypoints[i].lng,
        )
      }
      setMissionPlan({ waypoints, totalDistanceM })
      setCurrentWpIndex(-1)
    }
    window.addEventListener("missionUpdate", onMissionUpdate as EventListener)
    return () =>
      window.removeEventListener(
        "missionUpdate",
        onMissionUpdate as EventListener,
      )
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent).detail?.satellites
      if (v !== undefined) setSatellites(v)
    }
    window.addEventListener("droneSatelliteUpdate", handler)
    return () => window.removeEventListener("droneSatelliteUpdate", handler)
  }, [])

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
      if (mapInstance.current) {
        setTimeout(() => {
          const naver = (window as any).naver
          if (naver) naver.maps.Event.trigger(mapInstance.current, "resize")
        }, 100)
      }
    }
    document.addEventListener("fullscreenchange", onChange)
    document.addEventListener("webkitfullscreenchange", onChange)
    return () => {
      document.removeEventListener("fullscreenchange", onChange)
      document.removeEventListener("webkitfullscreenchange", onChange)
    }
  }, [])

  const toggleFullscreen = async () => {
    if (!mapContainerRef.current) return
    try {
      if (!document.fullscreenElement) {
        await mapContainerRef.current.requestFullscreen?.()
      } else {
        await document.exitFullscreen?.()
      }
    } catch (e) {
      console.error("전체화면 오류:", e)
    }
  }

  const fetchWeatherData = async (nx: number, ny: number) => {
    try {
      const now = new Date()
      now.setMinutes(now.getMinutes() - 40)
      const yy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, "0")
      const dd = String(now.getDate()).padStart(2, "0")
      const hh = String(now.getHours()).padStart(2, "0")
      const res = await fetch(
        `${API_BASE_URL}/weather/?nx=${nx}&ny=${ny}&base_date=${yy}${mm}${dd}&base_time=${hh}00`,
      )
      if (!res.ok) return
      const data = await res.json()
      const items = data?.response?.body?.items?.item ?? []
      let temperature = 0,
        windSpeed = 0,
        precipitationAmount = 0
      for (const item of items) {
        if (item.category === "T1H") temperature = parseFloat(item.obsrValue)
        if (item.category === "WSD") windSpeed = parseFloat(item.obsrValue)
        if (item.category === "RN1")
          precipitationAmount = parseFloat(item.obsrValue)
      }
      setWeatherData({ temperature, windSpeed, precipitationAmount })
    } catch (err) {
      console.error("날씨 API 실패:", err)
    }
  }

  const handleSearch = async () => {
    if (!mapInstance.current) return
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/naver/search-place?query=${encodeURIComponent(searchQuery)}`,
      )
      if (!res.ok) return alert("검색 실패")
      const data = await res.json()
      if (!data.items?.length) return alert("결과 없음")
      const place = data.items[0]
      const la = parseFloat(place.mapy) / 1e7
      const lo = parseFloat(place.mapx) / 1e7
      const naver = (window as any).naver
      mapInstance.current.setCenter(new naver.maps.LatLng(la, lo))
      mapInstance.current.setZoom(15)
      addMarker(la, lo)
      setClickedInfo({
        lat: la,
        lng: lo,
        address: place.roadAddress || place.address,
      })
      setShowInfoPanel(true)
      setSearchQuery("")
      const { nx, ny } = convertGRID_GPS("toXY", la, lo)
      onMapClick?.(nx, ny)
      fetchWeatherData(nx, ny)
    } catch (err) {
      console.error(err)
    }
  }

  const removeCurrentMarker = () => {
    if (currentMarker.current) {
      currentMarker.current.setMap(null)
      currentMarker.current = null
    }
  }

  const addMarker = (la: number, lo: number) => {
    if (!mapInstance.current) return
    removeCurrentMarker()
    const naver = (window as any).naver
    currentMarker.current = new naver.maps.Marker({
      position: new naver.maps.LatLng(la, lo),
      map: mapInstance.current,
      icon: {
        content: `<div style="width:18px;height:18px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.3)"></div>`,
        anchor: new naver.maps.Point(9, 9),
      },
    })
  }

  const handleMapClick = (e: any) => {
    const la = e.coord.lat(),
      lo = e.coord.lng()
    addMarker(la, lo)
    const { nx, ny } = convertGRID_GPS("toXY", la, lo)
    onMapClick?.(nx, ny)
    fetchWeatherData(nx, ny)
    const naver = (window as any).naver
    naver.maps.Service.reverseGeocode(
      { coords: new naver.maps.LatLng(la, lo), orders: "roadaddr,addr" },
      (status: any, response: any) => {
        if (status === naver.maps.Service.Status.OK) {
          setClickedInfo({
            lat: la,
            lng: lo,
            address:
              response.v2.address.roadAddress ||
              response.v2.address.jibunAddress,
          })
          setShowInfoPanel(true)
          setIsAddressExpanded(false)
        }
      },
    )
  }

  useEffect(() => {
    const scriptId = "naver-map-script"
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script")
      s.id = scriptId
      s.src =
        "https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=zuroo29p7x&submodules=geocoder"
      s.async = true
      document.head.appendChild(s)
      s.onload = () => initMap()
    } else {
      initMap()
    }
    function initMap() {
      if (!mapRef.current || !(window as any).naver) return
      const naver = (window as any).naver
      mapInstance.current = new naver.maps.Map(mapRef.current, {
        center: new naver.maps.LatLng(DEFAULT_LAT, DEFAULT_LNG),
        zoom: 15,
      })
      naver.maps.Event.addListener(mapInstance.current, "click", handleMapClick)
    }
    const onResize = () => {
      if (mapInstance.current)
        (window as any).naver.maps.Event.trigger(mapInstance.current, "resize")
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [lat, lng])

  const updateDroneMarker = (la: number, lo: number, yaw?: number) => {
    if (!mapInstance.current) return
    const naver = (window as any).naver
    const pos = new naver.maps.LatLng(la, lo)
    const rot = yaw ?? 0
    const icon = {
      content: `<div style="width:40px;height:40px;transform:rotate(${rot}deg)"><svg width="40" height="40" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))"><path d="M20 5L28 25L12 25Z" fill="#ef4444" stroke="white" stroke-width="2"/><circle cx="20" cy="25" r="6" fill="#ef4444" stroke="white" stroke-width="2"/></svg></div>`,
      anchor: new naver.maps.Point(20, 20),
      size: new naver.maps.Size(40, 40),
    }
    if (!droneMarkerRef.current) {
      droneMarkerRef.current = new naver.maps.Marker({
        position: pos,
        map: mapInstance.current,
        icon,
        zIndex: 1000,
      })
    } else {
      droneMarkerRef.current.setPosition(pos)
      droneMarkerRef.current.setIcon(icon)
    }
  }

  const removeDroneMarker = () => {
    if (droneMarkerRef.current) {
      droneMarkerRef.current.setMap(null)
      droneMarkerRef.current = null
    }
  }

  useEffect(() => {
    const onUpdate = (e: CustomEvent) => {
      const { lat: la, lng: lo, yaw, satellites: sats } = e.detail
      if (!la || !lo || !mapInstance.current) return
      updateDroneMarker(la, lo, yaw)
      setIsDroneConnected(true)
      if (sats !== undefined) setSatellites(sats)
      if (isTrackingDrone)
        mapInstance.current.setCenter(
          new (window as any).naver.maps.LatLng(la, lo),
        )
      const last = lastWeatherUpdateRef.current
      if (
        !last ||
        Math.abs(la - last.lat) > 0.01 ||
        Math.abs(lo - last.lng) > 0.01
      ) {
        const { nx, ny } = convertGRID_GPS("toXY", la, lo)
        fetchWeatherData(nx, ny)
        lastWeatherUpdateRef.current = { lat: la, lng: lo }
      }
    }
    const onDisconnect = () => {
      removeDroneMarker()
      setIsDroneConnected(false)
      setSatellites(null)
    }
    window.addEventListener("dronePositionUpdate", onUpdate as EventListener)
    window.addEventListener("droneDisconnected", onDisconnect)
    return () => {
      window.removeEventListener(
        "dronePositionUpdate",
        onUpdate as EventListener,
      )
      window.removeEventListener("droneDisconnected", onDisconnect)
      removeDroneMarker()
    }
  }, [isTrackingDrone])

  useEffect(() => {
    if (!dronePosition) {
      removeDroneMarker()
      setIsDroneConnected(false)
      return
    }
    if (!mapInstance.current) return
    const { lat: la, lng: lo, yaw, satellites: sats } = dronePosition
    if (typeof la !== "number" || typeof lo !== "number") {
      removeDroneMarker()
      setIsDroneConnected(false)
      return
    }
    updateDroneMarker(la, lo, yaw)
    setIsDroneConnected(true)
    if (sats !== undefined) setSatellites(sats)
    if (isTrackingDrone)
      mapInstance.current.setCenter(
        new (window as any).naver.maps.LatLng(la, lo),
      )
  }, [dronePosition, isTrackingDrone])

  useEffect(() => {
    if (!flightPath?.length || !mapInstance.current) {
      flightPathPolylineRef.current?.setMap(null)
      flightPathPolylineRef.current = null
      return
    }
    const naver = (window as any).naver
    const path = flightPath.map((p) => new naver.maps.LatLng(p.lat, p.lng))
    flightPathPolylineRef.current?.setMap(null)
    flightPathPolylineRef.current = new naver.maps.Polyline({
      map: mapInstance.current,
      path,
      strokeColor: "#10B981",
      strokeWeight: 3,
      strokeOpacity: 0.8,
      zIndex: 200,
    })
    if (path.length > 0) {
      const bounds = new naver.maps.LatLngBounds(path[0], path[0])
      path.forEach((pt: any) => bounds.extend(pt))
      mapInstance.current.fitBounds(bounds, { padding: 50 })
    }
  }, [flightPath])

  // ── 미션 지도 렌더링 ──────────────────────────────────────────
  useEffect(() => {
    const naver = (window as any).naver
    if (!naver || !mapInstance.current) return

    missionPolylineRef.current?.setMap(null)
    missionDoneLineRef.current?.setMap(null)
    missionMarkersRef.current.forEach((m) => m.setMap(null))
    missionMarkersRef.current = []

    if (!missionPlan?.waypoints.length) return

    const wps = missionPlan.waypoints
    const allLatLngs = wps.map((wp) => new naver.maps.LatLng(wp.lat, wp.lng))

    missionPolylineRef.current = new naver.maps.Polyline({
      map: mapInstance.current,
      path: allLatLngs,
      strokeColor: "#3b82f6",
      strokeWeight: 2,
      strokeOpacity: 0.6,
      strokeStyle: "shortdash",
      zIndex: 250,
    })

    if (currentWpIndex > 0) {
      const donePath = allLatLngs.slice(0, currentWpIndex + 1)
      missionDoneLineRef.current = new naver.maps.Polyline({
        map: mapInstance.current,
        path: donePath,
        strokeColor: "#ffffff",
        strokeWeight: 2.5,
        strokeOpacity: 0.9,
        zIndex: 260,
      })
    }

    wps.forEach((wp, i) => {
      const isActive = i === currentWpIndex
      const isDone = currentWpIndex >= 0 && i < currentWpIndex
      const isStart = wp.command === 22
      const isLand = wp.command === 21 || wp.command === 20
      const bgColor = isActive
        ? "#3b82f6"
        : isDone
          ? "#ffffff40"
          : isStart
            ? "#22c55e"
            : isLand
              ? "#f59e0b"
              : "#1e40af"
      const borderColor = isActive ? "#ffffff" : "#93c5fd"
      const label = isStart ? "▲" : isLand ? "▼" : String(i + 1)

      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(wp.lat, wp.lng),
        map: mapInstance.current,
        icon: {
          content: `
            <div style="position:relative;display:flex;align-items:center;justify-content:center;width:26px;height:26px;background:${bgColor};border:2px solid ${borderColor};border-radius:50%;font-size:9px;font-weight:bold;color:white;box-shadow:0 2px 8px rgba(0,0,0,0.5);${isActive ? "animation:pulse 1.5s infinite;" : ""}">${label}</div>
            <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${bgColor};"></div>
          `,
          anchor: new naver.maps.Point(13, 32),
        },
        zIndex: isActive ? 400 : 300,
      })

      naver.maps.Event.addListener(marker, "mouseover", () => {
        const infoWindow = new naver.maps.InfoWindow({
          content: `
            <div style="padding:6px 10px;background:#1e293b;border:1px solid #3b82f6;border-radius:8px;font-size:11px;color:#e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.4);">
              <b style="color:#60a5fa">${commandLabel(wp.command)} ${i + 1}</b><br/>
              고도: ${wp.alt.toFixed(0)}m<br/>
              <span style="color:#94a3b8;font-size:10px">${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)}</span>
            </div>
          `,
          borderWidth: 0,
          backgroundColor: "transparent",
          anchorSize: new naver.maps.Size(0, 0),
          pixelOffset: new naver.maps.Point(0, -8),
        })
        infoWindow.open(mapInstance.current, marker)
        setTimeout(() => infoWindow.close(), 2500)
      })

      missionMarkersRef.current.push(marker)
    })

    if (allLatLngs.length > 0) {
      const bounds = new naver.maps.LatLngBounds(allLatLngs[0], allLatLngs[0])
      allLatLngs.forEach((ll: any) => bounds.extend(ll))
      mapInstance.current.fitBounds(bounds, { padding: 60 })
    }
  }, [missionPlan, currentWpIndex])

  // ── 기체 위치 → 현재 웨이포인트 자동 추적 ────────────────────
  useEffect(() => {
    if (!missionPlan || !dronePosition) return
    const { lat: dLat, lng: dLng } = dronePosition
    if (typeof dLat !== "number" || typeof dLng !== "number") return
    let minDist = Infinity,
      closestIdx = -1
    missionPlan.waypoints.forEach((wp, i) => {
      const d = haversineM(dLat, dLng, wp.lat, wp.lng)
      if (d < minDist) {
        minDist = d
        closestIdx = i
      }
    })
    if (minDist < 30) setCurrentWpIndex(closestIdx)
  }, [dronePosition, missionPlan])

  const clearMission = () => {
    setMissionPlan(null)
    setCurrentWpIndex(-1)
    missionFetchedThisArm.current = false
  }

  return (
    <div ref={mapContainerRef} className="relative flex h-full w-full flex-col">
      {/* 검색창 */}
      {!isDroneConnected && (
        <div className="absolute left-1/2 top-3 z-50 w-[90%] max-w-md -translate-x-1/2">
          <div className="flex items-center rounded-full border border-gray-200 bg-white/95 px-3 py-1 shadow-md backdrop-blur-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="장소 검색"
              className="flex-1 border-none bg-transparent px-2 py-1 text-sm focus:outline-none"
            />
            <button
              onClick={handleSearch}
              className="rounded-full bg-blue-600 px-4 py-1 text-sm text-white transition hover:bg-blue-700"
            >
              검색
            </button>
          </div>
        </div>
      )}

      {/* 안전 배너 */}
      <div
        className={`absolute left-3 right-3 z-50 ${isDroneConnected ? "top-3" : "top-14"}`}
      >
        <SafetyBanner
          overall={safetyOverall}
          items={safetyItems}
          connected={isDroneConnected}
        />
      </div>

      {/* 드론 HUD — 좌측 상단 */}
      {isDroneConnected && droneStats && (
        <div className="absolute left-3 top-[7.5rem] z-50 flex flex-col gap-1.5">
          {droneStats.battery != null && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-md">
              <Battery
                className={`h-3.5 w-3.5 ${getBatteryColor(droneStats.battery)}`}
              />
              <span className="text-white/50">배터리</span>
              <span
                className={`font-semibold tabular-nums ${getBatteryColor(droneStats.battery)}`}
              >
                {droneStats.battery.toFixed(0)}%
              </span>
              {droneStats.battery <= 20 && (
                <span className="ml-1 animate-pulse rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold">
                  즉시 복귀
                </span>
              )}
            </div>
          )}
          {droneStats.altitude != null && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-md">
              <ArrowUp
                className={`h-3.5 w-3.5 ${getAltitudeColor(droneStats.altitude)}`}
              />
              <span className="text-white/50">고도</span>
              <span
                className={`font-semibold tabular-nums ${getAltitudeColor(droneStats.altitude)}`}
              >
                {droneStats.altitude.toFixed(0)}m
              </span>
              {droneStats.altitude > 150 && (
                <span className="ml-1 animate-pulse rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold">
                  제한 초과
                </span>
              )}
            </div>
          )}
          {droneStats.speed != null && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-md">
              <Gauge
                className={`h-3.5 w-3.5 ${getSpeedColor(droneStats.speed)}`}
              />
              <span className="text-white/50">속도</span>
              <span
                className={`font-semibold tabular-nums ${getSpeedColor(droneStats.speed)}`}
              >
                {droneStats.speed.toFixed(1)}m/s
              </span>
            </div>
          )}
          {/* ★ Arming 상태 표시 */}
          {droneStats.armed != null && (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-md ${
                droneStats.armed
                  ? "border-emerald-500/40 bg-emerald-950/80"
                  : "border-slate-500/40 bg-slate-900/80"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${droneStats.armed ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`}
              />
              <span
                className={
                  droneStats.armed
                    ? "font-semibold text-emerald-300"
                    : "text-slate-400"
                }
              >
                {droneStats.armed ? "ARMED" : "DISARMED"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* GNSS HUD — 우측 상단 */}
      {satellites !== null && isDroneConnected && (
        <div
          className={`absolute right-3 top-[7.5rem] z-50 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md ${
            satellites < 10
              ? "border-red-500/40 bg-red-950/80"
              : satellites < 25
                ? "border-amber-500/40 bg-amber-950/80"
                : "border-emerald-500/40 bg-emerald-950/80"
          }`}
        >
          <Satellite
            className={`h-4 w-4 ${satellites < 10 ? "text-red-400" : satellites < 25 ? "text-amber-400" : "text-emerald-400"}`}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] text-white/40">GNSS</span>
            <span
              className={`font-semibold ${satellites < 10 ? "text-red-400" : satellites < 25 ? "text-amber-400" : "text-emerald-400"}`}
            >
              {satellites < 10 ? "불량" : satellites < 25 ? "보통" : "양호"} (
              {satellites})
            </span>
          </div>
        </div>
      )}

      {/* 미션 정보 카드 */}
      {missionPlan && (
        <div
          className="absolute left-3 z-50"
          style={{ top: isDroneConnected ? "calc(7.5rem + 8.5rem)" : "4rem" }}
        >
          <MissionInfoCard
            plan={missionPlan}
            onClear={clearMission}
            currentWpIndex={currentWpIndex}
          />
        </div>
      )}

      {/* 좌하단: 추적 버튼 + 배터리 가이드 */}
      {isDroneConnected && (
        <div className="absolute bottom-4 left-3 z-50 flex flex-col items-start gap-2">
          <button
            onClick={() => setIsTrackingDrone((v) => !v)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 ${
              isTrackingDrone
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-slate-600/80 backdrop-blur-sm hover:bg-slate-700"
            }`}
          >
            {isTrackingDrone ? (
              <Navigation className="h-4 w-4" />
            ) : (
              <NavigationOff className="h-4 w-4" />
            )}
            {isTrackingDrone ? "추적 중" : "추적 해제"}
          </button>
          <BatteryGuideCard
            battery={droneStats?.battery}
            altitude={droneStats?.altitude}
          />
        </div>
      )}

      {/* 우하단: 비행 시간 + 체크리스트 */}
      {isDroneConnected && (
        <div className="absolute bottom-4 right-3 z-50 flex flex-col items-end gap-2">
          <FlightStatusMiniCard
            speed={droneStats?.speed}
            altitude={droneStats?.altitude}
          />
          <ChecklistCard
            battery={droneStats?.battery}
            altitude={droneStats?.altitude}
            speed={droneStats?.speed}
            satellites={satellites}
            windSpeed={weatherData?.windSpeed ?? null}
            temperature={weatherData?.temperature ?? null}
            precipitation={weatherData?.precipitationAmount ?? null}
            connected={isDroneConnected}
          />
        </div>
      )}

      {/* 미연결 시 사전 체크리스트 */}
      {!isDroneConnected && (
        <div className="absolute bottom-16 right-3 z-50">
          <ChecklistCard
            connected={false}
            windSpeed={weatherData?.windSpeed ?? null}
            temperature={weatherData?.temperature ?? null}
            precipitation={weatherData?.precipitationAmount ?? null}
          />
        </div>
      )}

      {/* 전체화면 버튼 */}
      <button
        onClick={toggleFullscreen}
        className="absolute bottom-4 z-[60] flex items-center justify-center rounded-full bg-blue-600 p-3 text-white shadow-lg transition-all hover:scale-110 hover:bg-blue-700"
        style={{ right: isDroneConnected ? "244px" : "12px" }}
        title={isFullscreen ? "전체화면 종료" : "전체화면"}
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </button>

      {/* 클릭 정보 패널 */}
      {showInfoPanel && clickedInfo && (
        <div className="absolute bottom-0 left-0 right-0 z-40 p-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
                <MapPin className="h-3.5 w-3.5" />
                선택 위치
              </div>
              <button
                onClick={() => {
                  setShowInfoPanel(false)
                  removeCurrentMarker()
                  setWeatherData(null)
                }}
                className="rounded-lg p-1 text-white/30 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-white/40">
                    위도
                  </span>
                  <p className="font-mono text-sm font-semibold text-sky-300">
                    {clickedInfo.lat.toFixed(6)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-white/40">
                    경도
                  </span>
                  <p className="font-mono text-sm font-semibold text-sky-300">
                    {clickedInfo.lng.toFixed(6)}
                  </p>
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-white/40">
                  주소
                </span>
                <div className="mt-0.5 flex items-start gap-1">
                  <p
                    className={`text-sm text-white/90 ${isAddressExpanded ? "" : "line-clamp-1"}`}
                  >
                    {clickedInfo.address}
                  </p>
                  {clickedInfo.address.length > 28 && (
                    <button
                      onClick={() => setIsAddressExpanded((v) => !v)}
                      className="shrink-0 text-xs text-white/30 hover:text-white"
                    >
                      {isAddressExpanded ? "▲" : "▼"}
                    </button>
                  )}
                </div>
              </div>
              {weatherData && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <span className="text-[10px] uppercase tracking-wide text-white/40">
                    기상 정보
                  </span>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-lg font-bold text-orange-300">
                        {weatherData.temperature}°
                      </p>
                      <p className="text-[10px] text-white/40">기온</p>
                    </div>
                    <div className="text-center">
                      <p
                        className={`text-lg font-bold ${weatherData.windSpeed >= 14 ? "text-red-400" : weatherData.windSpeed >= 7 ? "text-amber-400" : "text-emerald-400"}`}
                      >
                        {weatherData.windSpeed}
                        <span className="text-xs font-normal">m/s</span>
                      </p>
                      <p className="text-[10px] text-white/40">풍속</p>
                      {weatherData.windSpeed >= 14 && (
                        <span className="mt-0.5 inline-block rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
                          비행 위험
                        </span>
                      )}
                      {weatherData.windSpeed >= 7 &&
                        weatherData.windSpeed < 14 && (
                          <span className="mt-0.5 inline-block rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                            주의
                          </span>
                        )}
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-sky-300">
                        {weatherData.precipitationAmount}
                        <span className="text-xs font-normal">mm</span>
                      </p>
                      <p className="text-[10px] text-white/40">강수</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 지도 영역 */}
      <div ref={mapRef} className="min-h-[400px] w-full flex-1" />
    </div>
  )
}
