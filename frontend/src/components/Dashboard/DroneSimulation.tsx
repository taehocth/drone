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

  // ✅ WebSocket 관리
  useEffect(() => {
    if (!connected || wsRef.current) return

    const wsUrl = "ws://localhost:8000/api/v1/qgc/ws/qgc"
    console.log("🔌 WebSocket 연결 시도중:", wsUrl)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    // 🟢 연결 성공
    ws.onopen = () => {
      console.log("🟢 WebSocket 연결 성공!")
      onConnectionChange?.(true)
    }

    // 📡 메시지 수신
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.status === "connected") return

        setQgcData((prev) => {
          const updated: DroneData = {
            ...prev,
            latitude: msg.latitude ?? prev.latitude,
            longitude: msg.longitude ?? prev.longitude,
            altitude: msg.altitude ?? prev.altitude,
            speed: msg.speed ?? prev.speed,
            battery: msg.battery ?? prev.battery,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          }

          // ✅ 지도 위치 업데이트용 이벤트
          if (updated.latitude && updated.longitude) {
            window.dispatchEvent(
              new CustomEvent("dronePositionUpdate", {
                detail: {
                  lat: updated.latitude,
                  lng: updated.longitude,
                  alt: updated.altitude,
                  speed: updated.speed,
                  battery: updated.battery,
                },
              }),
            )
          }

          // ✅ React 렌더링 안전하게 처리 (경고 방지)
          queueMicrotask(() => {
            onDataChange?.(updated)
          })

          return updated
        })
      } catch (err) {
        console.error("❌ WebSocket 데이터 파싱 실패:", err, event.data)
      }
    }

    // 🔴 연결 종료
    ws.onclose = (event) => {
      console.warn(
        "🔴 WebSocket 연결 종료됨 →",
        event.code,
        event.reason || "No reason",
      )
      setConnected(false)
      onConnectionChange?.(false)
      wsRef.current = null
    }

    // ⚠️ 에러 처리
    ws.onerror = (err) => {
      console.error("⚠️ WebSocket 에러 발생:", err)
      setConnected(false)
      onConnectionChange?.(false)
      wsRef.current = null
    }

    // 🧹 cleanup
    return () => {
      console.log("🧹 cleanup → WebSocket 연결 종료 중...")
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch (_) {
          /* ignore */
        }
        wsRef.current = null
      }
      onConnectionChange?.(false)
    }
  }, [connected])

  // 🔘 연결 버튼 클릭 핸들러
  const handleToggleConnect = () => {
    if (connected) {
      console.log("🔌 연결 해제 버튼 클릭")
      setConnected(false)
      onConnectionChange?.(false)
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close()
        } catch (_) {
          /* ignore */
        }
        wsRef.current = null
      }
      setQgcData(initialData)
      onDataChange?.(initialData)
    } else {
      console.log("🔌 연결 버튼 클릭 → 연결 시작")
      setConnected(true)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 gap-6">
        <DroneSimulationCard
          data={qgcData}
          connected={connected}
          onToggleConnect={handleToggleConnect}
        />
      </div>
    </div>
  )
}

export default DroneSimulation
