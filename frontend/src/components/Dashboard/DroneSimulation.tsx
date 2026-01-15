// frontend/src/components/Dashboard/DroneSimulation.tsx
import React, { useState, useEffect, useRef } from "react"
import { DroneSimulationCard } from "./DroneSimulationCard"

/* =========================
 * Types
 * ========================= */

export interface DroneData {
  altitude: number          // meters
  speed: number             // km/h
  throttle: number
  battery: number           // %
  latitude?: number
  longitude?: number
  roll?: number             // degrees
  pitch?: number            // degrees
  yaw?: number              // degrees
  vx?: number               // m/s
  vy?: number               // m/s
  vz?: number               // m/s
  timestamp: string
  satellites?: number
}

const initialData: DroneData = {
  altitude: 0,
  throttle: 0,
  speed: 0,
  battery: 0,
  roll: 0,
  pitch: 0,
  yaw: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  timestamp: new Date().toISOString(),
}

/* =========================
 * Utils
 * ========================= */

const radToDeg = (v?: number) =>
  typeof v === "number" ? (v * 180) / Math.PI : undefined

/* =========================
 * Component
 * ========================= */

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

  /* =========================
   * WebSocket 연결
   * ========================= */

  useEffect(() => {
    if (!connected || wsRef.current) return

    const apiBaseUrl =
      import.meta.env.VITE_API_URL || "http://localhost:8000"

    const wsProtocol = apiBaseUrl.startsWith("https") ? "wss" : "ws"
    const wsHost = apiBaseUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/api\/v1$/, "")

    const wsUrl = `${wsProtocol}://${wsHost}/api/v1/qgc/ws/qgc`

    console.log("🔌 WebSocket 연결:", wsUrl)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      onConnectionChange?.(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        setQgcData((prev) => {
          /* -------- Velocity -------- */
          const vx = typeof msg.velocity?.vx === "number" ? msg.velocity.vx : prev.vx ?? 0
          const vy = typeof msg.velocity?.vy === "number" ? msg.velocity.vy : prev.vy ?? 0
          const vz = typeof msg.velocity?.vz === "number" ? msg.velocity.vz : prev.vz ?? 0

          // m/s → km/h (아주 작은 값도 유지)
          const speedKmh = Math.sqrt(vx * vx + vy * vy + vz * vz) * 3.6

          const updated: DroneData = {
            ...prev,

            /* Position */
            latitude:
              typeof msg.position?.lat === "number"
                ? msg.position.lat
                : prev.latitude,

            longitude:
              typeof msg.position?.lon === "number"
                ? msg.position.lon
                : prev.longitude,

            altitude:
              typeof msg.position?.alt === "number"
                ? Number(msg.position.alt.toFixed(2))
                : prev.altitude,

            /* Battery */
            battery:
              typeof msg.battery?.remaining === "number"
                ? msg.battery.remaining
                : prev.battery,

            /* Attitude (deg) */
            roll: radToDeg(msg.attitude?.roll) ?? prev.roll,
            pitch: radToDeg(msg.attitude?.pitch) ?? prev.pitch,
            yaw: radToDeg(msg.attitude?.yaw) ?? prev.yaw,

            /* Velocity */
            vx,
            vy,
            vz,
            speed: Number(speedKmh.toFixed(3)),

            timestamp: msg.timestamp ?? prev.timestamp,
          }

          queueMicrotask(() => {
            onDataChange?.(updated)
          })

          return updated
        })
      } catch (err) {
        console.error("❌ WS 파싱 실패:", err)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      onConnectionChange?.(false)
      wsRef.current = null
    }

    ws.onerror = () => {
      setConnected(false)
      onConnectionChange?.(false)
      wsRef.current = null
    }

    return () => {
      wsRef.current?.close()
      wsRef.current = null
      onConnectionChange?.(false)
    }
  }, [connected])

  /* =========================
   * 연결 버튼
   * ========================= */

  const handleToggleConnect = () => {
    if (connected) {
      wsRef.current?.close()
      wsRef.current = null
      setConnected(false)
      setQgcData(initialData)
      onDataChange?.(initialData)
    } else {
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
