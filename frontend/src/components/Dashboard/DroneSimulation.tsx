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

  rollInt?: number
  pitchInt?: number
  yawInt?: number

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
  const [renderData, setRenderData] = useState<DroneData>({})
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)

  // 실시간 데이터 흐름
  const targetRef = useRef<DroneData | null>(null)
  const smoothRef = useRef<DroneData>({})
  const lastTsRef = useRef<number>(performance.now())

  /* =========================
   * Connect / Disconnect
   * ========================= */

  const connect = () => {
    if (wsRef.current) return

    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000"
    const wsProtocol = apiBaseUrl.startsWith("https") ? "wss" : "ws"
    const wsHost = apiBaseUrl.replace(/^https?:\/\//, "").replace(/\/api\/v1$/, "")
    const wsUrl = `${wsProtocol}://${wsHost}/api/v1/qgc/ws/qgc`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (typeof msg.sysid !== "number") return

      setConnected(true)

      const vx = msg.velocity?.vx
      const vy = msg.velocity?.vy
      const speed =
        typeof vx === "number" && typeof vy === "number"
          ? Math.sqrt(vx * vx + vy * vy) * 3.6
          : undefined

      targetRef.current = {
        sysid: msg.sysid,
        altitude: msg.position?.alt,
        latitude: msg.position?.lat,
        longitude: msg.position?.lon,
        battery: msg.battery?.remaining,

        // 🔥 각도는 즉시 반영 (핵심)
        roll: radToDeg(msg.attitude?.roll),
        pitch: radToDeg(msg.attitude?.pitch),
        yaw: radToDeg(msg.attitude?.yaw),

        speed,
        timestamp: msg.server_ts,
      }
    }

    ws.onclose = ws.onerror = () => {
      setConnected(false)
      wsRef.current = null
      targetRef.current = null
      smoothRef.current = {}
    }
  }

  const disconnect = () => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    targetRef.current = null
    smoothRef.current = {}
  }

  /* =========================
   * RAF Loop (고주기 계산, state X)
   * ========================= */

  useEffect(() => {
    let rafId: number

    const rafLoop = () => {
      const target = targetRef.current
      if (target) {
        const now = performance.now()
        const dt = Math.min((now - lastTsRef.current) / 1000, 0.1)
        lastTsRef.current = now

        const alpha = Math.min(dt * 12, 1) // 🔥 반응성 강화

        const prev = smoothRef.current

        smoothRef.current = {
          ...target,

          // 위치·고도·속도만 부드럽게
          altitude:
            typeof prev.altitude === "number" &&
            typeof target.altitude === "number"
              ? lerp(prev.altitude, target.altitude, alpha)
              : target.altitude,

          speed:
            typeof prev.speed === "number" && typeof target.speed === "number"
              ? lerp(prev.speed, target.speed, alpha)
              : target.speed,

          // 🔥 각도는 보간 제거 (즉시)
          roll: target.roll,
          pitch: target.pitch,
          yaw: target.yaw,
        }
      }

      rafId = requestAnimationFrame(rafLoop)
    }

    rafId = requestAnimationFrame(rafLoop)
    return () => cancelAnimationFrame(rafId)
  }, [])

  /* =========================
   * UI Snapshot (12.5Hz)
   * ========================= */

  useEffect(() => {
    const id = setInterval(() => {
      const d = smoothRef.current
      if (!d.sysid) return

      setRenderData({
        ...d,
        rollInt: typeof d.roll === "number" ? Math.round(d.roll) : undefined,
        pitchInt: typeof d.pitch === "number" ? Math.round(d.pitch) : undefined,
        yawInt: typeof d.yaw === "number" ? Math.round(d.yaw) : undefined,
      })
    }, 80) // 🔥 12.5Hz

    return () => clearInterval(id)
  }, [])

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