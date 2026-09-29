import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Cloud, Wind, Eye, CloudRain, MapPin, ChevronDown, AlertTriangle,
  Activity, ArrowUp, Sun, CloudSun, Cloudy, CloudSnow, CloudLightning, Waves, Clock,
} from "lucide-react"
import type { PreflightWeather } from "@/components/Dashboard/PreflightRiskCard"

/* =============================================================
 * WeatherInfoCard — Open-Meteo 단일 소스 (무료, 키 불필요, 위경도 직접 조회)
 * -------------------------------------------------------------
 *  - 시간별 예보 6시간: 풍속·돌풍·강수·강수확률·기온·뇌우(weather_code)·시정
 *  - Marine API 파고(해상 좌표일 때)
 *  - NOAA Kp 지수 (기존 유지)
 *  - onWeatherChange: "비행 시간 창" 안의 최악값을 부모(복합 위험 점수)로 전달
 *    → 지금 값이 아니라 비행 중 예상 최악 조건으로 판정
 *  ※ 수치예보 모델(ECMWF 등) 기반 — 국지 실황과 차이 가능. 화면에 표기.
 *  ※ 기존 기상청 초단기실황 버전은 WeatherInfoCard_KMA_backup.tsx 로 보관.
 * ============================================================= */

export interface WeatherLocation {
  lat: number
  lng: number
  label?: string
}

interface HourRow {
  time: string
  hour: string
  temp: number
  wind: number        // m/s
  gust: number        // m/s
  precip: number      // mm
  precipProb: number  // %
  code: number        // WMO weather code
  visibility: number  // km
  wave: number | null // m
}

interface WeatherView {
  current: HourRow
  hours: HourRow[]
  kpIndex: number | null
  lastUpdate: string
}

interface Region extends WeatherLocation { id: string; description: string }
const REGIONS: Region[] = [
  { id: "wonsan", label: "원산도", description: "충남 보령시 오천면", lat: 36.3695, lng: 126.4248 },
  { id: "taean", label: "태안", description: "충청남도 태안군", lat: 36.7456, lng: 126.2979 },
  { id: "seosan", label: "서산", description: "충청남도 서산시", lat: 36.7849, lng: 126.4503 },
  { id: "seoul", label: "서울", description: "서울특별시", lat: 37.5665, lng: 126.978 },
  { id: "daejeon", label: "대전", description: "대전광역시", lat: 36.3504, lng: 127.3845 },
  { id: "busan", label: "부산", description: "부산광역시", lat: 35.1796, lng: 129.0756 },
]

const KILL_GUST = 12
const isThunder = (code: number) => code >= 95 && code <= 99

function codeToCondition(code: number): string {
  if (code === 0) return "맑음"
  if (code <= 2) return "구름 조금"
  if (code === 3) return "흐림"
  if (code === 45 || code === 48) return "안개"
  if (code >= 51 && code <= 57) return "이슬비"
  if (code >= 61 && code <= 67) return "비"
  if (code >= 71 && code <= 77) return "눈"
  if (code >= 80 && code <= 82) return "소나기"
  if (code >= 85 && code <= 86) return "눈보라"
  if (isThunder(code)) return "뇌우"
  return "알 수 없음"
}

function conditionIcon(code: number, cls = "h-8 w-8") {
  if (isThunder(code)) return <CloudLightning className={`${cls} text-purple-600`} />
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className={`${cls} text-blue-300`} />
  if (code >= 51) return <CloudRain className={`${cls} text-blue-600`} />
  if (code === 45 || code === 48) return <Cloudy className={`${cls} text-gray-400`} />
  if (code === 3) return <Cloudy className={`${cls} text-gray-500`} />
  if (code >= 1) return <CloudSun className={`${cls} text-gray-400`} />
  return <Sun className={`${cls} text-yellow-400`} />
}

async function fetchKpIndex(): Promise<number | null> {
  try {
    const res = await fetch("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json")
    const data = await res.json()
    return data[data.length - 1]?.kp_index ?? null
  } catch {
    return null
  }
}

