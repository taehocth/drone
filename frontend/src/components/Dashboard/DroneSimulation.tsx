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

    /**
     * ✅ 최종 정답 로직
     * - REST API 기준 URL(VITE_API_URL)에서 WebSocket URL 생성
     * - host 누락 문제 해결
     * - http / https → ws / wss 자동 매핑
     */
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

    // 🟢 연결 성공
    ws.onopen = () => {
      console.log("🟢 WebSocket 연결 성공")
      onConnectionChange?.(true)
    }

    // 📡 메시지 수신
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        // 수평 캘리브레이션 결과 처리
        if (msg.type === "calibration_result") {
          window.dispatchEvent(
            new CustomEvent("calibrationComplete", {
              detail: { success: msg.success },
            }),
          )

          alert(
            msg.success
              ? `✅ ${msg.message ?? "수평 캘리브레이션 완료"}`
              : `❌ ${msg.message ?? "수평 캘리브레이션 실패"}`,
          )
          return
        }

        if (msg.status === "connected") return

        setQgcData((prev) => {
          const updated: DroneData = {
            ...prev,
            latitude: msg.latitude ?? prev.latitude,
            longitude: msg.longitude ?? prev.longitude,
            altitude: msg.altitude ?? prev.altitude,
            speed: msg.speed ?? prev.speed,
            battery: msg.battery ?? prev.battery,
            throttle: msg.throttle ?? prev.throttle,
            roll: msg.roll ?? prev.roll,
            pitch: msg.pitch ?? prev.pitch,
            yaw: msg.yaw ?? prev.yaw,
            satellites: msg.satellites ?? prev.satellites,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          }

          // 지도 위치 업데이트
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

    // 🔴 연결 종료
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

    // ⚠️ 에러
    ws.onerror = (err) => {
      console.error("⚠️ WebSocket 에러:", err)
      setConnected(false)
      onConnectionChange?.(false)
      wsRef.current = null

      window.dispatchEvent(
        new CustomEvent("droneDisconnected", { detail: {} }),
      )
    }

    // cleanup
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
