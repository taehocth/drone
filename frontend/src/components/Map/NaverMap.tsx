import { useEffect, useRef, useState } from "react"
import { convertGRID_GPS } from "@/utils/convertGrid"
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUp,
  Battery,
  CheckCircle,
  Clock,
  Gauge,
  GripHorizontal,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  NavigationOff,
  PlaneLanding,
  Route,
  Satellite,
  ShieldAlert,
  Timer,
  Trash2,
  TrendingDown,
  WifiOff,
  Wind,
  X,
} from "lucide-react"

/* =============================================================
 * NaverMap — 수정 사항
 * -------------------------------------------------------------
 *  1. 기상 state 분리
 *     - droneWeather   : 드론 위치 날씨 → 안전 배너·비행 정보(안전 판단용)
 *     - clickedWeather : 지도 클릭/검색 위치 날씨 → 하단 정보 패널 전용
 *     (이전에는 한 state 를 공유해 클릭하면 안전 배너 풍속이 바뀌었음)
 *  2. 드론 날씨 갱신: 약 5km 격자 이동 시 + 30분 주기 (호버링 중에도 갱신)
 *     prop(dronePosition) / 이벤트(dronePositionUpdate) 두 경로 모두 반영
 *  3. /weather/forecast (위경도) 직접 호출 — 서버 캐시와 같은 격자 사용, 돌풍 포함
 *  4. buildApiUrl 로 /api/v1 중복 방지 (기상·장소 검색)
 *  5. 지도는 최초 1회만 생성 (lat/lng 변경 시 재생성하던 문제 제거)
 *  6. fitBounds 는 미션/비행경로를 처음 받을 때 1회만 (드론 추적과 충돌 방지)
 *  7. 추적 토글 시 드론 마커가 사라지던 문제 수정 (isTracking 을 ref 로)
 *  8. 미사용 컴포넌트·아이콘 정리, 중첩 <button> 수정, 배터리 패널 가짜 드래그 제거
 * ============================================================= */

// ── API URL 헬퍼 — VITE_API_URL 값이 무엇이든 /api/v1 을 한 번만 붙인다 ──
//    (WeatherInfoCard 와 동일. @/utils/api.ts 로 옮겨 공용화 권장)
function buildApiUrl(path: string): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined) || "/api/v1"
  let base = raw.replace(/\/+$/, "")
  if (!base.endsWith("/api/v1")) base = `${base}/api/v1`
  return `${base}${path}`
}

// ── 비행 기상 기준 ─────────────────────────────────────────
//    ⚠️ WeatherInfoCard(풍속 5/8, 돌풍 12)와 값이 다름 → 기체 내풍 성능에 맞춰
//       @/constants/flightLimits.ts 한 곳에서 관리하도록 통일할 것
const WIND_CAUTION = 7 // m/s
const WIND_DANGER = 14 // m/s
const GUST_DANGER = 12 // m/s

// ── 기상 데이터 ────────────────────────────────────────────
interface Wx {
  temperature: number
  windSpeed: number
  windGust: number
  precipitationAmount: number
}

async function fetchWeatherAt(lat: number, lng: number): Promise<Wx | null> {
  const res = await fetch(
    buildApiUrl(
      `/weather/forecast?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}&hours=1`,
    ),
  )
  if (!res.ok) return null
  const cur = (await res.json())?.current
  if (!cur) return null
  return {
    temperature: Number(cur.temp ?? 0),
    windSpeed: Number(cur.wind ?? 0),
    windGust: Number(cur.gust ?? 0),
    precipitationAmount: Number(cur.precip ?? 0),
  }
}

const WX_SNAP = 0.05 // 서버 SNAP_DEG 와 동일 (약 5km 격자)
const WX_REFRESH_MS = 30 * 60_000
const snapWx = (v: number) => Math.round(v / WX_SNAP) * WX_SNAP

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
    armed?: boolean
  }
  droneId?: string
  missionWaypoints?: Array<{
    index: number
    command: number
    lat: number
    lng: number
    alt: number
  }>
}

const DEFAULT_LAT = 36.5941
const DEFAULT_LNG = 126.2932
const NAVER_SCRIPT_ID = "naver-map-script"
const NAVER_SCRIPT_SRC =
  "https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=zuroo29p7x&submodules=geocoder"

type SafetyLevel = "safe" | "caution" | "danger"

interface SafetyItem {
  label: string
  level: SafetyLevel
  hint: string
}

function windLevel(wind: number, gust = 0): SafetyLevel {
  if (wind >= WIND_DANGER || gust >= GUST_DANGER) return "danger"
  if (wind >= WIND_CAUTION) return "caution"
  return "safe"
}

