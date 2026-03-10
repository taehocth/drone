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
    ESC: <Thermometer className="h-5 w-5 text-rose-500" />,
    FCC: <AlertTriangle className="h-5 w-5 text-orange-500" />,
    GNSS: <Satellite className="h-5 w-5 text-sky-500" />,
  }

  const colorMap: Record<"safe" | "warning" | "danger", string> = {
    safe: "text-emerald-600 dark:text-emerald-300",
    warning: "text-amber-600 dark:text-amber-300",
    danger: "text-rose-600 dark:text-rose-300",
  }

  const rowTone: Record<"safe" | "warning" | "danger", string> = {
    safe: "bg-emerald-50/60 border-emerald-200/70 dark:bg-emerald-900/20 dark:border-emerald-900/40",
    warning: "bg-amber-50/60 border-amber-200/70 dark:bg-amber-900/20 dark:border-amber-900/40",
    danger: "bg-rose-50/60 border-rose-200/70 dark:bg-rose-900/20 dark:border-rose-900/40",
  }

  return (
    <Card className="rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl ring-1 ring-white/70 transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800/60 dark:bg-slate-900/70 dark:ring-slate-800/70">
      <CardHeader className="border-b border-slate-200/60 dark:border-slate-800/60">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          상태 기반 정비 (CBM)
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 pt-4">
        {data.map((sys, idx) => (
          <div
            key={`${sys.system}-${idx}`}
            className={`flex items-center justify-between rounded-xl border px-3 py-2 ${rowTone[sys.level]} ${colorMap[sys.level]}`}
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