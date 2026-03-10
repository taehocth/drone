import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Cloud,
  Droplets,
  Wind,
  Eye,
  CloudRain,
  MapPin,
  ChevronDown,
  AlertTriangle,
  Activity,
  ArrowUp,
  Sun,
  CloudSun,
  Cloudy,
  CloudSnow,
} from "lucide-react"

interface WeatherData {
  temperature: number
  condition: string
  precipitation: string
  humidity: number
  windSpeed: number
  windDirection: string
  visibility: number
  precipitationAmount: number
  pop: number
  safetyLevel: "safe" | "caution" | "danger"
  safetyMessage: string
  lastUpdate: string
  kpIndex?: number | null
  kpTime?: string | null
  windHistory?: number[]
}

interface Region {
  id: string
  name: string
  description: string
  nx: number
  ny: number
}

const REGIONS: Region[] = [
  {
    id: "seosan",
    name: "서산",
    description: "충청남도 서산시",
    nx: 51,
    ny: 110,
  },
  {
    id: "taean",
    name: "태안",
    description: "충청남도 태안군",
    nx: 48,
    ny: 109,
  },
  { id: "seoul", name: "서울", description: "서울특별시", nx: 60, ny: 127 },
  { id: "suwon", name: "수원", description: "경기도 수원시", nx: 60, ny: 121 },
  { id: "daegu", name: "대구", description: "대구광역시", nx: 89, ny: 90 },
  { id: "busan", name: "부산", description: "부산광역시", nx: 98, ny: 76 },
  { id: "daejeon", name: "대전", description: "대전광역시", nx: 67, ny: 100 },
]

// ✅ NOAA Kp Index 가져오기
async function fetchKpIndex() {
  try {
    const res = await fetch(
      "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
    )
    const data = await res.json()
    const latest = data[data.length - 1]
    return { kp: latest.kp_index, time: latest.time_tag }
  } catch (err) {
    console.error("Kp Index 불러오기 실패:", err)
    return { kp: null, time: null }
  }
}

// 환경 변수에서 API URL 가져오기
const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api/v1").replace(
  /\/api\/v1$/,
  "",
)

interface WeatherInfoCardProps {
  clickedCoordinates?: { nx: number; ny: number } | null
}

