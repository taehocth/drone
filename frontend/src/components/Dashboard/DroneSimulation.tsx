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

// yaw 보간 (±180° 튐 방지)
const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return a + d * t
}

// deadband: 미세 변화 무시
const deadband = (prev?: number, next?: number, eps = 0.1) => {
  if (typeof prev !== "number" || typeof next !== "number") return next
  return Math.abs(prev - next) < eps ? prev : next
}

/* =========================
 * Component
 * ========================= */

const DroneSimulation: React.FC = () => {
  /** 실제 렌더링 값 */
  const [renderData, setRenderData] = useState<DroneData>({})
  const [connected, setConnected] = useState(false)

  /** refs */
  const wsRef = useRef<WebSocket | null>(null)
  const targetRef = useRef<DroneData | null>(null)
  const currentRef = useRef<DroneData>({})

  const rafRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number>(performance.now())

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

      if (typeof msg.sysid !== "number") return
      setConnected(true)

      const vx = msg.velocity?.vx
      const vy = msg.velocity?.vy
      const vz = msg.velocity?.vz

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
      currentRef.current = {}
    }
  }

  const disconnect = () => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    targetRef.current = null
    currentRef.current = {}
  }

  /* =========================
   * Render Loop (Time-based interpolation)
   * ========================= */

  useEffect(() => {
    const loop = () => {
      const target = targetRef.current
      if (target) {
        const now = performance.now()
        const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1)
        lastFrameTimeRef.current = now

        // 반응 계수 (QGC 스타일)
        const alpha = Math.min(dt * 8, 1)

        const prev = currentRef.current

        const next: DroneData = {
          sysid: target.sysid,

          altitude:
            typeof prev.altitude === "number" &&
            typeof target.altitude === "number"
              ? lerp(
                  prev.altitude,
                  deadband(prev.altitude, target.altitude, 0.1) as number,
                  alpha
                )
              : target.altitude,

          roll:
            typeof prev.roll === "number" && typeof target.roll === "number"
              ? lerp(prev.roll, target.roll, alpha)
              : target.roll,

          pitch:
            typeof prev.pitch === "number" && typeof target.pitch === "number"
              ? lerp(prev.pitch, target.pitch, alpha)
              : target.pitch,

          yaw:
            typeof prev.yaw === "number" && typeof target.yaw === "number"
              ? lerpAngle(prev.yaw, target.yaw, alpha)
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
