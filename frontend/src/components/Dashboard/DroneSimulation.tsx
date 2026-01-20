// frontend/src/components/Dashboard/DroneSimulation.tsx

import React, { useState, useRef, useEffect } from "react"
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

/* =========================
 * Utils
 * ========================= */

const radToDeg = (v?: number) =>
  typeof v === "number" ? (v * 180) / Math.PI : undefined

/* =========================
 * Component
 * ========================= */

const DroneSimulation: React.FC = () => {
  /**
   * renderData
   * - 실제로 화면에 그릴 데이터
   * - requestAnimationFrame 기준으로만 갱신됨
   */
  const [renderData, setRenderData] = useState<DroneData>({})
  const [connected, setConnected] = useState(false)

  /**
   * refs
   */
  const wsRef = useRef<WebSocket | null>(null)
  const latestDataRef = useRef<DroneData | null>(null)
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

      // 🔴 waiting 패킷은 무시
      if (typeof msg.sysid !== "number") return

      // 🔹 실제 연결 상태
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

      /**
       * 🔴 최신 데이터는 ref에만 저장
       * - 여기서는 setState ❌
       */
      latestDataRef.current = {
        sysid: msg.sysid,
        latitude: msg.position?.lat,
        longitude: msg.position?.lon,
        altitude: msg.position?.alt,
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
   * Render Loop (RAF)
   * ========================= */

  useEffect(() => {
    const loop = () => {
      if (latestDataRef.current) {
        /**
         * 🔴 화면 반영은 초당 최대 60회
         * 네트워크 수신 속도와 체감상 거의 동일
         */
        setRenderData(latestDataRef.current)
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
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
