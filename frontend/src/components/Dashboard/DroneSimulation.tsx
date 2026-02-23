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
 * WS URL Builder
 * ========================= */

/**
 * VITE_TELEMETRY_WS_URL을 "base"로 받아서
 * 항상 /api/v1/qgc/ws/qgc 경로로 안전하게 합친 뒤 ws/wss로 보정한다.
 *
 * ✅ 허용 입력 예:
 * - wss://drone-5-2qlc.onrender.com
 * - https://drone-5-2qlc.onrender.com
 * - wss://ws.my-domain.com/api/v1/qgc/ws/qgc
 * - http://49.50.138.219:8000
 * - https://49.50.138.219
 *
 * ⚠️ 주의:
 * - 배포(https) 페이지에서 ws://는 Mixed Content로 차단될 수 있음.
 */
function buildTelemetryWsUrl(rawBase: string) {
  const WS_PATH = "/api/v1/qgc/ws/qgc"

  const base = rawBase.trim()
  if (!base) throw new Error("VITE_TELEMETRY_WS_URL is empty")

  // 1) URL 파싱 (스킴 필수)
  const u = new URL(base)

  // 2) ws/wss 프로토콜로 정규화
  //    - http:  -> ws:
  //    - https: -> wss:
  //    - ws/wss -> 그대로
  //    - 그 외  -> 에러
  let wsProtocol: "ws:" | "wss:"
  if (u.protocol === "http:") wsProtocol = "ws:"
  else if (u.protocol === "https:") wsProtocol = "wss:"
  else if (u.protocol === "ws:" || u.protocol === "wss:") wsProtocol = u.protocol
  else {
    throw new Error(
      "Telemetry WS URL must start with ws://, wss://, http://, or https://",
    )
  }

  // 3) base에 이미 WS 경로가 들어있는지 판별
  const hasWsPath =
    u.pathname === WS_PATH ||
    u.pathname.endsWith("/api/v1/qgc/ws/qgc") ||
    u.pathname.endsWith("/qgc/ws/qgc") ||
    u.pathname.endsWith("/ws/qgc")

  // 4) 최종 URL 조합 (host는 유지, pathname만 결정)
  //    new URL(path, origin) 을 쓰면 슬래시 이슈가 사라짐
  const origin = `${wsProtocol}//${u.host}`
  const finalUrl = new URL(hasWsPath ? u.pathname : WS_PATH, origin)

  // 필요하면 query/hash 유지 (일단은 u.search/u.hash는 기본적으로 비움)
  // finalUrl.search = u.search
  // finalUrl.hash = u.hash

  return finalUrl.toString()
}

/* =========================
 * Env Getter (오해 방지 + 방어코드)
 * ========================= */

function getTelemetryEnvBase(): string | null {
  // Vite는 빌드 시점 주입이므로 런타임에 바뀌지 않음.
  const v = import.meta.env.VITE_TELEMETRY_WS_URL as unknown

  // 1) 진짜 undefined/null
  if (v == null) return null

  // 2) 문자열이 아닌 경우 방어
  if (typeof v !== "string") return null

  const trimmed = v.trim()

  // 3) 빈 문자열 / "undefined" / "null" 같은 실수 입력 방어
  if (!trimmed) return null
  if (trimmed.toLowerCase() === "undefined") return null
  if (trimmed.toLowerCase() === "null") return null

  return trimmed
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

    const TELEMETRY_WS_BASE = getTelemetryEnvBase()

    // ✅ 여기 로그는 "is not defined"가 아니라 "missing/empty"로 명확히
    if (!TELEMETRY_WS_BASE) {
      console.error("❌ VITE_TELEMETRY_WS_URL is missing or empty in import.meta.env", {
        value: import.meta.env.VITE_TELEMETRY_WS_URL,
        mode: import.meta.env.MODE,
        prod: import.meta.env.PROD,
      })
      return
    }

    let wsUrl: string
    try {
      wsUrl = buildTelemetryWsUrl(TELEMETRY_WS_BASE)
    } catch (err) {
      console.error("❌ Invalid VITE_TELEMETRY_WS_URL:", TELEMETRY_WS_BASE, err)
      return
    }

    console.log("🔧 Telemetry WS Base =", TELEMETRY_WS_BASE)
    console.log("📡 FINAL Telemetry WS URL =", wsUrl)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("✅ Telemetry WS connected:", wsUrl)
      setConnected(true)
    }

    ws.onmessage = (event) => {
      let msg: any
      try {
        msg = JSON.parse(event.data)
      } catch {
        console.warn("⚠️ Telemetry WS message JSON parse failed:", event.data)
        return
      }

      if (typeof msg.sysid !== "number") return

      const vx = msg.velocity?.vx
      const vy = msg.velocity?.vy
      const speed =
        typeof vx === "number" && typeof vy === "number"
          ? Math.sqrt(vx * vx + vy * vy) * 3.6
          : undefined

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

    ws.onerror = () => {
      // readyState: 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED
      console.error("❌ Telemetry WS error", {
        url: wsUrl,
        readyState: ws.readyState,
      })
    }

    ws.onclose = (event) => {
      console.warn(
        `🔌 Telemetry WS disconnected (code=${event.code}, reason=${event.reason || "no reason"})`,
      )
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
   * RAF Loop (Smoothing)
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
      const next = smoothRef.current

      setRenderData({
        ...next,
        rollInt: next.roll != null ? Math.round(next.roll) : undefined,
        pitchInt: next.pitch != null ? Math.round(next.pitch) : undefined,
        yawInt: next.yaw != null ? Math.round(next.yaw) : undefined,
      })

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