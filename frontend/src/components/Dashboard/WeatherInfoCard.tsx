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
  AlertTriangle
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
}

const REGIONS: Region[] = [
  {
    id: "byeolcheonpo",
    name: "별천포 해수욕장",
    description: "충남 서산시 대산읍"
  },
  {
    id: "seosan",
    name: "서산",
    description: "충청남도 서산시"
  },
  {
    id: "seoul",
    name: "서울",
    description: "서울특별시"
  }
]

export function WeatherInfoCard() {
  const [selectedRegion, setSelectedRegion] = useState<Region>(REGIONS[0])
  const [showDropdown, setShowDropdown] = useState(false)
  const [weatherData, setWeatherData] = useState<WeatherData>({
    temperature: 28,
    condition: "흐림",
    precipitation: "없음",
    humidity: 90,
    windSpeed: 1,
    windDirection: "남서풍",
    visibility: 10,
    precipitationAmount: 0,
    pop: 30,
    safetyLevel: "caution",
    safetyMessage: "기상 조건 변화에 주의하며 비행하세요.",
    lastUpdate: new Date().toLocaleTimeString("ko-KR", { 
      hour: "2-digit", 
      minute: "2-digit", 
      second: "2-digit",
      hour12: true 
    })
  })

  useEffect(() => {
    const interval = setInterval(() => {
      setWeatherData(prev => ({
        ...prev,
        lastUpdate: new Date().toLocaleTimeString("ko-KR", { 
          hour: "2-digit", 
          minute: "2-digit", 
          second: "2-digit",
          hour12: true 
        })
      }))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const getSafetyIcon = () => {
    switch (weatherData.safetyLevel) {
      case "safe":
        return <div className="w-3 h-3 bg-green-500 rounded-full" />
      case "caution":
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />
      case "danger":
        return <AlertTriangle className="w-4 h-4 text-red-600" />
      default:
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />
    }
  }

  const getSafetyColor = () => {
    switch (weatherData.safetyLevel) {
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
            {weatherData.lastUpdate}
          </Badge>
        </div>

        {/* 지역 선택 */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center justify-between w-full p-2 border rounded-lg hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              <div className="text-left">
                <div className="font-medium">{selectedRegion.name}</div>
                <div className="text-xs text-gray-500">{selectedRegion.description}</div>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
          </button>

          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10">
              {REGIONS.map((region) => (
                <button
                  key={region.id}
                  onClick={() => {
                    setSelectedRegion(region)
                    setShowDropdown(false)
                  }}
                  className="flex items-center gap-2 w-full p-2 hover:bg-gray-50 text-left"
                >
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <div>
                    <div className="font-medium">{region.name}</div>
                    <div className="text-xs text-gray-500">{region.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 현재 날씨 개요 */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg">
          <div className="flex items-center gap-3">
            <Cloud className="h-8 w-8 text-gray-600" />
            <div>
              <div className="text-2xl font-bold">{weatherData.temperature}°C</div>
              <div className="text-sm text-gray-600">
                {weatherData.condition} • {weatherData.precipitation}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 mb-1">
              {getSafetyIcon()}
              <span className={`text-sm font-medium ${getSafetyColor()}`}>
                비행 주의
              </span>
            </div>
            <div className="text-xs text-gray-500">강수확률 {weatherData.pop}%</div>
          </div>
        </div>

        {/* 상세 기상 정보 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <Droplets className="h-4 w-4 text-blue-500" />
            <div>
              <div className="text-xs text-gray-600">습도</div>
              <div className="font-semibold">{weatherData.humidity}%</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <Wind className="h-4 w-4 text-green-500" />
            <div>
              <div className="text-xs text-gray-600">풍속</div>
              <div className="font-semibold">{weatherData.windSpeed}m/s</div>
              <div className="text-xs text-gray-500">{weatherData.windDirection}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <Eye className="h-4 w-4 text-purple-500" />
            <div>
              <div className="text-xs text-gray-600">시정</div>
              <div className="font-semibold">{weatherData.visibility}km</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <CloudRain className="h-4 w-4 text-blue-600" />
            <div>
              <div className="text-xs text-gray-600">강수량</div>
              <div className="font-semibold">{weatherData.precipitationAmount}mm</div>
            </div>
          </div>
        </div>

        {/* 드론 비행 안전도 알림 */}
        <div className="border-l-4 border-yellow-500 bg-yellow-50 p-3 rounded">
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
      </CardContent>
    </Card>
  )
}
