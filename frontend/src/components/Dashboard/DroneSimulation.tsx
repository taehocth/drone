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
  gpsFixType?: number
  gpsSatellites?: number

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

function buildTelemetryWsUrl(rawBase: string) {
  const WS_PATH = "/api/v1/qgc/ws/qgc"

  const base = rawBase.trim()
  if (!base) throw new Error("VITE_TELEMETRY_WS_URL is empty")

  const u = new URL(base)

  let wsProtocol: "ws:" | "wss:"
  if (u.protocol === "http:") wsProtocol = "ws:"
  else if (u.protocol === "https:") wsProtocol = "wss:"
  else if (u.protocol === "ws:" || u.protocol === "wss:")
    wsProtocol = u.protocol
  else {
    throw new Error(
      "Telemetry WS URL must start with ws://, wss://, http://, or https://",
    )
  }

  const hasWsPath =
    u.pathname === WS_PATH ||
    u.pathname.endsWith("/api/v1/qgc/ws/qgc") ||
    u.pathname.endsWith("/qgc/ws/qgc") ||
    u.pathname.endsWith("/ws/qgc")

  const origin = `${wsProtocol}//${u.host}`
  const finalUrl = new URL(hasWsPath ? u.pathname : WS_PATH, origin)
  return finalUrl.toString()
}

/* =========================
 * Env Getter
 * ========================= */

function getTelemetryEnvBase(): string | null {
  const v = import.meta.env.VITE_TELEMETRY_WS_URL as unknown

  if (v == null) return null
  if (typeof v !== "string") return null

  const trimmed = v.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === "undefined") return null
  if (trimmed.toLowerCase() === "null") return null

  return trimmed
}

/* =========================
 * Component
 * ========================= */

interface DroneSimulationProps {
  onData?: (data: DroneData | null) => void
  onConnectionChange?: (connected: boolean) => void
}

