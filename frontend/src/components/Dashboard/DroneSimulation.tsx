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

function smoothYaw(
  prev: number,
  target: number,
  dt: number,
  maxDegPerSec = 120,
) {
  let diff = target - prev
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360

  const maxStep = maxDegPerSec * dt
  if (Math.abs(diff) <= maxStep) return target
  return prev + Math.sign(diff) * maxStep
}

/* =========================
 * Component
 * ========================= */

const DroneSimulation: React.FC = () => {
  const [renderData, setRenderData] = useState<DroneData>({})
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)

  const targetRef = useRef<DroneData | null>(null)
  const smoothRef = useRef<DroneData>({})
  const lastTsRef = useRef<number>(performance.now())

  /* =========================
   * Connect / Disconnect
   * ========================= */

  const connect = () => {
    if (wsRef.current) return

    // 🔧 핵심: Telemetry WS 전용 URL 우선 사용
    const telemetryWsBase =
      import.meta.env.VITE_TELEMETRY_WS_URL ||
      import.meta.env.VITE_API_URL ||
      "http://localhost:8000"

    const wsProtocol = telemetryWsBase.startsWith("https") ? "wss" : "ws"
    const wsHost = telemetryWsBase.replace(/^https?:\/\//, "").replace(/\/api\/v1$/, "")
    const wsUrl = `${wsProtocol}://${wsHost}/api/v1/qgc/ws/qgc`

    console.log("📡 Telemetry WS URL:", wsUrl)

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

      // 🔧 지연 확인용 (선택)
      if (msg.server_ts) {
        const delay = Date.now() - new Date(msg.server_ts).getTime()
        console.log("⏱ Telemetry delay(ms):", delay)
      }

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
   * RAF Loop
   * ========================= */

  useEffect(() => {
    let rafId: number

    const rafLoop = () => {
      const target = targetRef.current
      if (target) {
        const now = performance.now()
        const dt = Math.min((now - lastTsRef.current) / 1000, 0.1)
        lastTsRef.current = now

        const alpha = Math.min(dt * 20, 1)
        const prev = smoothRef.current

        smoothRef.current = {
          ...target,

          altitude:
            typeof prev.altitude === "number" &&
            typeof target.altitude === "number"
              ? lerp(prev.altitude, target.altitude, alpha)
              : target.altitude,

          speed:
            typeof prev.speed === "number" && typeof target.speed === "number"
              ? lerp(prev.speed, target.speed, alpha)
              : target.speed,

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
              ? smoothYaw(prev.yaw, target.yaw, dt, 120)
              : target.yaw,
        }
      }

      rafId = requestAnimationFrame(rafLoop)
    }

    rafId = requestAnimationFrame(rafLoop)
    return () => cancelAnimationFrame(rafId)
  }, [])

  /* =========================
   * UI Snapshot
   * ========================= */

  useEffect(() => {
    let rafId: number
  
    const rafLoop = () => {
      const target = targetRef.current
      if (target) {
        const now = performance.now()
        const dt = Math.min((now - lastTsRef.current) / 1000, 0.05)
        lastTsRef.current = now
  
        const alpha = Math.min(dt * 20, 1)
        const prev = smoothRef.current
  
        const next = {
          ...target,
          altitude:
            prev.altitude != null && target.altitude != null
              ? lerp(prev.altitude, target.altitude, alpha)
              : target.altitude,
          speed:
            prev.speed != null && target.speed != null
              ? lerp(prev.speed, target.speed, alpha)
              : target.speed,
          roll:
            prev.roll != null && target.roll != null
              ? lerp(prev.roll, target.roll, alpha)
              : target.roll,
          pitch:
            prev.pitch != null && target.pitch != null
              ? lerp(prev.pitch, target.pitch, alpha)
              : target.pitch,
          yaw:
            prev.yaw != null && target.yaw != null
              ? smoothYaw(prev.yaw, target.yaw, dt, 180)
              : target.yaw,
        }
  
        smoothRef.current = next
  
        // 🔥 여기서 바로 렌더
        setRenderData({
          ...next,
          rollInt: next.roll != null ? Math.round(next.roll) : undefined,
          pitchInt: next.pitch != null ? Math.round(next.pitch) : undefined,
          yawInt: next.yaw != null ? Math.round(next.yaw) : undefined,
        })
      }
  
      rafId = requestAnimationFrame(rafLoop)
    }
  
    rafId = requestAnimationFrame(rafLoop)
    return () => cancelAnimationFrame(rafId)
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