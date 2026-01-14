// frontend/src/components/Dashboard/DroneSimulation.tsx
import React, { useState, useEffect, useRef } from "react"
import { DroneSimulationCard } from "./DroneSimulationCard"

export interface DroneData {
  altitude: number
  speed: number
  throttle: number
  battery: number
  latitude?: number
  longitude?: number
  roll?: number
  pitch?: number
  yaw?: number
  vx?: number
  vy?: number
  vz?: number
  timestamp: string
  satellites?: number
}

const initialData: DroneData = {
  altitude: 0,
  throttle: 0,
  speed: 0,
  battery: 0,
  latitude: 0,
  longitude: 0,
  roll: 0,
  pitch: 0,
  yaw: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  timestamp: new Date().toISOString(),
}

interface DroneSimulationProps {
  onConnectionChange?: (connected: boolean) => void
  onDataChange?: (data: DroneData) => void
}

const DroneSimulation: React.FC<DroneSimulationProps> = ({
  onConnectionChange,
  onDataChange,
}) => {
  const [qgcData, setQgcData] = useState<DroneData>(initialData)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // ===============================
  // WebSocket 연결 관리
  // ===============================
  useEffect(() => {
    if (!connected || wsRef.current) return

    const apiBaseUrl =
      import.meta.env.VITE_API_URL || "http://localhost:8000"

    const wsProtocol = apiBaseUrl.startsWith("https") ? "wss" : "ws"
    const wsHost = apiBaseUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/api\/v1$/, "")

    const wsUrl = `${wsProtocol}://${wsHost}/api/v1/qgc/ws/qgc`

    console.log("🔌 WebSocket 연결 시도:", wsUrl)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("🟢 WebSocket 연결 성공")
      onConnectionChange?.(true)
    }

    // ===============================
    // 📡 메시지 수신 (최종 매핑 로직)
    // ===============================
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        // 🔍 디버그용 (문제 생기면 바로 확인 가능)
        console.log("📡 WS RAW DATA:", msg)

        if (msg.status === "connected") return

        setQgcData((prev) => {
          const updated: DroneData = {
            ...prev,

            // Render PUSH 구조 대응
            latitude: msg.position?.lat ?? msg.latitude ?? prev.latitude,
            longitude: msg.position?.lon ?? msg.longitude ?? prev.longitude,
            altitude: msg.position?.alt ?? msg.altitude ?? prev.altitude,

            battery:
              msg.battery?.remaining ??
              msg.battery ??
              prev.battery,

            speed: msg.speed ?? prev.speed,
            throttle: msg.throttle ?? prev.throttle,
            roll: msg.roll ?? prev.roll,
            pitch: msg.pitch ?? prev.pitch,
            yaw: msg.yaw ?? prev.yaw,
            satellites: msg.satellites ?? prev.satellites,

            timestamp: msg.timestamp ?? new Date().toISOString(),
          }

          // 지도 업데이트 이벤트
          if (updated.latitude && updated.longitude) {
            window.dispatchEvent(
              new CustomEvent("dronePositionUpdate", {
                detail: {
                  lat: updated.latitude,
                  lng: updated.longitude,
                  alt: updated.altitude,
                  speed: updated.speed,
                  battery: updated.battery,
                  yaw: updated.yaw,
                  satellites: updated.satellites,
                },
              }),
            )
          }

          queueMicrotask(() => {
            onDataChange?.(updated)
          })

          return updated
        })
      } catch (err) {
        console.error("❌ WebSocket 메시지 파싱 실패:", err, event.data)
      }
    }

    ws.onclose = (event) => {
      console.warn(
        "🔴 WebSocket 연결 종료:",
        event.code,
        event.reason || "no reason",
      )
      setConnected(false)
      onConnectionChange?.(false)
      wsRef.current = null

      window.dispatchEvent(
        new CustomEvent("droneDisconnected", { detail: {} }),
      )
    }

    ws.onerror = (err) => {
      console.error("⚠️ WebSocket 에러:", err)
      setConnected(false)
      onConnectionChange?.(false)
      wsRef.current = null

      window.dispatchEvent(
        new CustomEvent("droneDisconnected", { detail: {} }),
      )
    }

    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {}
        wsRef.current = null
      }
      onConnectionChange?.(false)
    }
  }, [connected])

  // ===============================
  // 연결 버튼
  // ===============================
  const handleToggleConnect = () => {
    if (connected) {
      console.log("🔌 연결 해제")
      setConnected(false)

      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {}
        wsRef.current = null
      }

      setQgcData(initialData)
      onDataChange?.(initialData)

      window.dispatchEvent(
        new CustomEvent("droneDisconnected", { detail: {} }),
      )
    } else {
      console.log("🔌 연결 시작")
      setConnected(true)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <DroneSimulationCard
        data={qgcData}
        connected={connected}
        onToggleConnect={handleToggleConnect}
        wsRef={wsRef}
      />
    </div>
  )
}

export default DroneSimulation
