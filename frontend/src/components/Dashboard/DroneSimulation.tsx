// frontend/src/components/Dashboard/DroneSimulation.tsx
import React, { useState, useEffect, useRef } from "react"
import { DroneSimulationCard } from "./DroneSimulationCard"

/* =========================
 * Types
 * ========================= */

export interface DroneData {
  altitude?: number
  speed?: number
  throttle?: number
  battery?: number
  latitude?: number
  longitude?: number
  roll?: number
  pitch?: number
  yaw?: number
  vx?: number
  vy?: number
  vz?: number
  timestamp?: string
  satellites?: number
  sysid?: number
}

const initialData: DroneData = {}

/* =========================
 * Utils
 * ========================= */

const radToDeg = (v?: number) =>
  typeof v === "number" ? (v * 180) / Math.PI : undefined

/* =========================
 * Component
 * ========================= */

const DroneSimulation: React.FC = () => {
  const [qgcData, setQgcData] = useState<DroneData>(initialData)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (wsRef.current) return

    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000"

    const wsProtocol = apiBaseUrl.startsWith("https") ? "wss" : "ws"
    const wsHost = apiBaseUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/api\/v1$/, "")

    const wsUrl = `${wsProtocol}://${wsHost}/api/v1/qgc/ws/qgc`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      // 🔴 진짜 연결 기준: sysid가 들어왔는가
      if (typeof msg.sysid === "number") {
        setConnected(true)
      }

      setQgcData((prev) => {
        const vx = msg.velocity?.vx ?? prev.vx
        const vy = msg.velocity?.vy ?? prev.vy
        const vz = msg.velocity?.vz ?? prev.vz

        const speed =
          vx !== undefined && vy !== undefined && vz !== undefined
            ? Math.sqrt(vx * vx + vy * vy + vz * vz) * 3.6
            : prev.speed

        return {
          sysid: msg.sysid ?? prev.sysid,
          latitude: msg.position?.lat ?? prev.latitude,
          longitude: msg.position?.lon ?? prev.longitude,
          altitude: msg.position?.alt ?? prev.altitude,
          battery: msg.battery?.remaining ?? prev.battery,
          roll: radToDeg(msg.attitude?.roll) ?? prev.roll,
          pitch: radToDeg(msg.attitude?.pitch) ?? prev.pitch,
          yaw: radToDeg(msg.attitude?.yaw) ?? prev.yaw,
          vx,
          vy,
          vz,
          speed,
          timestamp: msg.server_ts ?? prev.timestamp,
        }
      })
    }

    ws.onclose = ws.onerror = () => {
      setConnected(false)
      wsRef.current = null
    }

    return () => ws.close()
  }, [])

  return (
    <div className="space-y-6 p-6">
      <DroneSimulationCard data={qgcData} connected={connected} />
    </div>
  )
}

export default DroneSimulation