function calcSafety(
  droneStats?: {
    battery?: number
    altitude?: number
    speed?: number
    armed?: boolean
  },
  satellites?: number | null,
  weather?: Wx | null,
): { overall: SafetyLevel; items: SafetyItem[] } {
  const items: SafetyItem[] = []

  if (droneStats?.battery != null) {
    const b = droneStats.battery
    items.push(
      b <= 20
        ? { label: "배터리", level: "danger", hint: `${b.toFixed(0)}% — 즉시 복귀` }
        : b <= 35
          ? { label: "배터리", level: "caution", hint: `${b.toFixed(0)}% — 복귀 준비` }
          : { label: "배터리", level: "safe", hint: `${b.toFixed(0)}%` },
    )
  }

  if (droneStats?.altitude != null) {
    const a = droneStats.altitude
    items.push(
      a > 150
        ? { label: "고도", level: "danger", hint: `${a.toFixed(0)}m — 법적 제한 초과` }
        : a > 120
          ? { label: "고도", level: "caution", hint: `${a.toFixed(0)}m — 제한 접근` }
          : { label: "고도", level: "safe", hint: `${a.toFixed(0)}m` },
    )
  }

  if (droneStats?.speed != null) {
    const s = droneStats.speed
    items.push(
      s > 35
        ? { label: "속도", level: "danger", hint: `${s.toFixed(1)}m/s — 과속` }
        : s > 25
          ? { label: "속도", level: "caution", hint: `${s.toFixed(1)}m/s — 주의` }
          : { label: "속도", level: "safe", hint: `${s.toFixed(1)}m/s` },
    )
  }

  if (satellites != null) {
    items.push(
      satellites < 10
        ? { label: "GNSS", level: "danger", hint: `${satellites}위성 — 신호 불량` }
        : satellites < 25
          ? { label: "GNSS", level: "caution", hint: `${satellites}위성 — 보통` }
          : { label: "GNSS", level: "safe", hint: `${satellites}위성` },
    )
  }

  if (weather) {
    const lvl = windLevel(weather.windSpeed, weather.windGust)
    const base = `${weather.windSpeed.toFixed(1)}m/s${
      weather.windGust > 0 ? ` (돌풍 ${weather.windGust.toFixed(1)})` : ""
    }`
    items.push({
      label: "풍속",
      level: lvl,
      hint: lvl === "danger" ? `${base} — 비행 위험` : lvl === "caution" ? `${base} — 주의` : base,
    })
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

const getSatColor = (v: number) =>
  v < 10 ? "text-red-400" : v < 25 ? "text-amber-400" : "text-emerald-400"

// ── 기온·풍속·강수 3칸 표시 (비행 정보 팝오버 / 클릭 정보 패널 공용) ──
function WeatherTriplet({ w, large = false }: { w: Wx; large?: boolean }) {
  const num = large ? "text-lg" : "text-sm"
  const unit = large ? "text-xs" : "text-[9px]"
  const cap = large ? "text-[10px] text-white/40" : "text-[9px] text-white/30"
  const lvl = windLevel(w.windSpeed, w.windGust)
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div>
        <p className={`${num} font-bold text-orange-300`}>{w.temperature.toFixed(1)}°</p>
        <p className={cap}>기온</p>
      </div>
      <div>
        <p className={`${num} font-bold ${levelText[lvl]}`}>
          {w.windSpeed.toFixed(1)}
          <span className={`${unit} font-normal`}>m/s</span>
        </p>
        <p className={cap}>
          풍속{w.windGust > 0 ? ` (돌풍 ${w.windGust.toFixed(1)})` : ""}
        </p>
        {lvl === "danger" && (
          <span className="mt-0.5 inline-block rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
            비행 위험
          </span>
        )}
        {lvl === "caution" && (
          <span className="mt-0.5 inline-block rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
            주의
          </span>
        )}
      </div>
      <div>
        <p className={`${num} font-bold text-sky-300`}>
          {w.precipitationAmount.toFixed(1)}
          <span className={`${unit} font-normal`}>mm</span>
        </p>
        <p className={cap}>강수</p>
      </div>
    </div>
  )
}

// ── 드래그 훅 ──────────────────────────────────────────────
function useDraggable(initialPos: { x: number; y: number }) {
  const [pos, setPos] = useState(initialPos)
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

  const onHandleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
    e.stopPropagation()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y })
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  return { pos, onHandleMouseDown }
}

