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

// 🔥 yaw 전용: 각속도 제한 보간
function smoothYaw(
  prev: number,
  target: number,
  dt: number,
  maxDegPerSec = 120, // 필요하면 60 / 90 / 180 등으로 조절
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

  // 데이터 흐름 분리
  const targetRef = useRef<DroneData | null>(null) // 서버 최신값
  const smoothRef = useRef<DroneData>({})           // 보간 결과
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

        // 서버 값은 그대로 저장 (보간은 RAF에서)
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
   * RAF Loop (핵심 로직)
   * ========================= */

  useEffect(() => {
    let rafId: number

    const rafLoop = () => {
      const target = targetRef.current
      if (target) {
        const now = performance.now()
        const dt = Math.min((now - lastTsRef.current) / 1000, 0.1)
        lastTsRef.current = now

        const alpha = Math.min(dt * 12, 1)
        const prev = smoothRef.current

        smoothRef.current = {
          ...target,

          // 위치·속도는 부드럽게
          altitude:
            typeof prev.altitude === "number" &&
            typeof target.altitude === "number"
              ? lerp(prev.altitude, target.altitude, alpha)
              : target.altitude,

          speed:
            typeof prev.speed === "number" && typeof target.speed === "number"
              ? lerp(prev.speed, target.speed, alpha)
              : target.speed,

          // roll / pitch는 일반 보간
          roll:
            typeof prev.roll === "number" && typeof target.roll === "number"
              ? lerp(prev.roll, target.roll, alpha)
              : target.roll,

          pitch:
            typeof prev.pitch === "number" && typeof target.pitch === "number"
              ? lerp(prev.pitch, target.pitch, alpha)
              : target.pitch,

          // 🔥 yaw만 각속도 제한 보간
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
    }, 80)

    return () => clearInterval(id)
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