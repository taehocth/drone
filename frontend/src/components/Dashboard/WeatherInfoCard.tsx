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
    id: "byeolcheonpo",
    name: "별천포 해수욕장",
    description: "충남 서산시 대산읍",
    nx: 54,
    ny: 112,
  },
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
  {
    id: "seoul",
    name: "서울",
    description: "서울특별시",
    nx: 60,
    ny: 127,
  },
  {
    id: "suwon",
    name: "수원",
    description: "경기도 수원시",
    nx: 60,
    ny: 121,
  },
  {
    id: "daegu",
    name: "대구",
    description: "대구광역시",
    nx: 89,
    ny: 90,
  },
  {
    id: "busan",
    name: "부산",
    description: "부산광역시",
    nx: 98,
    ny: 76,
  },
  {
    id: "daejeon",
    name: "대전",
    description: "대전광역시",
    nx: 67,
    ny: 100,
  },
]

// 🔑 기상청 API KEY
const WEATHER_API_KEY =
  "BOofH37ikPl2w1qzCRJgNUryyGEYO2b%2BmJcqNTnvBlX0IUMBUB2d1IY%2FU6OdZe3SJqxX0uA5XY4qCov07DEf%2FQ%3D%3D"

export function WeatherInfoCard() {
  const [selectedRegion, setSelectedRegion] = useState<Region>(REGIONS[0])
  const [showDropdown, setShowDropdown] = useState(false)
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)

  // 날씨 데이터 가져오기
  const fetchWeather = async (region: Region) => {
    try {
      const baseDate = new Date().toISOString().slice(0, 10).replace(/-/g, "") // YYYYMMDD
      const baseTime = "0500" // 발표 기준 시간 (예시 05시)

      const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${WEATHER_API_KEY}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${region.nx}&ny=${region.ny}`

      const res = await fetch(url)
      const data = await res.json()

      const items = data?.response?.body?.items?.item || []

      const temp = items.find((i: any) => i.category === "TMP")?.fcstValue || 25
      const humidity =
        items.find((i: any) => i.category === "REH")?.fcstValue || 60
      const wind = items.find((i: any) => i.category === "WSD")?.fcstValue || 1
      const pop = items.find((i: any) => i.category === "POP")?.fcstValue || 10

      setWeatherData({
        temperature: Number(temp),
        condition: "맑음", // 단순화 (필요시 SKY 코드 사용 가능)
        precipitation: "없음",
        humidity: Number(humidity),
        windSpeed: Number(wind),
        windDirection: "남풍",
        visibility: 10,
        precipitationAmount: 0,
        pop: Number(pop),
        safetyLevel: Number(pop) > 60 ? "caution" : "safe",
        safetyMessage:
          Number(pop) > 60 ? "비행에 주의하세요." : "비행하기 좋은 날씨입니다.",
        lastUpdate: new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      })
    } catch (err) {
      console.error("날씨 불러오기 실패:", err)
    }
  }

  useEffect(() => {
    fetchWeather(selectedRegion)
    const interval = setInterval(
      () => fetchWeather(selectedRegion),
      1000 * 60 * 10,
    )
    return () => clearInterval(interval)
  }, [selectedRegion])

  const getSafetyIcon = () => {
    switch (weatherData?.safetyLevel) {
      case "safe":
        return <div className="h-3 w-3 rounded-full bg-green-500" />
      case "caution":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case "danger":
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    }
  }

  const getSafetyColor = () => {
    switch (weatherData?.safetyLevel) {
      case "safe":
        return "text-green-600"
      case "caution":
        return "text-yellow-600"
      case "danger":
        return "text-red-600"
      default:
        return "text-yellow-600"
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            기상 정보
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {weatherData?.lastUpdate || "--:--:--"}
          </Badge>
        </div>

        {/* 지역 선택 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex w-full items-center justify-between rounded-lg border p-2 hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              <div className="text-left">
                <div className="font-medium">{selectedRegion.name}</div>
                <div className="text-xs text-gray-500">
                  {selectedRegion.description}
                </div>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showDropdown ? "rotate-180" : ""}`}
            />
          </button>

          {showDropdown && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border bg-white shadow-lg">
              {REGIONS.map((region) => (
                <button
                  key={region.id}
                  onClick={() => {
                    setSelectedRegion(region)
                    setShowDropdown(false)
                  }}
                  className="flex w-full items-center gap-2 p-2 text-left hover:bg-gray-50"
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
            {/* 현재 날씨 */}
            <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-blue-50 to-sky-50 p-3">
              <div className="flex items-center gap-3">
                <Cloud className="h-8 w-8 text-gray-600" />
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
                <div className="mb-1 flex items-center gap-1">
                  {getSafetyIcon()}
                  <span className={`text-sm font-medium ${getSafetyColor()}`}>
                    {weatherData.safetyLevel === "safe"
                      ? "비행 가능"
                      : "비행 주의"}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  강수확률 {weatherData.pop}%
                </div>
              </div>
            </div>

            {/* 상세 기상 정보 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded bg-gray-50 p-2">
                <Droplets className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="text-xs text-gray-600">습도</div>
                  <div className="font-semibold">{weatherData.humidity}%</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded bg-gray-50 p-2">
                <Wind className="h-4 w-4 text-green-500" />
                <div>
                  <div className="text-xs text-gray-600">풍속</div>
                  <div className="font-semibold">
                    {weatherData.windSpeed}m/s
                  </div>
                  <div className="text-xs text-gray-500">
                    {weatherData.windDirection}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded bg-gray-50 p-2">
                <Eye className="h-4 w-4 text-purple-500" />
                <div>
                  <div className="text-xs text-gray-600">시정</div>
                  <div className="font-semibold">
                    {weatherData.visibility}km
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded bg-gray-50 p-2">
                <CloudRain className="h-4 w-4 text-blue-600" />
                <div>
                  <div className="text-xs text-gray-600">강수량</div>
                  <div className="font-semibold">
                    {weatherData.precipitationAmount}mm
                  </div>
                </div>
              </div>
            </div>

            {/* 비행 안전도 */}
            <div className="rounded border-l-4 border-yellow-500 bg-yellow-50 p-3">
              <div className="flex items-center gap-2">
                {getSafetyIcon()}
                <span className={`font-medium ${getSafetyColor()}`}>
                  드론 비행 안전도
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {weatherData.safetyMessage}
              </p>
            </div>
          </>
        ) : (
          <div className="p-3 text-center text-gray-500">
            날씨 데이터를 불러오는 중...
          </div>
        )}
      </CardContent>
    </Card>
  )
}
