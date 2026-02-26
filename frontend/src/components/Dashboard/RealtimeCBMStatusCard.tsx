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
    gpsFixType?: number
    gpsSatellites?: number
  }
}

export function RealtimeCBMStatusCard({
  connected,
  droneData,
}: RealtimeCBMStatusCardProps) {
  const [data, setData] = useState<CbmSystem[]>([])

  useEffect(() => {
    /* -------------------------------
     * 1️⃣ 연결 안 됨
     * ------------------------------- */
    if (!connected) {
      setData([
        { system: "Battery", level: "warning", msg: "연결되지 않음" },
        { system: "ESC", level: "warning", msg: "연결되지 않음" },
        { system: "FCC", level: "warning", msg: "연결되지 않음" },
        { system: "GNSS", level: "warning", msg: "연결되지 않음" },
      ])
      return
    }

    /* -------------------------------
     * 2️⃣ 연결됨 + 데이터 아직 없음
     * ------------------------------- */
    if (!droneData) {
      setData([
        { system: "Battery", level: "warning", msg: "데이터 수신 대기 중" },
        { system: "ESC", level: "warning", msg: "데이터 수신 대기 중" },
        { system: "FCC", level: "warning", msg: "데이터 수신 대기 중" },
        { system: "GNSS", level: "warning", msg: "데이터 수신 대기 중" },
      ])
      return
    }

    /* -------------------------------
     * 3️⃣ 연결됨 + 데이터 수신 중
     * ------------------------------- */
    const systems: CbmSystem[] = []

    /* 🔋 Battery */
    if (typeof droneData.battery === "number") {
      const battery = droneData.battery
      systems.push(
        battery > 80
          ? { system: "Battery", level: "safe", msg: `정상 (${battery.toFixed(1)}%)` }
          : battery > 50
          ? { system: "Battery", level: "warning", msg: `주의 (${battery.toFixed(1)}%)` }
          : { system: "Battery", level: "danger", msg: `위험 (${battery.toFixed(1)}%)` },
      )
    } else {
      systems.push({
        system: "Battery",
        level: "warning",
        msg: "데이터 없음",
      })
    }

    /* ⚙️ ESC (Speed) */
    if (typeof droneData.speed === "number") {
      const speed = droneData.speed
      systems.push(
        speed <= 20
          ? { system: "ESC", level: "safe", msg: `정상 (${speed.toFixed(1)} m/s)` }
          : speed <= 30
          ? { system: "ESC", level: "warning", msg: `주의 (${speed.toFixed(1)} m/s)` }
          : { system: "ESC", level: "danger", msg: `위험 (${speed.toFixed(1)} m/s)` },
      )
    } else {
      systems.push({
        system: "ESC",
        level: "warning",
        msg: "데이터 없음",
      })
    }

    /* 🧭 FCC (Altitude) */
    if (typeof droneData.altitude === "number") {
      const altitude = droneData.altitude
      systems.push(
        altitude <= 120
          ? { system: "FCC", level: "safe", msg: `정상 (${altitude.toFixed(1)} m)` }
          : altitude <= 150
          ? { system: "FCC", level: "warning", msg: `주의 (${altitude.toFixed(1)} m)` }
          : { system: "FCC", level: "danger", msg: `위험 (${altitude.toFixed(1)} m)` },
      )
    } else {
      systems.push({
        system: "FCC",
        level: "warning",
        msg: "데이터 없음",
      })
    }

    /* 🛰 GNSS */
    const fixType = droneData.gpsFixType
    const satellites = droneData.gpsSatellites
    if (fixType == null && satellites == null) {
      systems.push({
        system: "GNSS",
        level: "warning",
        msg: "데이터 없음",
      })
    } else if (satellites != null) {
      if (satellites <= 20) {
        systems.push({
          system: "GNSS",
          level: "warning",
          msg: `위성 부족 (${satellites})`,
        })
      } else if (satellites <= 25) {
        systems.push({
          system: "GNSS",
          level: "warning",
          msg: `주의 (${satellites})`,
        })
      } else {
        systems.push({
          system: "GNSS",
          level: "safe",
          msg: `정상 (위성 ${satellites})`,
        })
      }
    } else if (fixType != null && fixType < 3) {
      systems.push({
        system: "GNSS",
        level: "warning",
        msg: `신호 약함 (Fix ${fixType})`,
      })
    } else {
      systems.push({
        system: "GNSS",
        level: "safe",
        msg: "정상",
      })
    }

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
    <Card className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          상태 기반 정비 (CBM)
        </CardTitle>
      </CardHeader>

      <CardContent className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
        {data.map((sys, idx) => (
          <div
            key={`${sys.system}-${idx}`}
            className={`flex items-center justify-between py-2 ${colorMap[sys.level]}`}
          >
            <div className="flex items-center gap-2">
              {iconMap[sys.system] ?? <CheckCircle className="h-5 w-5" />}
              <span className="font-medium">{sys.system}</span>
            </div>
            <span className="text-sm">{sys.msg}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}