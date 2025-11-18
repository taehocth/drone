import { useEffect, useState } from "react"

interface TelemetryData {
  timestamp: string
  roll?: number
  pitch?: number
  yaw?: number
  altitude?: number
  groundspeed?: number
  battery?: number
}

export default function QGCTelemetryPanel() {
  const [data, setData] = useState<TelemetryData | null>(null)

  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8000/api/v1/qgc/ws/qgc")

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      setData(msg.data || msg) // simulation은 바로 값, 실제는 { type, data } 형태
    }

    ws.onerror = (err) => {
      console.error("WebSocket error:", err)
    }

    return () => {
      ws.close()
    }
  }, [])

  return (
    <div className="rounded border p-4">
      <h2 className="font-bold">QGC Telemetry</h2>
      {data ? (
        <ul>
          <li>Time: {data.timestamp}</li>
          <li>Roll: {data.roll?.toFixed(2)}</li>
          <li>Pitch: {data.pitch?.toFixed(2)}</li>
          <li>Yaw: {data.yaw?.toFixed(2)}</li>
          <li>Altitude: {data.altitude?.toFixed(2)} m</li>
          <li>speed: {data.groundspeed?.toFixed(2)} m/s</li>
          <li>Battery: {data.battery?.toFixed(0)}%</li>
        </ul>
      ) : (
        <p>Waiting for telemetry...</p>
      )}
    </div>
  )
}
