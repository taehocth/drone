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

  droneId?: string
  lteIp?: string
  online?: boolean
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

  // ✅ 연결 대상 입력값
  const [droneIdInput, setDroneIdInput] = useState("")
  const [lteIpInput, setLteIpInput] = useState("")

  // ✅ 현재 실제 연결에 사용 중인 값
  const [activeDroneId, setActiveDroneId] = useState("")
  const [activeLteIp, setActiveLteIp] = useState("")

  const wsRef = useRef<WebSocket | null>(null)

  // WS 수신 즉시 반영(리렌더 X): targetRef
  const targetRef = useRef<DroneData | null>(null)

  // 부드러운 화면용 스무딩 값(계산용)
  const smoothRef = useRef<DroneData>({})

  // 스무딩 dt 계산용
  const lastTsRef = useRef<number>(performance.now())

  // 마지막 수신 시각
  const lastRxAtRef = useRef<number>(0)

  // 콘솔 delay 로그 샘플링
  const lastDelayLogAtRef = useRef<number>(0)

  // delay 계산 보정용
  const delayBaseRef = useRef<number | null>(null)
  const delayBaseUpdatedAtRef = useRef<number>(0)

  const resetConnectionState = () => {
    setConnected(false)
    setRenderData({})
    targetRef.current = null
    smoothRef.current = {}
    lastRxAtRef.current = 0
    delayBaseRef.current = null
    delayBaseUpdatedAtRef.current = 0
  }

  /* =========================
   * Connect / Disconnect
   * ========================= */

  const connect = () => {
    if (wsRef.current) return

    const droneId = droneIdInput.trim()
    const lteIp = lteIpInput.trim()

    if (!droneId && !lteIp) {
      console.error("❌ drone_id 또는 lte_ip 중 하나는 입력해야 함")
      return
    }

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

    const url = new URL(wsUrl)

    if (droneId) {
      url.searchParams.set("drone_id", droneId)
    } else if (lteIp) {
      url.searchParams.set("lte_ip", lteIp)
    }

    const finalWsUrl = url.toString()
    const ws = new WebSocket(finalWsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setActiveDroneId(droneId)
      setActiveLteIp(lteIp)
      console.log("✅ Telemetry WS connected:", finalWsUrl)
    }

    ws.onmessage = (event) => {
      let msg: any
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg?.ok === false) {
        console.error("❌ WS server error:", msg)
        return
      }

      if (typeof msg.sysid !== "number") return

      const vx = msg.velocity?.vx
      const vy = msg.velocity?.vy
      const speed: number | undefined =
        typeof msg.speed_m_s === "number"
          ? msg.speed_m_s
          : typeof vx === "number" && typeof vy === "number"
            ? Math.sqrt(vx * vx + vy * vy)
            : undefined

      lastRxAtRef.current = performance.now()

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

      const alt = msg.position?.alt
      const lastAlt = targetRef.current?.altitude

      if (typeof alt === "number" && typeof lastAlt === "number") {
        const jump = alt - lastAlt
        if (Math.abs(jump) >= 5) {
          console.warn("⚠️ ALT JUMP", {
            droneId: msg.drone_id,
            lteIp: msg.lte_ip,
            sysid: msg.sysid,
            alt,
            lastAlt,
            jump,
            gpsFixType: msg.gps?.fix_type,
            gpsSatellites: msg.gps?.satellites,
            rawAlt: msg.position?.alt,
            relAlt: msg.position?.relative_alt,
            amslAlt: msg.position?.amsl_alt,
            source: msg.source,
            server_ts: msg.server_ts,
          })
        }
      }

      targetRef.current = {
        droneId: msg.drone_id,
        lteIp: msg.lte_ip,
        online: typeof msg.online === "boolean" ? msg.online : undefined,

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

        speed,
        timestamp: msg.server_ts,
      }
    }

    ws.onerror = () => {
      console.error("❌ Telemetry WS error", {
        url: finalWsUrl,
        readyState: ws.readyState,
      })
    }

    ws.onclose = (event) => {
      console.warn(
        `🔌 Telemetry WS disconnected (code=${event.code}, reason=${event.reason || "no reason"})`,
      )
      wsRef.current = null
      setActiveDroneId("")
      setActiveLteIp("")
      resetConnectionState()
    }
  }

  const disconnect = () => {
    wsRef.current?.close()
    wsRef.current = null
    setActiveDroneId("")
    setActiveLteIp("")
    resetConnectionState()
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
   * UI Snapshot
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
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            기체 연결 대상 선택
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            drone_id 또는 LTE IP 중 하나를 입력한 뒤 연결하세요.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Drone ID
            </label>
            <input
              type="text"
              value={droneIdInput}
              onChange={(e) => setDroneIdInput(e.target.value)}
              placeholder="예: drone-001"
              disabled={connected}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              LTE IP
            </label>
            <input
              type="text"
              value={lteIpInput}
              onChange={(e) => setLteIpInput(e.target.value)}
              placeholder="예: 10.0.0.21"
              disabled={connected}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={connect}
            disabled={connected}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            연결
          </button>

          <button
            type="button"
            onClick={disconnect}
            disabled={!connected}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            연결 해제
          </button>

          <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            {connected ? (
              <span>
                연결 중:
                {activeDroneId ? ` drone_id=${activeDroneId}` : ""}
                {activeDroneId && activeLteIp ? " / " : ""}
                {activeLteIp ? ` lte_ip=${activeLteIp}` : ""}
              </span>
            ) : (
              <span>현재 연결 안 됨</span>
            )}
          </div>
        </div>
      </div>

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
