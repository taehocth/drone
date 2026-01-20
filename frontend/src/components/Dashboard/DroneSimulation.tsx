// frontend/src/components/Dashboard/DroneSimulation.tsx

import React, { useState, useRef, useEffect } from "react"
import { DroneSimulationCard } from "./DroneSimulationCard"

/* =========================
 * Types
 * ========================= */

export interface DroneData {
  altitude?: number
  speed?: number
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
  sysid?: number
}

/* =========================
 * Utils
 * ========================= */

const radToDeg = (v?: number) =>
  typeof v === "number" ? (v * 180) / Math.PI : undefined

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/* =========================
 * Component
 * ========================= */

const DroneSimulation: React.FC = () => {
  /** 화면에 실제로 그릴 값 */
  const [renderData, setRenderData] = useState<DroneData>({})
  const [connected, setConnected] = useState(false)

  /** refs */
  const wsRef = useRef<WebSocket | null>(null)

  // 서버에서 마지막으로 받은 값
  const targetRef = useRef<DroneData | null>(null)

  // 현재 화면에 그려지고 있는 값
  const currentRef = useRef<DroneData>({})

  // 마지막 서버 패킷 수신 시각
  const lastPacketTsRef = useRef<number>(0)

  const rafRef = useRef<number | null>(null)

  /* =========================
   * Connect / Disconnect
   * ========================= */

  const connect = () => {
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

      // waiting 패킷 무시
      if (typeof msg.sysid !== "number") return

      setConnected(true)

      const vx = msg.velocity?.vx
      const vy = msg.velocity?.vy
      const vz = msg.velocity?.vz

      const speed =
        typeof vx === "number" &&
        typeof vy === "number" &&
        typeof vz === "number"
          ? Math.sqrt(vx * vx + vy * vy + vz * vz) * 3.6
          : undefined

      targetRef.current = {
        sysid: msg.sysid,
        altitude: msg.position?.alt,
        latitude: msg.position?.lat,
        longitude: msg.position?.lon,
        battery: msg.battery?.remaining,
        roll: radToDeg(msg.attitude?.roll),
        pitch: radToDeg(msg.attitude?.pitch),
        yaw: radToDeg(msg.attitude?.yaw),
        vx,
        vy,
        vz,
        speed,
        timestamp: msg.server_ts,
      }

      lastPacketTsRef.current = performance.now()
    }

    ws.onclose = ws.onerror = () => {
      setConnected(false)
      wsRef.current = null
    }
  }

  const disconnect = () => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
  }

  /* =========================
   * Render Loop (Interpolation)
   * ========================= */

  useEffect(() => {
    const loop = () => {
      const target = targetRef.current
      if (target) {
        const now = performance.now()
        const dt = Math.min((now - lastPacketTsRef.current) / 100, 1)

        const prev = currentRef.current

        const next: DroneData = {
          sysid: target.sysid,
          altitude:
            typeof prev.altitude === "number" &&
            typeof target.altitude === "number"
              ? lerp(prev.altitude, target.altitude, dt)
              : target.altitude,

          roll:
            typeof prev.roll === "number" && typeof target.roll === "number"
              ? lerp(prev.roll, target.roll, dt)
              : target.roll,

          pitch:
            typeof prev.pitch === "number" && typeof target.pitch === "number"
              ? lerp(prev.pitch, target.pitch, dt)
              : target.pitch,

          yaw:
            typeof prev.yaw === "number" && typeof target.yaw === "number"
              ? lerp(prev.yaw, target.yaw, dt)
              : target.yaw,

          battery: target.battery,
          latitude: target.latitude,
          longitude: target.longitude,
          speed: target.speed,
          timestamp: target.timestamp,
        }

        currentRef.current = next
        setRenderData(next)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /* =========================
   * Render
   * ========================= */

  return (
    <div className="space-y-6 p-6">
      <DroneSimulationCard
        data={renderData}
        connected={connected}
        onConnect={connect}
        onDisconnect={disconnect}
      />
    </div>
  )
}

export default DroneSimulation