const DroneSimulation: React.FC<DroneSimulationProps> = ({
  onData,
  onConnectionChange,
}) => {
  const [renderData, setRenderData] = useState<DroneData>({})
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)

  // WS 수신 즉시 반영(리렌더 X): targetRef
  const targetRef = useRef<DroneData | null>(null)

  // 부드러운 화면용 스무딩 값(계산용) — speed는 여기서 스무딩하지 않음
  const smoothRef = useRef<DroneData>({})

  // 스무딩 dt 계산용
  const lastTsRef = useRef<number>(performance.now())

  // "마지막 수신 시각" (UI 신뢰도/지연 체감 개선에 사용)
  const lastRxAtRef = useRef<number>(0)

  // 콘솔 delay 로그 샘플링(DevTools 오버헤드 줄이기)
  const lastDelayLogAtRef = useRef<number>(0)

  // delay 계산 보정용 (client clock skew 대응)
  const delayBaseRef = useRef<number | null>(null)
  const delayBaseUpdatedAtRef = useRef<number>(0)

  /* =========================
   * Connect / Disconnect
   * ========================= */

  const connect = () => {
    if (wsRef.current) return

    const TELEMETRY_WS_BASE = getTelemetryEnvBase()
    if (!TELEMETRY_WS_BASE) {
      console.error("❌ VITE_TELEMETRY_WS_URL is missing or empty", {
        value: import.meta.env.VITE_TELEMETRY_WS_URL,
        mode: import.meta.env.MODE,
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

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      console.log("✅ Telemetry WS connected:", wsUrl)
    }

    ws.onmessage = (event) => {
      let msg: any
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (typeof msg.sysid !== "number") return

      // ✅ 속력: 서버가 계산한 speed_m_s 우선 사용, 없으면 vx/vy로 fallback
      // → 이중 계산 제거, 소스 통일로 값 불일치 방지
      const vx = msg.velocity?.vx
      const vy = msg.velocity?.vy
      const speed: number | undefined =
        typeof msg.speed_m_s === "number"
          ? msg.speed_m_s
          : typeof vx === "number" && typeof vy === "number"
            ? Math.sqrt(vx * vx + vy * vy)
            : undefined

      // 수신 시각 기록
      lastRxAtRef.current = performance.now()

      // server_ts 기반 delay 로그 (1초에 1번만)
      if (msg.server_ts) {
        const nowPerf = performance.now()
        if (nowPerf - lastDelayLogAtRef.current >= 1000) {
          lastDelayLogAtRef.current = nowPerf

          const serverMs = new Date(msg.server_ts).getTime()
          if (!Number.isFinite(serverMs)) return

          const raw = Date.now() - serverMs

          const BASE_RECALIBRATE_MS = 30_000
          const nowWall = Date.now()

          if (
            delayBaseRef.current == null ||
            raw < delayBaseRef.current ||
            nowWall - delayBaseUpdatedAtRef.current > BASE_RECALIBRATE_MS
          ) {
            delayBaseRef.current = raw
            delayBaseUpdatedAtRef.current = nowWall
          }
        }
      }

      // ALT JUMP DEBUG LOG (5m 이상 점프)
      const alt = msg.position?.alt
      const lastAlt = targetRef.current?.altitude

      if (typeof alt === "number" && typeof lastAlt === "number") {
        const jump = alt - lastAlt
        if (Math.abs(jump) >= 5) {
          console.warn("⚠️ ALT JUMP", {
            sysid: msg.sysid,
            alt,
            lastAlt,
            jump,
            gpsFixType: msg.gps?.fix_type,
            gpsSatellites: msg.gps?.satellites,
            rawAlt: msg.position?.alt,
            relAlt: msg.position?.rel_alt,
            amslAlt: msg.position?.amsl_alt,
            baroAlt: msg.baro?.alt,
            source: msg.position?.source,
            server_ts: msg.server_ts,
          })
        }
      }

      // ref만 갱신 (리렌더는 setInterval에서 담당)
      targetRef.current = {
        sysid: msg.sysid,
        altitude: msg.position?.alt,
        latitude: msg.position?.lat,
        longitude: msg.position?.lon,
        battery: msg.battery?.remaining,
        gpsFixType:
          typeof msg.gps?.fix_type === "number" ? msg.gps.fix_type : undefined,
        gpsSatellites:
          typeof msg.gps?.satellites === "number"
            ? msg.gps.satellites
            : undefined,

        roll: radToDeg(msg.attitude?.roll),
        pitch: radToDeg(msg.attitude?.pitch),
        yaw: radToDeg(msg.attitude?.yaw),

        // ✅ 스무딩 없이 수신값 그대로 저장 (RAF에서 스무딩 적용 안 함)
        speed,
        timestamp: msg.server_ts,
      }
    }

    ws.onerror = () => {
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
      lastRxAtRef.current = 0
      delayBaseRef.current = null
      delayBaseUpdatedAtRef.current = 0
    }
  }

  const disconnect = () => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    targetRef.current = null
    smoothRef.current = {}
    lastRxAtRef.current = 0
    delayBaseRef.current = null
    delayBaseUpdatedAtRef.current = 0
  }

  /* =========================
   * RAF Loop (Smoothing)
   *  - altitude, roll, pitch, yaw만 스무딩
   *  - speed는 스무딩 없이 수신값 즉시 반영 (딜레이 제거)
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

          // ✅ speed: 스무딩 제거 — target 값 즉시 반영
          // lerp를 적용하면 약 300ms 지연이 생기므로 제거
          speed: target.speed,

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
   * UI Snapshot (throttled at 20Hz)
   *  - setState를 50ms 간격으로 제한
   * ========================= */

  useEffect(() => {
    const UI_HZ = 20
    const UI_INTERVAL_MS = Math.round(1000 / UI_HZ)

    const id = window.setInterval(() => {
      const next = smoothRef.current

      if (!next || Object.keys(next).length === 0) return

      setRenderData({
        ...next,
        rollInt: next.roll != null ? Math.round(next.roll) : undefined,
        pitchInt: next.pitch != null ? Math.round(next.pitch) : undefined,
        yawInt: next.yaw != null ? Math.round(next.yaw) : undefined,
      })
    }, UI_INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!onConnectionChange) return
    onConnectionChange(connected)
  }, [connected, onConnectionChange])

  useEffect(() => {
    if (!onData) return
    if (!connected) {
      onData(null)
      return
    }
    if (!renderData || Object.keys(renderData).length === 0) {
      onData(null)
      return
    }
    onData(renderData)
  }, [connected, renderData, onData])

  /* =========================
   * Render
   * ========================= */

  return (
    <div className="space-y-6">
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