// ── 팝오버 패널 ────────────────────────────────────────────
function PopoverPanel({
  icon,
  label,
  badge,
  badgeLevel,
  initialPos,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode
  label: string
  badge?: string
  badgeLevel?: SafetyLevel
  initialPos: { x: number; y: number }
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const { pos, onHandleMouseDown } = useDraggable(initialPos)

  const borderColor =
    badgeLevel === "danger"
      ? "border-red-500/70"
      : badgeLevel === "caution"
        ? "border-amber-500/70"
        : "border-white/15"
  const badgeBg =
    badgeLevel === "danger"
      ? "bg-red-500/20 text-red-300"
      : badgeLevel === "caution"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-emerald-500/20 text-emerald-300"

  return (
    <div className="absolute z-50" style={{ left: pos.x, top: pos.y, userSelect: "none" }}>
      {open && (
        <div
          className={`mb-2 overflow-hidden rounded-2xl border ${borderColor} bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-md`}
          style={{ minWidth: 260 }}
        >
          {/* 드래그 핸들 */}
          <div
            className="flex cursor-grab items-center gap-2 border-b border-white/10 bg-white/5 px-3 py-2 active:cursor-grabbing"
            onMouseDown={onHandleMouseDown}
          >
            <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-white/25" />
            <span className="flex-1 text-[10px] font-bold uppercase tracking-widest text-white/35">
              {label}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
              }}
              className="rounded-md p-0.5 text-white/25 transition hover:bg-white/10 hover:text-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {children}
        </div>
      )}

      {/* 토글 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full border ${borderColor} bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white/80 shadow-lg shadow-black/40 backdrop-blur-md transition-all hover:scale-[1.03] hover:bg-slate-800/90 active:scale-[0.97]`}
      >
        <span className="flex h-4 w-4 items-center justify-center opacity-80">{icon}</span>
        <span>{label}</span>
        {badge && badgeLevel && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeBg}`}>
            {badge}
          </span>
        )}
        <span className="ml-0.5 text-[9px] text-white/25">{open ? "▲" : "▼"}</span>
      </button>
    </div>
  )
}

// ── 배터리 소모율 추적 훅 ─────────────────────────────────
interface BatteryPrediction {
  drainRatePerMin: number | null // %/min
  remainingMinutes: number | null // 현재 배터리로 비행 가능 시간(분)
  rtlSafeMinutes: number | null // RTL 예비(20%) 까지 남은 시간
  rtlReservePercent: number // RTL 예비 %
  confidence: "low" | "medium" | "high"
  sampleCount: number
}

const EMPTY_PREDICTION: BatteryPrediction = {
  drainRatePerMin: null,
  remainingMinutes: null,
  rtlSafeMinutes: null,
  rtlReservePercent: 20,
  confidence: "low",
  sampleCount: 0,
}

function useBatteryPrediction(
  battery: number | undefined,
  connected: boolean,
): BatteryPrediction {
  const samplesRef = useRef<Array<{ battery: number; ts: number }>>([])
  const [prediction, setPrediction] = useState<BatteryPrediction>(EMPTY_PREDICTION)

  useEffect(() => {
    if (!connected || battery == null) {
      samplesRef.current = []
      setPrediction(EMPTY_PREDICTION)
      return
    }

    const now = Date.now()
    const samples = samplesRef.current

    // 샘플 추가 (5초 간격)
    const last = samples[samples.length - 1]
    if (!last || now - last.ts >= 5000) {
      samples.push({ battery, ts: now })
      if (samples.length > 60) samples.shift() // 최대 60개 (약 5분)
    }

    if (samples.length < 3) {
      setPrediction((p) => ({ ...p, sampleCount: samples.length }))
      return
    }

    const oldest = samples[0]
    const newest = samples[samples.length - 1]
    const dtMin = (newest.ts - oldest.ts) / 60000
    const dbPct = oldest.battery - newest.battery

    if (dtMin < 0.1 || dbPct <= 0) {
      setPrediction((p) => ({ ...p, sampleCount: samples.length }))
      return
    }

    const drainRatePerMin = dbPct / dtMin
    const rtlReservePercent = 20
    const usableBattery = battery - rtlReservePercent
    const remainingMinutes = usableBattery > 0 ? usableBattery / drainRatePerMin : 0
    const rtlSafeMinutes =
      battery > rtlReservePercent ? (battery - rtlReservePercent) / drainRatePerMin : 0
    const confidence: "low" | "medium" | "high" =
      samples.length >= 24 ? "high" : samples.length >= 10 ? "medium" : "low"

    setPrediction({
      drainRatePerMin,
      remainingMinutes,
      rtlSafeMinutes,
      rtlReservePercent,
      confidence,
      sampleCount: samples.length,
    })
  }, [battery, connected])

  return prediction
}

// ── 배터리 예측 패널 (우측 상단 고정) ─────────────────────
function BatteryPredictionPanel({
  battery,
  prediction,
  connected,
}: {
  battery?: number
  prediction: BatteryPrediction
  connected: boolean
}) {
  const [open, setOpen] = useState(true)

  if (!connected || battery == null) return null

  const { drainRatePerMin, remainingMinutes, rtlSafeMinutes, confidence, sampleCount } =
    prediction

  const batteryLevel = battery <= 20 ? "danger" : battery <= 35 ? "caution" : "safe"

  const borderColor =
    batteryLevel === "danger"
      ? "border-red-500/70"
      : batteryLevel === "caution"
        ? "border-amber-500/70"
        : "border-emerald-500/40"

  const badgeBg =
    batteryLevel === "danger"
      ? "bg-red-500/20 text-red-300"
      : batteryLevel === "caution"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-emerald-500/20 text-emerald-300"

  const barColor =
    batteryLevel === "danger"
      ? "bg-red-500"
      : batteryLevel === "caution"
        ? "bg-amber-500"
        : "bg-emerald-500"

  const fmtMin = (min: number | null) => {
    if (min === null) return "—"
    if (min <= 0) return "0분"
    const m = Math.floor(min)
    const s = Math.round((min - m) * 60)
    return m > 0 ? `${m}분 ${s}초` : `${s}초`
  }

  const confidenceLabel = {
    low: { text: "예측 중...", color: "text-white/30" },
    medium: { text: "보통 신뢰도", color: "text-amber-400/70" },
    high: { text: "높은 신뢰도", color: "text-emerald-400/70" },
  }[confidence]

  const rtlUrgency =
    battery <= 20
      ? "danger"
      : rtlSafeMinutes !== null && rtlSafeMinutes < 2
        ? "danger"
        : rtlSafeMinutes !== null && rtlSafeMinutes < 5
          ? "caution"
          : "safe"

  return (
    <div className="absolute z-50" style={{ right: 12, top: 64, userSelect: "none" }}>
      {open && (
        <div
          className={`mb-2 w-[280px] overflow-hidden rounded-2xl border ${borderColor} bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-md`}
        >
          {/* 헤더 */}
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5">
            <span className="flex-1 text-[11px] font-bold uppercase tracking-widest text-white/40">
              배터리 예측
            </span>
            <span className={`text-[10px] font-medium ${confidenceLabel.color}`}>
              {confidenceLabel.text}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-1 rounded-md p-0.5 text-white/25 transition hover:bg-white/10 hover:text-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 배터리 바 + 수치 */}
          <div className="px-4 pb-2 pt-3.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Battery className={`h-4 w-4 ${getBatteryColor(battery)}`} />
                <span className="text-xs text-white/50">현재 잔량</span>
              </div>
              <span className={`font-mono text-lg font-bold tabular-nums ${getBatteryColor(battery)}`}>
                {battery.toFixed(0)}%
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${Math.min(battery, 100)}%` }}
              />
              <div className="absolute top-0 h-full w-0.5 bg-red-400/90" style={{ left: "20%" }} />
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-[10px] font-medium text-red-400/70">RTL 예비 20%</span>
              <span className="text-[10px] text-white/25">100%</span>
            </div>
          </div>

          {/* 소모율 */}
          {drainRatePerMin !== null && (
            <div className="border-t border-white/5 px-4 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5 text-white/35" />
                  <span className="text-xs text-white/45">소모율</span>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums text-white/80">
                  {drainRatePerMin.toFixed(2)}% / 분
                </span>
              </div>
            </div>
          )}

          {/* 예측 시간 카드 2개 */}
          <div className="grid grid-cols-2 gap-2.5 border-t border-white/5 px-4 py-3">
            <div
              className={`rounded-xl px-3 py-2.5 ${
                remainingMinutes !== null && remainingMinutes <= 0
                  ? "bg-red-500/15"
                  : remainingMinutes !== null && remainingMinutes < 5
                    ? "bg-amber-500/15"
                    : "bg-white/5"
              }`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-white/35" />
                <span className="text-[10px] font-semibold text-white/40">비행 가능</span>
              </div>
              <p
                className={`font-mono text-sm font-bold tabular-nums ${
                  remainingMinutes === null
                    ? "text-white/25"
                    : remainingMinutes <= 0
                      ? "text-red-400"
                      : remainingMinutes < 5
                        ? "text-amber-400"
                        : "text-emerald-400"
                }`}
              >
                {remainingMinutes === null ? "계산 중" : fmtMin(remainingMinutes)}
              </p>
              <p className="mt-1 text-[9px] text-white/25">RTL 20% 제외</p>
            </div>

            <div
              className={`rounded-xl px-3 py-2.5 ${
                rtlUrgency === "danger"
                  ? "bg-red-500/20"
                  : rtlUrgency === "caution"
                    ? "bg-amber-500/15"
                    : "bg-white/5"
              }`}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <PlaneLanding
                  className={`h-3.5 w-3.5 ${rtlUrgency === "danger" ? "text-red-400" : "text-white/35"}`}
                />
                <span className="text-[10px] font-semibold text-white/40">RTL 복귀</span>
              </div>
              <p
                className={`font-mono text-sm font-bold tabular-nums ${
                  rtlSafeMinutes === null
                    ? "text-white/25"
                    : rtlUrgency === "danger"
                      ? "text-red-400"
                      : rtlUrgency === "caution"
                        ? "text-amber-400"
                        : "text-sky-300"
                }`}
              >
                {rtlSafeMinutes === null ? "계산 중" : fmtMin(rtlSafeMinutes)}
              </p>
              <p className="mt-1 text-[9px] text-white/25">귀환 권장 시점</p>
            </div>
          </div>

          {/* 경고 배너 */}
          {battery <= 20 && (
            <div className="mx-4 mb-3 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-2.5">
              <AlertOctagon className="h-4 w-4 shrink-0 animate-pulse text-red-400" />
              <span className="text-xs font-bold text-red-300">즉시 RTL — 배터리 위험</span>
            </div>
          )}
          {battery > 20 && battery <= 35 && (
            <div className="mx-4 mb-3 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="text-xs font-semibold text-amber-300">귀환 준비 — 복귀 경로 확인</span>
            </div>
          )}
          {rtlUrgency === "caution" && battery > 35 && (
            <div className="mx-4 mb-3 flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
              <Clock className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="text-xs font-semibold text-amber-300">5분 내 귀환 시작 권장</span>
            </div>
          )}

          {/* 신뢰도 바 */}
          <div className="border-t border-white/5 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/25">데이터 신뢰도</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-4 rounded-full transition-all ${
                      i < Math.ceil((sampleCount / 24) * 5)
                        ? confidence === "high"
                          ? "bg-emerald-500"
                          : confidence === "medium"
                            ? "bg-amber-500"
                            : "bg-white/30"
                        : "bg-white/10"
                    }`}
                  />
                ))}
                <span className="ml-1.5 text-[10px] text-white/25">{sampleCount}개</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 토글 버튼 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-full border ${borderColor} bg-slate-900/90 px-3.5 py-2 text-xs font-semibold text-white/80 shadow-lg shadow-black/40 backdrop-blur-md transition-all hover:scale-[1.03] hover:bg-slate-800/90 active:scale-[0.97]`}
        >
          <Battery className={`h-4 w-4 ${getBatteryColor(battery)}`} />
          <span>배터리 예측</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badgeBg}`}>
            {battery.toFixed(0)}%
          </span>
          {remainingMinutes !== null && (
            <span className="text-[11px] text-white/45">
              {remainingMinutes <= 0 ? "⚠ 즉시RTL" : `~${Math.floor(remainingMinutes)}분`}
            </span>
          )}
          <span className="ml-0.5 text-[9px] text-white/25">{open ? "▲" : "▼"}</span>
        </button>
      </div>
    </div>
  )
}

