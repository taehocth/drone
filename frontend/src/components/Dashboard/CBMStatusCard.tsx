import { useEffect, useState, useRef } from "react"
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

export function CBMStatusCard() {
  const [data, setData] = useState<CbmSystem[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // 환경 변수에서 API URL 가져오기 (ws:// 또는 wss://)
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"
    const wsProtocol = apiBaseUrl.startsWith("https") ? "wss" : "ws"
    const wsHost = apiBaseUrl.replace(/^https?:\/\//, "").replace(/\/api\/v1$/, "")
    const wsUrl = `${wsProtocol}://${wsHost}/api/v1/cbm/ws/cbm`
    console.log("🔌 CBM WebSocket 연결 시도:", wsUrl)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("🟢 CBM WebSocket 연결 성공")
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.systems) {
          setData(payload.systems)
        }
      } catch (err) {
        console.error("❌ CBM 데이터 파싱 실패:", err)
      }
    }

    ws.onerror = (err) => {
      if (ws.readyState !== WebSocket.CLOSED) {
        console.error("⚠️ CBM WebSocket 에러:", err)
      }
    }

    ws.onclose = () => {
      console.warn("🔴 CBM WebSocket 연결 종료됨")
    }

    return () => {
      ws.close()
      wsRef.current = null
      console.log("🧹 CBM WebSocket 정리 완료")
    }
  }, [])

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
    <Card className="rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl ring-1 ring-white/70 transition-all duration-300 hover:shadow-lg dark:border-slate-800/60 dark:bg-slate-900/70 dark:ring-slate-800/70">
      <CardHeader className="border-b border-slate-200/60 dark:border-slate-800/60">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          상태 기반 정비 (CBM)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">데이터 수신 대기 중...</p>
        ) : (
          data.map((sys, idx) => (
            <div
              key={`${sys.system}-${idx}`}
              className={`flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/80 px-3 py-2 ${colorMap[sys.level]} dark:border-slate-700/60 dark:bg-slate-800/60`}
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
