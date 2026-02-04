import React, { useState, useRef, useEffect } from "react"
import { DroneSimulationCard } from "./DroneSimulationCard"

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
  wsAgeMs?: number
  sysid?: number
}

const radToDeg = (v?: number) =>
  typeof v === "number" ? (v * 180) / Math.PI : undefined

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const DroneSimulation: React.FC = () => {
  const [renderData, setRenderData] = useState<DroneData>({})
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const targetRef = useRef<DroneData | null>(null)
  const smoothRef = useRef<DroneData>({})
  const lastTsRef = useRef<number>(performance.now())

  const connect = () => {
    if (wsRef.current) return

    const base =
      import.meta.env.VITE_TELEMETRY_WS_URL ||
      import.meta.env.VITE_API_URL ||
      "http://localhost:8000"

    const wsUrl = `${base.replace(/^http/, "ws")}/api/v1/qgc/ws/qgc`
    console.log("📡 WS:", wsUrl)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (!msg.sysid) return

      setConnected(true)

      const wsAgeMs = msg.ws_ts
        ? Date.now() - new Date(msg.ws_ts).getTime()
        : undefined

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

        roll: radToDeg(msg.attitude?.roll),
        pitch: radToDeg(msg.attitude?.pitch),
        yaw: radToDeg(msg.attitude?.yaw), // 🔥 즉각 반영

        speed,
        wsAgeMs,
      }
    }

    ws.onclose = ws.onerror = () => {
      wsRef.current = null
      targetRef.current = null
      smoothRef.current = {}
      setConnected(false)
    }
  }

  const disconnect = () => {
    wsRef.current?.close()
    wsRef.current = null
  }

  /* RAF loop */
  useEffect(() => {
    let raf: number
    const loop = () => {
      const t = targetRef.current
      if (t) {
        const now = performance.now()
        const dt = Math.min((now - lastTsRef.current) / 1000, 0.1)
        lastTsRef.current = now

        const alpha = Math.min(dt * 15, 1) // 🚀 더 빠른 반응

        const prev = smoothRef.current
        smoothRef.current = {
          ...t,
          // 🚀 중요 데이터는 즉시 반영 (지연 최소화)
          altitude: t.altitude,
          speed: t.speed,
          battery: t.battery,
          // 🎮 자세는 부드럽게 보간
          roll:
            prev.roll && t.roll ? lerp(prev.roll, t.roll, alpha) : t.roll,
          pitch:
            prev.pitch && t.pitch ? lerp(prev.pitch, t.pitch, alpha) : t.pitch,
          yaw: t.yaw,
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* UI snapshot */
  useEffect(() => {
    const id = setInterval(() => {
      const d = smoothRef.current
      if (!d.sysid) return
      setRenderData({
        ...d,
        rollInt: d.roll && Math.round(d.roll),
        pitchInt: d.pitch && Math.round(d.pitch),
        yawInt: d.yaw && Math.round(d.yaw),
      })
    }, 33) // 🚀 30Hz UI (더 빠른 반응)

    return () => clearInterval(id)
  }, [])

  return (
    <div className="p-6">
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