// ── 상단 안전 배너 ─────────────────────────────────────────
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
        <span className="font-semibold">드론 미연결 — 연결 후 안전 상태가 표시됩니다</span>
      </div>
    )
  }

  const bannerStyle =
    overall === "danger"
      ? "border-red-500/50 bg-red-950/80"
      : overall === "caution"
        ? "border-amber-500/50 bg-amber-950/80"
        : "border-emerald-500/50 bg-emerald-950/80"

  const Icon = overall === "danger" ? ShieldAlert : overall === "caution" ? AlertTriangle : CheckCircle
  const overallLabel = overall === "danger" ? "위험" : overall === "caution" ? "주의" : "정상"

  const chip = (lvl: SafetyLevel) =>
    lvl === "danger"
      ? "bg-red-500/20 text-red-300"
      : lvl === "caution"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-emerald-500/20 text-emerald-300"

  return (
    <div className={`rounded-xl border shadow-lg backdrop-blur-md transition-all ${bannerStyle}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-2 text-left"
      >
        <Icon className={`h-4 w-4 shrink-0 ${levelText[overall]}`} />
        <span className={`text-xs font-bold ${levelText[overall]}`}>비행 안전 {overallLabel}</span>
        <div className="ml-1 flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item.label}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip(item.level)}`}
            >
              {item.label}
            </span>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-white/30">{expanded ? "▲ 닫기" : "▼ 상세"}</span>
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

// ── 비행 시간 / 속도 미니 카드 ─────────────────────────────
function FlightStatusMiniCard({ speed }: { speed?: number }) {
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
      if (startRef.current) setFlightSec(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [speed])

  const isFlying = (speed ?? 0) > 1
  const mm = Math.floor(flightSec / 60)
  const ss = flightSec % 60

  return (
    <div className="flex gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md">
        <Clock className={`h-3.5 w-3.5 ${isFlying ? "text-emerald-400" : "text-slate-500"}`} />
        <div className="flex flex-col leading-tight">
          <span className="text-[9px] text-white/30">비행 시간</span>
          <span
            className={`font-mono font-bold tabular-nums ${isFlying ? "text-emerald-300" : "text-slate-500"}`}
          >
            {isFlying ? `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : "--:--"}
          </span>
        </div>
      </div>
      {speed != null && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md">
          <TrendingDown className={`h-3.5 w-3.5 ${getSpeedColor(speed)}`} />
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] text-white/30">속도</span>
            <span className={`font-mono font-bold tabular-nums ${getSpeedColor(speed)}`}>
              {speed.toFixed(1)}
              <span className="text-[9px] font-normal"> m/s</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 미션 ───────────────────────────────────────────────────
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

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function totalDistance(wps: Array<{ lat: number; lng: number }>): number {
  let d = 0
  for (let i = 1; i < wps.length; i++) d += haversineM(wps[i - 1].lat, wps[i - 1].lng, wps[i].lat, wps[i].lng)
  return d
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
    <div className="w-full overflow-hidden rounded-2xl border border-blue-500/40 bg-slate-900/90 shadow-2xl backdrop-blur-md">
      {/* 헤더: 버튼 안에 버튼을 넣지 않도록 형제로 분리 */}
      <div className="flex w-full items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left transition hover:opacity-80"
        >
          <Route className="h-4 w-4 shrink-0 text-blue-400" />
          <span className="flex-1 text-xs font-bold text-blue-300">미션 플랜</span>
          <span className="text-[9px] text-white/25">{collapsed ? "▼" : "▲"}</span>
        </button>
        <button
          type="button"
          onClick={onClear}
          className="ml-2 rounded-md p-1 text-white/30 transition hover:bg-red-500/20 hover:text-red-400"
          title="미션 초기화"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="grid grid-cols-3 border-b border-white/5">
            <div className="flex flex-col items-center px-2 py-3">
              <p className="text-base font-bold tabular-nums text-blue-300">{plan.waypoints.length}</p>
              <p className="mt-0.5 text-[10px] text-white/30">웨이포인트</p>
            </div>
            <div className="flex flex-col items-center border-x border-white/5 px-2 py-3">
              <p className="text-base font-bold tabular-nums text-sky-300">{distKm}</p>
              <p className="mt-0.5 text-[10px] text-white/30">거리(km)</p>
            </div>
            <div className="flex flex-col items-center px-2 py-3">
              <p className="text-base font-bold tabular-nums text-emerald-300">
                {currentWpIndex >= 0 ? `${currentWpIndex + 1}` : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-white/30">현재 WP</p>
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto">
            {plan.waypoints.map((wp, i) => {
              const isActive = i === currentWpIndex
              const isDone = currentWpIndex >= 0 && i < currentWpIndex
              const isStart = wp.command === 22
              const isLand = wp.command === 21 || wp.command === 20
              return (
                <div
                  key={wp.index}
                  className={`flex items-center gap-2.5 px-4 py-2 text-xs ${
                    isActive ? "bg-blue-500/20 text-blue-300" : isDone ? "text-white/25" : "text-white/55"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
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
                  <span className="flex-1 font-medium">{commandLabel(wp.command)}</span>
                  <span className="text-[11px] tabular-nums text-white/35">{wp.alt.toFixed(0)}m</span>
                  {isActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />}
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
  onMapClick,
  flightPath,
  dronePosition,
  droneStats,
  missionWaypoints,
}: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const currentMarker = useRef<any>(null)
  const droneMarkerRef = useRef<any>(null)
  const flightPathPolylineRef = useRef<any>(null)
  const flightPathFittedRef = useRef(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  // 지도 클릭 리스너는 최초 1회 등록 → 최신 콜백/상태는 ref 로 참조
  const onMapClickRef = useRef(onMapClick)
  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  const [mapReady, setMapReady] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [clickedInfo, setClickedInfo] = useState<{ lat: number; lng: number; address: string } | null>(null)
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [isAddressExpanded, setIsAddressExpanded] = useState(false)
  const [isTrackingDrone, setIsTrackingDrone] = useState(true)
  const isTrackingRef = useRef(true)
  const [isDroneConnected, setIsDroneConnected] = useState(false)
  const [satellites, setSatellites] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── 기상 state (드론용 / 클릭용 분리) ──────────────────────
  const [droneWeather, setDroneWeather] = useState<Wx | null>(null)
  const [clickedWeather, setClickedWeather] = useState<Wx | null>(null)
  const [droneCell, setDroneCell] = useState<{ lat: number; lng: number } | null>(null)
  const clickReqRef = useRef(0)

  // ── 미션 플랜 상태 ─────────────────────────────────────────
  const [missionPlan, setMissionPlan] = useState<MissionPlan | null>(null)
  const [currentWpIndex, setCurrentWpIndex] = useState(-1)
  const missionPolylineRef = useRef<any>(null)
  const missionDoneLineRef = useRef<any>(null)
  const missionMarkersRef = useRef<any[]>([])

  const { overall: safetyOverall, items: safetyItems } = calcSafety(
    droneStats,
    isDroneConnected ? satellites : null,
    isDroneConnected ? droneWeather : null,
  )

  const batteryPrediction = useBatteryPrediction(droneStats?.battery, isDroneConnected)

  // ── 기상: 드론 격자 갱신 헬퍼 (격자가 바뀔 때만 state 변경) ──
  const updateDroneCell = (la: number, lo: number) =>
    setDroneCell((prev) => {
      const c = { lat: snapWx(la), lng: snapWx(lo) }
      return prev && prev.lat === c.lat && prev.lng === c.lng ? prev : c
    })

  // ── 기상: 드론 위치 날씨 (격자 변경 시 + 30분마다, 탭 복귀 시) ──
  useEffect(() => {
    if (!droneCell) {
      setDroneWeather(null)
      return
    }
    let cancelled = false
    const load = async () => {
      if (document.hidden) return
      const w = await fetchWeatherAt(droneCell.lat, droneCell.lng).catch(() => null)
      if (!cancelled && w) setDroneWeather(w) // 실패 시 이전 값 유지
    }
    load()
    const id = setInterval(load, WX_REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [droneCell])

  // ── 기상: 클릭/검색 위치 날씨 (마지막 요청 결과만 반영) ──────
  const loadClickedWeather = async (la: number, lo: number) => {
    const id = ++clickReqRef.current
    const w = await fetchWeatherAt(la, lo).catch(() => null)
    if (id === clickReqRef.current) setClickedWeather(w)
  }

  // ── 추적 상태 ref 동기화 + 추적 켤 때 즉시 드론으로 이동 ────
  useEffect(() => {
    isTrackingRef.current = isTrackingDrone
    if (isTrackingDrone && droneMarkerRef.current && mapInstance.current) {
      mapInstance.current.setCenter(droneMarkerRef.current.getPosition())
    }
  }, [isTrackingDrone])

  // ── 미션: prop 수신 ────────────────────────────────────────
  useEffect(() => {
    if (!missionWaypoints || missionWaypoints.length === 0) {
      setMissionPlan(null)
      setCurrentWpIndex(-1)
      return
    }
    const prev = missionPlan?.waypoints
    const same =
      prev &&
      prev.length === missionWaypoints.length &&
      prev.every((wp, i) => wp.lat === missionWaypoints[i].lat && wp.lng === missionWaypoints[i].lng)
    if (same) return
    setMissionPlan({ waypoints: missionWaypoints, totalDistanceM: totalDistance(missionWaypoints) })
    setCurrentWpIndex(-1)
    console.log(`[NaverMap] 미션 수신: ${missionWaypoints.length}개 웨이포인트`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionWaypoints])

  // ── 미션: 이벤트 수신 ──────────────────────────────────────
  useEffect(() => {
    const onMissionUpdate = (e: Event) => {
      const waypoints = (e as CustomEvent).detail?.waypoints
      if (!waypoints?.length) return
      setMissionPlan({ waypoints, totalDistanceM: totalDistance(waypoints) })
      setCurrentWpIndex(-1)
    }
    window.addEventListener("missionUpdate", onMissionUpdate)
    return () => window.removeEventListener("missionUpdate", onMissionUpdate)
  }, [])

  // ── 위성 수 이벤트 ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent).detail?.satellites
      if (v !== undefined) setSatellites(v)
    }
    window.addEventListener("droneSatelliteUpdate", handler)
    return () => window.removeEventListener("droneSatelliteUpdate", handler)
  }, [])

  // ── 전체화면 ───────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
      if (mapInstance.current) {
        setTimeout(() => {
          const naver = (window as any).naver
          if (naver && mapInstance.current) naver.maps.Event.trigger(mapInstance.current, "resize")
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
      if (!document.fullscreenElement) await mapContainerRef.current.requestFullscreen?.()
      else await document.exitFullscreen?.()
    } catch (e) {
      console.error("전체화면 오류:", e)
    }
  }

  // ── 마커 ───────────────────────────────────────────────────
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
      droneMarkerRef.current = new naver.maps.Marker({ position: pos, map: mapInstance.current, icon, zIndex: 1000 })
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

  // ── 장소 검색 ──────────────────────────────────────────────
  const handleSearch = async () => {
    if (!mapInstance.current || !searchQuery.trim()) return
    try {
      const res = await fetch(buildApiUrl(`/naver/search-place?query=${encodeURIComponent(searchQuery)}`))
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
      setClickedInfo({ lat: la, lng: lo, address: place.roadAddress || place.address })
      setShowInfoPanel(true)
      setSearchQuery("")
      const { nx, ny } = convertGRID_GPS("toXY", la, lo)
      onMapClickRef.current?.(nx, ny)
      loadClickedWeather(la, lo)
    } catch (err) {
      console.error(err)
    }
  }

  // ── 지도 클릭 (최초 1회 등록되므로 ref·setter 만 사용) ──────
  const handleMapClick = (e: any) => {
    const la = e.coord.lat()
    const lo = e.coord.lng()
    addMarker(la, lo)
    const { nx, ny } = convertGRID_GPS("toXY", la, lo)
    onMapClickRef.current?.(nx, ny)
    loadClickedWeather(la, lo)
    const naver = (window as any).naver
    naver.maps.Service.reverseGeocode(
      { coords: new naver.maps.LatLng(la, lo), orders: "roadaddr,addr" },
      (status: any, response: any) => {
        if (status === naver.maps.Service.Status.OK) {
          setClickedInfo({
            lat: la,
            lng: lo,
            address: response.v2.address.roadAddress || response.v2.address.jibunAddress,
          })
          setShowInfoPanel(true)
          setIsAddressExpanded(false)
        }
      },
    )
  }

  // ── 지도 초기화: 최초 1회만 ────────────────────────────────
  useEffect(() => {
    let disposed = false
    let script = document.getElementById(NAVER_SCRIPT_ID) as HTMLScriptElement | null

    const initMap = () => {
      const naver = (window as any).naver
      if (disposed || mapInstance.current || !mapRef.current || !naver?.maps) return
      mapInstance.current = new naver.maps.Map(mapRef.current, {
        center: new naver.maps.LatLng(lat ?? DEFAULT_LAT, lng ?? DEFAULT_LNG),
        zoom: 15,
      })
      naver.maps.Event.addListener(mapInstance.current, "click", handleMapClick)
      setMapReady(true)
    }

    if ((window as any).naver?.maps) {
      initMap()
    } else {
      // 스크립트가 이미 있지만 아직 로딩 중인 경우도 load 이벤트로 처리
      if (!script) {
        script = document.createElement("script")
        script.id = NAVER_SCRIPT_ID
        script.src = NAVER_SCRIPT_SRC
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener("load", initMap)
    }

    const onResize = () => {
      const naver = (window as any).naver
      if (naver && mapInstance.current) naver.maps.Event.trigger(mapInstance.current, "resize")
    }
    window.addEventListener("resize", onResize)

    return () => {
      disposed = true
      script?.removeEventListener("load", initMap)
      window.removeEventListener("resize", onResize)
      mapInstance.current?.destroy?.()
      mapInstance.current = null
      currentMarker.current = null
      droneMarkerRef.current = null
      flightPathPolylineRef.current = null
      missionPolylineRef.current = null
      missionDoneLineRef.current = null
      missionMarkersRef.current = []
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── lat/lng prop 이 바뀌면 중심만 이동 (드론 추적 중이면 추적 우선) ──
  useEffect(() => {
    if (!mapReady || lat == null || lng == null) return
    if (droneMarkerRef.current && isTrackingRef.current) return
    const naver = (window as any).naver
    mapInstance.current?.setCenter(new naver.maps.LatLng(lat, lng))
  }, [lat, lng, mapReady])

  // ── 드론 위치: 이벤트 경로 (리스너는 1회 등록) ──────────────
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {}
      const la = Number(d.lat)
      const lo = Number(d.lng)
      if (!la || !lo || !Number.isFinite(la) || !Number.isFinite(lo) || !mapInstance.current) return
      updateDroneMarker(la, lo, d.yaw)
      setIsDroneConnected(true)
      if (d.satellites !== undefined) setSatellites(d.satellites)
      if (isTrackingRef.current) {
        mapInstance.current.setCenter(new (window as any).naver.maps.LatLng(la, lo))
      }
      updateDroneCell(la, lo)
    }
    const onDisconnect = () => {
      removeDroneMarker()
      setIsDroneConnected(false)
      setSatellites(null)
      setDroneCell(null)
    }
    window.addEventListener("dronePositionUpdate", onUpdate)
    window.addEventListener("droneDisconnected", onDisconnect)
    return () => {
      window.removeEventListener("dronePositionUpdate", onUpdate)
      window.removeEventListener("droneDisconnected", onDisconnect)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 드론 위치: prop 경로 ───────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    if (!dronePosition) {
      removeDroneMarker()
      setIsDroneConnected(false)
      setDroneCell(null)
      return
    }
    const { lat: la, lng: lo, yaw, satellites: sats } = dronePosition
    if (typeof la !== "number" || typeof lo !== "number") {
      removeDroneMarker()
      setIsDroneConnected(false)
      setDroneCell(null)
      return
    }
    updateDroneMarker(la, lo, yaw)
    setIsDroneConnected(true)
    if (sats !== undefined) setSatellites(sats)
    if (isTrackingRef.current) {
      mapInstance.current.setCenter(new (window as any).naver.maps.LatLng(la, lo))
    }
    updateDroneCell(la, lo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dronePosition, mapReady])

  // ── 비행 경로: 그리기 + 처음 한 번만 fitBounds ──────────────
  useEffect(() => {
    if (!mapReady) return
    flightPathPolylineRef.current?.setMap(null)
    flightPathPolylineRef.current = null

    if (!flightPath?.length) {
      flightPathFittedRef.current = false
      return
    }
    const naver = (window as any).naver
    const path = flightPath.map((p) => new naver.maps.LatLng(p.lat, p.lng))
    flightPathPolylineRef.current = new naver.maps.Polyline({
      map: mapInstance.current,
      path,
      strokeColor: "#10B981",
      strokeWeight: 3,
      strokeOpacity: 0.8,
      zIndex: 200,
    })

    const liveTracking = !!droneMarkerRef.current && isTrackingRef.current
    if (!flightPathFittedRef.current && !liveTracking) {
      const bounds = new naver.maps.LatLngBounds(path[0], path[0])
      path.forEach((pt: any) => bounds.extend(pt))
      mapInstance.current.fitBounds(bounds, { padding: 50 })
      flightPathFittedRef.current = true
    }
  }, [flightPath, mapReady])

  // ── 미션: 경로·마커 그리기 (진행 상황 변경 시 다시 그림, 화면 이동 없음) ──
  useEffect(() => {
    const naver = (window as any).naver
    if (!mapReady || !naver || !mapInstance.current) return

    missionPolylineRef.current?.setMap(null)
    missionDoneLineRef.current?.setMap(null)
    missionMarkersRef.current.forEach((m) => m.setMap(null))
    missionPolylineRef.current = null
    missionDoneLineRef.current = null
    missionMarkersRef.current = []

    if (!missionPlan?.waypoints.length) return

    const wps = missionPlan.waypoints
    const allLatLngs = wps.map((wp) => new naver.maps.LatLng(wp.lat, wp.lng))

    missionPolylineRef.current = new naver.maps.Polyline({
      map: mapInstance.current,
      path: allLatLngs,
      strokeColor: "#3b82f6",
      strokeWeight: 3,
      strokeOpacity: 0.85,
      zIndex: 250,
    })

    if (currentWpIndex > 0) {
      missionDoneLineRef.current = new naver.maps.Polyline({
        map: mapInstance.current,
        path: allLatLngs.slice(0, currentWpIndex + 1),
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
      const bgColor = isActive ? "#3b82f6" : isDone ? "#ffffff40" : isStart ? "#22c55e" : isLand ? "#f59e0b" : "#1e40af"
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
  }, [missionPlan, currentWpIndex, mapReady])

  // ── 미션: 새 미션을 받았을 때만 전체 경로로 화면 맞춤 ──────
  useEffect(() => {
    const naver = (window as any).naver
    if (!mapReady || !naver || !missionPlan?.waypoints.length) return
    if (droneMarkerRef.current && isTrackingRef.current) return // 드론 추적 중이면 화면 유지
    const lls = missionPlan.waypoints.map((wp) => new naver.maps.LatLng(wp.lat, wp.lng))
    const bounds = new naver.maps.LatLngBounds(lls[0], lls[0])
    lls.forEach((ll: any) => bounds.extend(ll))
    mapInstance.current.fitBounds(bounds, { padding: 60 })
  }, [missionPlan, mapReady])

  // ── 미션: 현재 웨이포인트 추정 (30m 이내 최근접) ────────────
  useEffect(() => {
    if (!missionPlan || !dronePosition) return
    const { lat: dLat, lng: dLng } = dronePosition
    if (typeof dLat !== "number" || typeof dLng !== "number") return
    let minDist = Infinity
    let closestIdx = -1
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
      <div className={`absolute left-3 right-3 z-50 ${isDroneConnected ? "top-3" : "top-14"}`}>
        <SafetyBanner overall={safetyOverall} items={safetyItems} connected={isDroneConnected} />
      </div>

      {/* ── 팝오버 1: 비행 정보 */}
      <PopoverPanel
        icon={<Battery className="h-4 w-4" />}
        label="비행 정보"
        badge={droneStats?.battery != null ? `${Math.round(droneStats.battery)}%` : undefined}
        badgeLevel={safetyOverall}
        initialPos={{ x: 12, y: isDroneConnected ? 116 : 64 }}
        defaultOpen={isDroneConnected}
      >
        {isDroneConnected && droneStats ? (
          <div>
            {droneStats.armed != null && (
              <div
                className={`border-white/8 flex items-center gap-2 border-b px-3 py-2 text-[10px] font-bold ${droneStats.armed ? "text-emerald-400" : "text-slate-500"}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${droneStats.armed ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`}
                />
                {droneStats.armed ? "ARMED" : "DISARMED"}
              </div>
            )}
            <div className="divide-y divide-white/5">
              {droneStats.battery != null && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <Battery className={`h-3.5 w-3.5 shrink-0 ${getBatteryColor(droneStats.battery)}`} />
                  <span className="flex-1 text-[11px] font-medium text-white/40">배터리</span>
                  <span className={`font-mono text-sm font-bold tabular-nums ${getBatteryColor(droneStats.battery)}`}>
                    {droneStats.battery.toFixed(0)}%
                  </span>
                  {droneStats.battery <= 20 && <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />}
                </div>
              )}
              {droneStats.altitude != null && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <ArrowUp className={`h-3.5 w-3.5 shrink-0 ${getAltitudeColor(droneStats.altitude)}`} />
                  <span className="flex-1 text-[11px] font-medium text-white/40">고도</span>
                  <span className={`font-mono text-sm font-bold tabular-nums ${getAltitudeColor(droneStats.altitude)}`}>
                    {droneStats.altitude.toFixed(0)}m
                  </span>
                  {droneStats.altitude > 150 && <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />}
                </div>
              )}
              {droneStats.speed != null && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <Gauge className={`h-3.5 w-3.5 shrink-0 ${getSpeedColor(droneStats.speed)}`} />
                  <span className="flex-1 text-[11px] font-medium text-white/40">속도</span>
                  <span className={`font-mono text-sm font-bold tabular-nums ${getSpeedColor(droneStats.speed)}`}>
                    {droneStats.speed.toFixed(1)}m/s
                  </span>
                </div>
              )}
              {satellites != null && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <Satellite className={`h-3.5 w-3.5 shrink-0 ${getSatColor(satellites)}`} />
                  <span className="flex-1 text-[11px] font-medium text-white/40">GNSS</span>
                  <span className={`font-mono text-sm font-bold tabular-nums ${getSatColor(satellites)}`}>
                    {satellites}위성
                  </span>
                </div>
              )}
              {droneWeather && (
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <Wind
                    className={`h-3.5 w-3.5 shrink-0 ${levelText[windLevel(droneWeather.windSpeed, droneWeather.windGust)]}`}
                  />
                  <span className="flex-1 text-[11px] font-medium text-white/40">풍속</span>
                  <span
                    className={`font-mono text-sm font-bold tabular-nums ${levelText[windLevel(droneWeather.windSpeed, droneWeather.windGust)]}`}
                  >
                    {droneWeather.windSpeed.toFixed(1)}m/s
                  </span>
                </div>
              )}
            </div>
            {droneStats.battery != null && droneStats.battery <= 20 && (
              <div className="mx-3 mb-2 mt-1 flex items-center gap-2 rounded-lg bg-red-500/15 px-2.5 py-2">
                <PlaneLanding className="h-3.5 w-3.5 shrink-0 animate-pulse text-red-400" />
                <span className="text-[10px] font-semibold text-red-300">즉시 RTL — 배터리 위험</span>
              </div>
            )}
            {droneStats.altitude != null && droneStats.altitude > 150 && (
              <div className="mx-3 mb-2 mt-1 flex items-center gap-2 rounded-lg bg-red-500/15 px-2.5 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 animate-pulse text-red-400" />
                <span className="text-[10px] font-semibold text-red-300">고도 한도 초과 — 즉시 하강</span>
              </div>
            )}
            {droneWeather && (
              <div className="border-white/8 border-t px-3 py-2.5">
                <WeatherTriplet w={droneWeather} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 px-3 py-3">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-white/30">비행 전 체크리스트</p>
            {[
              "배터리 셀 체크 확인",
              "조종기 / 기체 전원 확인",
              "QGC LTE 연결 / P900 연결 확인",
              "GPS 신호 확인 (25위성+)",
              "미션 플랜 경로 일치 확인",
              "수평 캘리브레이션 확인",
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
              기체 연결 시 실시간 정보로 전환됩니다.
            </p>
          </div>
        )}
      </PopoverPanel>

      {/* ── 팝오버 2: 미션 플랜 */}
      {missionPlan && (
        <PopoverPanel
          icon={<Route className="h-4 w-4 text-blue-400" />}
          label="미션 플랜"
          badge={`${missionPlan.waypoints.length}WP`}
          badgeLevel="safe"
          initialPos={{ x: 12, y: isDroneConnected ? 178 : 126 }}
          defaultOpen
        >
          <MissionInfoCard plan={missionPlan} onClear={clearMission} currentWpIndex={currentWpIndex} />
        </PopoverPanel>
      )}

      {/* ── 우측 상단: 배터리 예측 패널 (기체 연결 시에만) */}
      <BatteryPredictionPanel
        battery={droneStats?.battery}
        prediction={batteryPrediction}
        connected={isDroneConnected}
      />

      {/* ── 좌하단: 추적 버튼 + 비행 시간 */}
      {isDroneConnected && (
        <div className="absolute bottom-4 left-3 z-50 flex flex-col items-start gap-2">
          <button
            onClick={() => setIsTrackingDrone((v) => !v)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 ${isTrackingDrone ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-600/80 backdrop-blur-sm hover:bg-slate-700"}`}
          >
            {isTrackingDrone ? <Navigation className="h-4 w-4" /> : <NavigationOff className="h-4 w-4" />}
            {isTrackingDrone ? "추적 중" : "추적 해제"}
          </button>
          <FlightStatusMiniCard speed={droneStats?.speed} />
        </div>
      )}

      {/* 전체화면 버튼 */}
      <button
        onClick={toggleFullscreen}
        className="absolute bottom-4 z-[60] flex items-center justify-center rounded-full bg-blue-600 p-3 text-white shadow-lg transition-all hover:scale-110 hover:bg-blue-700"
        style={{ right: "12px" }}
        title={isFullscreen ? "전체화면 종료" : "전체화면"}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
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
                  clickReqRef.current++ // 진행 중인 클릭 날씨 요청 결과 무시
                  setClickedWeather(null) // 드론 날씨(droneWeather)는 건드리지 않음
                }}
                className="rounded-lg p-1 text-white/30 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-white/40">위도</span>
                  <p className="font-mono text-sm font-semibold text-sky-300">{clickedInfo.lat.toFixed(6)}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-white/40">경도</span>
                  <p className="font-mono text-sm font-semibold text-sky-300">{clickedInfo.lng.toFixed(6)}</p>
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-white/40">주소</span>
                <div className="mt-0.5 flex items-start gap-1">
                  <p className={`text-sm text-white/90 ${isAddressExpanded ? "" : "line-clamp-1"}`}>
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
              {clickedWeather && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <span className="text-[10px] uppercase tracking-wide text-white/40">기상 정보</span>
                  <div className="mt-1.5">
                    <WeatherTriplet w={clickedWeather} large />
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