export function WeatherInfoCard({ clickedCoordinates }: WeatherInfoCardProps) {
  const [selectedRegion, setSelectedRegion] = useState<Region>(REGIONS[2])
  const [showDropdown, setShowDropdown] = useState(false)
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)
  const [windHistory, setWindHistory] = useState<number[]>([])

  const fetchWeather = async (region: Region) => {
    try {
      // ✅ 기상청은 최근 1일 내 데이터만 제공하므로 현재 시각 기준으로 요청
      const now = new Date()
      now.setMinutes(0, 0, 0) // 정각 단위 맞춤
      const base_date = now.toISOString().slice(0, 10).replace(/-/g, "")
      const base_time = now.getHours().toString().padStart(2, "0") + "00"

      const url = `${API_BASE_URL}/api/v1/weather/?nx=${region.nx}&ny=${region.ny}&base_date=${base_date}&base_time=${base_time}`
      const res = await fetch(url)
      if (!res.ok) throw new Error("API 요청 실패")

      const data = await res.json()
      const items = data?.response?.body?.items?.item ?? []

      // ✅ resultCode=10 ("최근 1일만 제공") 처리
      if (data?.response?.header?.resultCode === "10" || items.length === 0) {
        console.warn("⚠️ 기상청 데이터 없음 (최근 1일만 제공)")
        setWeatherData(null)
        return
      }

      let temperature = 0
      let humidity = 0
      let windSpeed = 0
      let windDirection = "북"
      let precipitationAmount = 0
      let sky = 1
      let pty = 0
      let windDegree = 0

      for (const item of items) {
        switch (item.category) {
          case "T1H":
            temperature = parseFloat(item.obsrValue)
            break
          case "REH":
            humidity = parseFloat(item.obsrValue)
            break
          case "WSD":
            windSpeed = parseFloat(item.obsrValue)
            break
          case "VEC":
            windDegree = parseFloat(item.obsrValue)
            const dirs = [
              "북",
              "북동",
              "동",
              "남동",
              "남",
              "남서",
              "서",
              "북서",
            ]
            windDirection = dirs[Math.round(windDegree / 45) % 8]
            break
          case "RN1":
            precipitationAmount = parseFloat(item.obsrValue)
            break
          case "SKY":
            sky = parseInt(item.obsrValue)
            break
          case "PTY":
            pty = parseInt(item.obsrValue)
            break
        }
      }

      const kpData = await fetchKpIndex()

      const condition =
        pty === 1
          ? "비"
          : pty === 2
            ? "비/눈"
            : pty === 3
              ? "눈"
              : sky <= 5
                ? "맑음"
                : sky <= 8
                  ? "구름 많음"
                  : "흐림"

      const safetyLevel =
        precipitationAmount > 0 || windSpeed > 8
          ? "danger"
          : windSpeed > 5
            ? "caution"
            : "safe"

      const safetyMessage =
        precipitationAmount > 0
          ? "비가 오고 있습니다. 비행 금지."
          : windSpeed > 8
            ? "풍속이 매우 높습니다. 비행 금지."
            : windSpeed > 5
              ? "바람이 조금 강합니다. 주의하세요."
              : "비행하기 좋은 날씨입니다."

      setWeatherData({
        temperature,
        humidity,
        windSpeed,
        windDirection,
        visibility: 10,
        precipitationAmount,
        condition,
        precipitation: precipitationAmount > 0 ? "비" : "없음",
        pop: precipitationAmount > 0 ? 60 : 0,
        safetyLevel,
        safetyMessage,
        lastUpdate: new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
        kpIndex: kpData.kp,
        kpTime: kpData.time,
        windHistory,
      })

      setWindHistory((prev) => [...prev.slice(-5), windSpeed])
    } catch (err) {
      console.error("날씨 불러오기 실패:", err)
    }
  }

  // 🚨 위험 시 알림음
  useEffect(() => {
    if (weatherData?.safetyLevel === "danger") {
      const audio = new Audio("/sounds/warning.mp3")
      audio.play().catch(() => {})
    }
  }, [weatherData?.safetyLevel])

  useEffect(() => {
    const target = clickedCoordinates
      ? {
          id: "clicked",
          name: "클릭한 위치",
          description: `격자 (${clickedCoordinates.nx}, ${clickedCoordinates.ny})`,
          nx: clickedCoordinates.nx,
          ny: clickedCoordinates.ny,
        }
      : selectedRegion
    fetchWeather(target)
    const interval = setInterval(() => fetchWeather(target), 1000 * 60 * 10)
    return () => clearInterval(interval)
  }, [selectedRegion, clickedCoordinates])

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case "맑음":
        return <Sun className="h-8 w-8 text-yellow-400" />
      case "구름 많음":
        return <CloudSun className="h-8 w-8 text-gray-400" />
      case "흐림":
        return <Cloudy className="h-8 w-8 text-gray-500" />
      case "비":
        return <CloudRain className="h-8 w-8 text-blue-600" />
      case "눈":
        return <CloudSnow className="h-8 w-8 text-blue-300" />
      default:
        return <Cloud className="h-8 w-8 text-gray-400" />
    }
  }

  const getSafetyColor = () =>
    weatherData?.safetyLevel === "safe"
      ? "text-green-600"
      : weatherData?.safetyLevel === "caution"
        ? "text-yellow-600"
        : "text-red-600"

  return (
    <Card className="w-full rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl ring-1 ring-white/70 transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800/60 dark:bg-slate-900/70 dark:ring-slate-800/70">
      <CardHeader className="border-b border-slate-200/60 pb-4 dark:border-slate-800/60">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            기상 정보
          </CardTitle>
          <Badge variant="outline" className="border-slate-200/70 text-xs dark:border-slate-700/60">
            {weatherData?.lastUpdate || "--:--:--"}
          </Badge>
        </div>

        {/* 지역 선택 드롭다운 */}
        <div className="relative mt-2">
          <button
            onClick={() =>
              !clickedCoordinates && setShowDropdown(!showDropdown)
            }
            disabled={!!clickedCoordinates}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-white/80 p-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-slate-700/70 dark:bg-slate-900/70 dark:hover:bg-slate-800"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              <div>
                <div className="font-medium">
                  {clickedCoordinates ? "클릭한 위치" : selectedRegion.name}
                </div>
                <div className="text-xs text-gray-500">
                  {clickedCoordinates
                    ? `격자 (${clickedCoordinates.nx}, ${clickedCoordinates.ny})`
                    : selectedRegion.description}
                </div>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                showDropdown ? "rotate-180" : ""
              }`}
            />
          </button>

          {showDropdown && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-slate-200/70 bg-white/95 shadow-xl backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/95">
              {REGIONS.map((region) => (
                <button
                  key={region.id}
                  onClick={() => {
                    setSelectedRegion(region)
                    setShowDropdown(false)
                  }}
                  className="flex w-full items-center gap-2 p-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <div>
                    <div className="font-medium">{region.name}</div>
                    <div className="text-xs text-gray-500">
                      {region.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {weatherData ? (
          <>
            {/* 주요 기상 요약 */}
            <div
              className={`flex items-center justify-between rounded-2xl border border-transparent p-4 ${
                weatherData.safetyLevel === "safe"
                  ? "bg-green-50 dark:bg-green-900/20"
                  : weatherData.safetyLevel === "caution"
                    ? "bg-yellow-50 dark:bg-yellow-900/20"
                    : "bg-red-50 dark:bg-red-900/20"
              }`}
            >
              <div className="flex items-center gap-3">
                {getWeatherIcon(weatherData.condition)}
                <div>
                  <div className="text-2xl font-bold">
                    {weatherData.temperature}°C
                  </div>
                  <div className="text-sm text-gray-600">
                    {weatherData.condition} • {weatherData.precipitation}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-semibold ${getSafetyColor()}`}>
                  {weatherData.safetyLevel === "safe"
                    ? "비행 가능"
                    : weatherData.safetyLevel === "caution"
                      ? "비행 주의"
                      : "비행 금지"}
                </div>
                <div className="text-xs text-gray-500">
                  강수확률 {weatherData.pop}%
                </div>
              </div>
            </div>

            {/* 세부 데이터 */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <Droplets className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="text-xs text-gray-600">습도</div>
                  <div className="font-semibold">{weatherData.humidity}%</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <Wind className="h-4 w-4 text-green-500" />
                <div>
                  <div className="text-xs text-gray-600">풍속</div>
                  <div className="font-semibold">
                    {weatherData.windSpeed}m/s
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <ArrowUp
                      className="h-3 w-3 text-gray-500"
                      style={{
                        transform: `rotate(${
                          weatherData.windDirection.includes("북")
                            ? 0
                            : weatherData.windDirection.includes("동")
                              ? 90
                              : weatherData.windDirection.includes("남")
                                ? 180
                                : 270
                        }deg)`,
                      }}
                    />
                    {weatherData.windDirection}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <Eye className="h-4 w-4 text-purple-500" />
                <div>
                  <div className="text-xs text-gray-600">시정</div>
                  <div className="font-semibold">
                    {weatherData.visibility}km
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                <CloudRain className="h-4 w-4 text-blue-600" />
                <div>
                  <div className="text-xs text-gray-600">강수량</div>
                  <div className="font-semibold">
                    {weatherData.precipitationAmount}mm
                  </div>
                </div>
              </div>

              <div className="col-span-1 flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 sm:col-span-2 dark:border-slate-700/60 dark:bg-slate-800/70">
                <Activity className="h-4 w-4 text-red-500" />
                <div>
                  <div className="text-xs text-gray-600">자기장 (Kp)</div>
                  <div className="font-semibold">
                    {weatherData.kpIndex ?? "--"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {weatherData.kpIndex
                      ? weatherData.kpIndex >= 6
                        ? "⚠️ 매우 높음 (비행 금지)"
                        : weatherData.kpIndex >= 4
                          ? "주의 필요"
                          : "안정"
                      : "데이터 없음"}
                  </div>
                </div>
              </div>
            </div>

            {/* 안전 메시지 */}
            <div className="rounded-xl border border-l-4 border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-800/60 dark:bg-yellow-900/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${getSafetyColor()}`} />
                <span className={`font-medium ${getSafetyColor()}`}>
                  드론 비행 안전도
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {weatherData.safetyMessage}
              </p>
            </div>

            {/* 자기장 경보 */}
            {weatherData.kpIndex != null && weatherData.kpIndex >= 5 && (
              <div className="rounded border border-red-200/80 bg-red-100 p-2 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/30 dark:text-red-200">
                ⚠️ 지자기 폭풍 경보: GPS 이상 가능성 있음
              </div>
            )}
          </>
        ) : (
          <div className="p-3 text-center text-gray-500 animate-pulse">
            날씨 데이터를 불러오는 중...
          </div>
        )}
      </CardContent>
    </Card>
  )
}
