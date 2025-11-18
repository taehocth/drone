import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  AlertTriangle,
  CheckCircle,
  Thermometer,
  Battery,
  Satellite,
} from "lucide-react"

interface CbmSystem {
  system: string
  level: "safe" | "warning" | "danger"
  msg: string
}

interface RealtimeCBMStatusCardProps {
  connected: boolean
  droneData?: {
    battery?: number
    altitude?: number
    speed?: number
  }
}

export function RealtimeCBMStatusCard({
  connected,
  droneData,
}: RealtimeCBMStatusCardProps) {
  const [data, setData] = useState<CbmSystem[]>([])

  useEffect(() => {
    if (!connected) {
      // 연결되지 않았을 때는 빈 상태 또는 기본 메시지
      setData([
        {
          system: "Battery",
          level: "warning",
          msg: "연결되지 않음",
        },
        {
          system: "ESC",
          level: "warning",
          msg: "연결되지 않음",
        },
        {
          system: "FCC",
          level: "warning",
          msg: "연결되지 않음",
        },
        {
          system: "GNSS",
          level: "warning",
          msg: "연결되지 않음",
        },
      ])
      return
    }

    // 연결되었을 때 드론 데이터를 기반으로 CBM 상태 계산
    const systems: CbmSystem[] = []

    // 배터리 상태 평가
    const battery = droneData?.battery ?? 0
    if (battery > 80) {
      systems.push({
        system: "Battery",
        level: "safe",
        msg: `정상 (${battery.toFixed(1)}%)`,
      })
    } else if (battery > 50) {
      systems.push({
        system: "Battery",
        level: "warning",
        msg: `주의 필요 (${battery.toFixed(1)}%)`,
      })
    } else {
      systems.push({
        system: "Battery",
        level: "danger",
        msg: `위험 (${battery.toFixed(1)}%)`,
      })
    }

    // ESC 상태 평가 (속도 기반)
    const speed = droneData?.speed ?? 0
    if (speed >= 0 && speed <= 20) {
      systems.push({
        system: "ESC",
        level: "safe",
        msg: `정상 (${speed.toFixed(1)} m/s)`,
      })
    } else if (speed > 20 && speed <= 30) {
      systems.push({
        system: "ESC",
        level: "warning",
        msg: `주의 필요 (${speed.toFixed(1)} m/s)`,
      })
    } else {
      systems.push({
        system: "ESC",
        level: "danger",
        msg: `위험 (${speed.toFixed(1)} m/s)`,
      })
    }

    // FCC 상태 평가 (고도 기반)
    const altitude = droneData?.altitude ?? 0
    if (altitude >= 0 && altitude <= 120) {
      systems.push({
        system: "FCC",
        level: "safe",
        msg: `정상 (${altitude.toFixed(1)} m)`,
      })
    } else if (altitude > 120 && altitude <= 150) {
      systems.push({
        system: "FCC",
        level: "warning",
        msg: `주의 필요 (${altitude.toFixed(1)} m)`,
      })
    } else {
      systems.push({
        system: "FCC",
        level: "danger",
        msg: `위험 (${altitude.toFixed(1)} m)`,
      })
    }

    // GNSS 상태 평가 (연결 상태 기반)
    systems.push({
      system: "GNSS",
      level: "safe",
      msg: "위성 신호 정상",
    })

    setData(systems)
  }, [connected, droneData])

  const iconMap: Record<string, JSX.Element> = {
    Battery: <Battery className="h-5 w-5 text-amber-500" />,
    ESC: <Thermometer className="h-5 w-5 text-red-500" />,
    FCC: <AlertTriangle className="h-5 w-5 text-orange-500" />,
    GNSS: <Satellite className="h-5 w-5 text-blue-500" />,
  }

  const colorMap: Record<"safe" | "warning" | "danger", string> = {
    safe: "text-green-600",
    warning: "text-yellow-600",
    danger: "text-red-600",
  }

  return (
    <Card className="shadow-md transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          상태 기반 정비 (CBM)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 ? (
          <p className="text-sm text-gray-500">데이터 수신 대기 중...</p>
        ) : (
          data.map((sys, idx) => (
            <div
              key={`${sys.system}-${idx}`}
              className={`flex items-center justify-between border-b pb-1 ${colorMap[sys.level]}`}
            >
              <div className="flex items-center gap-2">
                {iconMap[sys.system] ?? <CheckCircle className="h-5 w-5" />}
                <span className="font-medium">{sys.system}</span>
              </div>
              <span className="text-sm">{sys.msg}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