async function fetchOpenMeteo(loc: WeatherLocation): Promise<Omit<WeatherView, "kpIndex" | "lastUpdate">> {
  const params = new URLSearchParams({
    latitude: loc.lat.toFixed(4),
    longitude: loc.lng.toFixed(4),
    hourly: "temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code,visibility",
    wind_speed_unit: "ms",
    timezone: "Asia/Seoul",
    forecast_days: "2",
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const d = await res.json()
  const h = d.hourly

  // 파고 (해상 좌표일 때만 값이 옴; 내륙은 오류/NaN → null)
  let waves: (number | null)[] = []
  try {
    const mp = new URLSearchParams({
      latitude: loc.lat.toFixed(4), longitude: loc.lng.toFixed(4),
      hourly: "wave_height", timezone: "Asia/Seoul", forecast_days: "2",
    })
    const mr = await fetch(`https://marine-api.open-meteo.com/v1/marine?${mp}`)
    if (mr.ok) {
      const md = await mr.json()
      waves = (md.hourly?.wave_height ?? []) as (number | null)[]
    }
  } catch { /* 내륙 등 — 파고 없음 */ }

  // 현재 시각이 속한 시간 슬롯부터 6개
  const now = Date.now()
  const times: string[] = h.time
  let idx = times.findIndex((t) => new Date(t).getTime() > now - 3600_000)
  if (idx < 0) idx = 0

  const rows: HourRow[] = []
  for (let i = idx; i < Math.min(idx + 6, times.length); i++) {
    const t = new Date(times[i])
    rows.push({
      time: times[i],
      hour: `${t.getHours()}시`,
      temp: h.temperature_2m[i],
      wind: h.wind_speed_10m[i],
      gust: h.wind_gusts_10m[i],
      precip: h.precipitation[i] ?? 0,
      precipProb: h.precipitation_probability?.[i] ?? 0,
      code: h.weather_code[i],
      visibility: (h.visibility?.[i] ?? 10000) / 1000,
      wave: typeof waves[i] === "number" && Number.isFinite(waves[i]) ? (waves[i] as number) : null,
    })
  }
  return { current: rows[0], hours: rows }
}

interface WeatherInfoCardProps {
  /** 조회 좌표 (지도 클릭 위치 또는 드론 위치). 없으면 지역 드롭다운 */
  location?: WeatherLocation | null
  /** 비행 시간 창(시간) — 이 안의 최악값을 복합 위험 점수로 전달. 기본 1 */
  flightWindowHours?: number
  onWeatherChange?: (w: PreflightWeather) => void
}

export function WeatherInfoCard({ location, flightWindowHours = 1, onWeatherChange }: WeatherInfoCardProps) {
  const [selectedRegion, setSelectedRegion] = useState<Region>(REGIONS[0])
  const [showDropdown, setShowDropdown] = useState(false)
  const [view, setView] = useState<WeatherView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [windowH, setWindowH] = useState(flightWindowHours)

  const target: WeatherLocation = location ?? selectedRegion

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [om, kp] = await Promise.all([fetchOpenMeteo(target), fetchKpIndex()])
        if (cancelled) return
        setError(null)
        setView({
          ...om, kpIndex: kp,
          lastUpdate: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
        })
      } catch (e) {
        if (cancelled) return
        console.error("Open-Meteo 불러오기 실패:", e)
        setError("기상 데이터를 불러오지 못했습니다")
        setView(null)
        onWeatherChange?.({})
      }
    }
    load()
    const id = setInterval(load, 10 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.lat, target.lng])

  // 비행 시간 창 내 최악값
  const worst = useMemo(() => {
    if (!view) return null
    const rows = view.hours.slice(0, Math.max(1, Math.min(6, windowH + 1)))
    return {
      wind: Math.max(...rows.map((r) => r.wind)),
      gust: Math.max(...rows.map((r) => r.gust)),
      precip: Math.max(...rows.map((r) => r.precip)),
      precipProb: Math.max(...rows.map((r) => r.precipProb)),
      thunder: rows.some((r) => isThunder(r.code)),
      temp: view.current.temp,
      wave: rows.some((r) => r.wave !== null) ? Math.max(...rows.map((r) => r.wave ?? 0)) : null,
    }
  }, [view, windowH])

  useEffect(() => {
    if (!worst) return
    onWeatherChange?.({
      windSpeed: worst.wind,
      windGust: worst.gust,
      temperature: worst.temp,
      precipitation: worst.precip,
      precipitationProbability: worst.precipProb,
      lightning: worst.thunder,
      waveHeight: worst.wave,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worst])

  const safety: "safe" | "caution" | "danger" = !worst
    ? "safe"
    : worst.thunder || worst.precip > 0 || worst.gust > KILL_GUST || worst.wind > 8
      ? "danger"
      : worst.wind > 5 || worst.precipProb >= 50
        ? "caution"
        : "safe"
  const safetyMsg = !worst
    ? ""
    : worst.thunder ? "비행 시간 내 뇌우 예보 — 비행 금지"
    : worst.precip > 0 ? "비행 시간 내 강수 예보 — 비행 금지"
    : worst.gust > KILL_GUST ? `돌풍 ${worst.gust.toFixed(1)} m/s 예보 — 비행 금지`
    : worst.wind > 8 ? "풍속이 매우 높습니다 — 비행 금지"
    : worst.wind > 5 ? "바람이 조금 강합니다 — 주의"
    : worst.precipProb >= 50 ? `강수 확률 ${worst.precipProb}% — 주의`
    : "비행하기 좋은 조건입니다"
  const safetyColor = safety === "safe" ? "text-green-600" : safety === "caution" ? "text-yellow-600" : "text-red-600"

  useEffect(() => {
    if (safety === "danger") { new Audio("/sounds/warning.mp3").play().catch(() => {}) }
  }, [safety])

  return (
    <Card className="w-full rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.35)] ring-1 ring-white/70 backdrop-blur-xl transition-all duration-300 hover:shadow-lg dark:border-slate-800/60 dark:bg-slate-900/70 dark:ring-slate-800/70">
      <CardHeader className="border-b border-slate-200/60 pb-4 dark:border-slate-800/60">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Cloud className="h-5 w-5" />기상 정보</CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="border-slate-200/70 text-[10px] text-slate-400 dark:border-slate-700/60">Open-Meteo 예보</Badge>
            <Badge variant="outline" className="border-slate-200/70 text-xs dark:border-slate-700/60">{view?.lastUpdate || "--:--:--"}</Badge>
          </div>
        </div>

        <div className="relative mt-2">
          <button
            onClick={() => !location && setShowDropdown(!showDropdown)}
            disabled={!!location}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-white/80 p-2 transition hover:bg-slate-50 dark:border-slate-700/70 dark:bg-slate-900/70"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              <div className="text-left">
                <div className="font-medium">{location ? (location.label ?? "선택 위치") : selectedRegion.label}</div>
                <div className="text-xs text-gray-500">{target.lat.toFixed(4)}, {target.lng.toFixed(4)}{!location && ` · ${selectedRegion.description}`}</div>
              </div>
            </div>
            {!location && <ChevronDown className={`h-4 w-4 transition-transform ${showDropdown ? "rotate-180" : ""}`} />}
          </button>
          {showDropdown && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-slate-200/70 bg-white/95 shadow-xl backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/95">
              {REGIONS.map((r) => (
                <button key={r.id} onClick={() => { setSelectedRegion(r); setShowDropdown(false) }} className="flex w-full items-center gap-2 p-2 transition hover:bg-slate-100 dark:hover:bg-slate-800">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <div className="text-left"><div className="font-medium">{r.label}</div><div className="text-xs text-gray-500">{r.description}</div></div>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && <div className="p-3 text-center text-sm text-red-500">{error}</div>}
        {!error && !view && <div className="animate-pulse p-3 text-center text-gray-500">날씨 데이터를 불러오는 중...</div>}
        {view && worst && (
          <>
            <div className={`flex items-center justify-between rounded-2xl p-4 ${safety === "safe" ? "bg-green-50 dark:bg-green-900/20" : safety === "caution" ? "bg-yellow-50 dark:bg-yellow-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
              <div className="flex items-center gap-3">
                {conditionIcon(view.current.code)}
                <div>
                  <div className="text-2xl font-bold">{view.current.temp.toFixed(1)}°C</div>
                  <div className="text-sm text-gray-600">{codeToCondition(view.current.code)} • 강수확률 {view.current.precipProb}%</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-semibold ${safetyColor}`}>{safety === "safe" ? "비행 가능" : safety === "caution" ? "비행 주의" : "비행 금지"}</div>
                <div className="text-xs text-gray-500">비행 창 {windowH}시간 기준</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <Wind className="h-4 w-4 text-green-500" />
                <div><div className="text-xs text-gray-600">풍속 (최대)</div><div className="font-semibold">{worst.wind.toFixed(1)} m/s</div></div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <ArrowUp className={`h-4 w-4 ${worst.gust > KILL_GUST ? "text-red-500" : "text-emerald-500"}`} />
                <div><div className="text-xs text-gray-600">돌풍 (최대)</div><div className={`font-semibold ${worst.gust > KILL_GUST ? "text-red-600" : ""}`}>{worst.gust.toFixed(1)} m/s</div></div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <CloudRain className="h-4 w-4 text-blue-600" />
                <div><div className="text-xs text-gray-600">강수 (최대)</div><div className="font-semibold">{worst.precip.toFixed(1)} mm · {worst.precipProb}%</div></div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <Eye className="h-4 w-4 text-purple-500" />
                <div><div className="text-xs text-gray-600">시정</div><div className="font-semibold">{view.current.visibility.toFixed(0)} km</div></div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <Waves className="h-4 w-4 text-sky-500" />
                <div><div className="text-xs text-gray-600">파고 (최대)</div><div className="font-semibold">{worst.wave !== null ? `${worst.wave.toFixed(1)} m` : "내륙"}</div></div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <Activity className="h-4 w-4 text-red-500" />
                <div><div className="text-xs text-gray-600">자기장 (Kp)</div><div className="font-semibold">{view.kpIndex ?? "--"} <span className="text-xs font-normal text-gray-500">{view.kpIndex == null ? "" : view.kpIndex >= 6 ? "매우 높음" : view.kpIndex >= 4 ? "주의" : "안정"}</span></div></div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Clock className="h-3.5 w-3.5" /> 6시간 예보</span>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  비행 창
                  {[1, 2, 3].map((h) => (
                    <button key={h} type="button" onClick={() => setWindowH(h)}
                      className={`rounded px-1.5 py-0.5 font-semibold ${windowH === h ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
              <table className="w-full text-[11px]">
                <thead className="text-slate-400">
                  <tr><th className="py-1 pl-3 text-left font-medium">시각</th><th className="font-medium">날씨</th><th className="font-medium">풍속</th><th className="font-medium">돌풍</th><th className="font-medium">강수</th><th className="pr-3 font-medium">기온</th></tr>
                </thead>
                <tbody>
                  {view.hours.map((r, i) => {
                    const inWindow = i <= windowH
                    const bad = isThunder(r.code) || r.precip > 0 || r.gust > KILL_GUST
                    return (
                      <tr key={r.time} className={`border-t border-slate-100 dark:border-slate-800 ${inWindow ? "bg-sky-50/60 dark:bg-sky-900/20" : ""} ${bad ? "text-red-600" : "text-slate-700"}`}>
                        <td className="py-1 pl-3 font-semibold">{r.hour}{i === 0 && <span className="ml-1 text-[9px] font-normal text-slate-400">지금</span>}</td>
                        <td className="text-center"><span className="inline-flex items-center gap-1">{conditionIcon(r.code, "h-3.5 w-3.5")}{codeToCondition(r.code)}</span></td>
                        <td className="text-center tabular-nums">{r.wind.toFixed(1)}</td>
                        <td className={`text-center tabular-nums ${r.gust > KILL_GUST ? "font-bold" : ""}`}>{r.gust.toFixed(1)}</td>
                        <td className="text-center tabular-nums">{r.precip > 0 ? `${r.precip.toFixed(1)}mm` : `${r.precipProb}%`}</td>
                        <td className="pr-3 text-right tabular-nums">{r.temp.toFixed(0)}°</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className={`rounded-xl border border-l-4 p-3 ${safety === "danger" ? "border-red-500 bg-red-50 dark:bg-red-900/20" : safety === "caution" ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"}`}>
              <div className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${safetyColor}`} /><span className={`font-medium ${safetyColor}`}>드론 비행 안전도 (비행 창 {windowH}시간)</span></div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{safetyMsg}</p>
            </div>

            {view.kpIndex != null && view.kpIndex >= 5 && (
              <div className="rounded border border-red-200/80 bg-red-100 p-2 text-center text-sm text-red-700">⚠️ 지자기 폭풍 경보: GPS 이상 가능성 있음</div>
            )}
            <p className="text-[10px] text-slate-400">※ 수치예보 모델 기반(Open-Meteo)이며 국지 실황과 차이가 있을 수 있습니다.</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}