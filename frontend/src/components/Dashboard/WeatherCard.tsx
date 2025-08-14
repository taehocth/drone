import { CloudSun, Droplets, Thermometer, Wind } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LoadingSpinner } from "@/components/Common/LoadingSpinner"
import { GeomagneticChart } from "@/components/Dashboard/GeomagneticChart"

import { useQuery } from "@tanstack/react-query"
import { UtilsService } from "@/client"

//

interface WeatherCardProps {
  weather: {
    temperature: number
    windSpeed: number
    windDirection: string
    condition: string
    humidity: number
  }
}

function getGeomagneticKindex() {
  return {
    queryFn: () =>
      UtilsService.geomagneticKindex().then((response) => response.kindex),
    queryKey: ["geomagnetic-kindex"],
  }
}

export function WeatherCard({ weather }: WeatherCardProps) {
  const { data: kindexData, isPending } = useQuery({
    ...getGeomagneticKindex(),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>날씨 정보</CardTitle>
        <CardDescription>비행 조건 및 환경 데이터</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="w-full">
            {isPending ? (
              <LoadingSpinner />
            ) : (
              <div>
                <GeomagneticChart kindexRecent={kindexData?.recent} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CloudSun className="text-muted-foreground h-5 w-5" />
              <span className="text-sm font-medium">날씨 상태</span>
            </div>
            <span>{weather.condition}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Thermometer className="text-muted-foreground h-5 w-5" />
              <span className="text-sm font-medium">온도</span>
            </div>
            <span>{weather.temperature}°C</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wind className="text-muted-foreground h-5 w-5" />
              <span className="text-sm font-medium">풍속</span>
            </div>
            <span>
              {weather.windSpeed} m/s ({weather.windDirection})
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="text-muted-foreground h-5 w-5" />
              <span className="text-sm font-medium">습도</span>
            </div>
            <span>{weather.humidity}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
