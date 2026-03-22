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
 * Drone 목록 정의
 *
 * [변경 사항]
 * 기존: drone_id / lte_ip 텍스트 직접 입력
 * 변경: 포트 3개를 카드로 고정 표시, 클릭하여 선택
 *
 * lteIp 값이 agent.py의 LTE_IP 환경변수와 일치해야 함
 * agent.py에서 LTE_IP=3.36.81.238:51067 형태로 설정
 * ========================= */

interface DroneTarget {
  label: string // UI 표시 이름
  port: number // 포트 번호 (표시용)
  lteIp: string // WS 쿼리 파라미터로 전달될 값 (포트 포함)
}

const DRONE_TARGETS: DroneTarget[] = [
  { label: "기체 1", port: 51067, lteIp: "3.36.81.238:51067" },
  { label: "기체 2", port: 51568, lteIp: "3.36.81.238:51568" },
  { label: "기체 3", port: 51066, lteIp: "3.36.81.238:51066" },
]

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

  // [변경] 선택된 기체 인덱스 (null = 미선택)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  // 현재 연결된 기체 정보
  const [activeLteIp, setActiveLteIp] = useState("")

  const wsRef = useRef<WebSocket | null>(null)
  const targetRef = useRef<DroneData | null>(null)
  const smoothRef = useRef<DroneData>({})
  const lastTsRef = useRef<number>(performance.now())
  const lastRxAtRef = useRef<number>(0)
  const lastDelayLogAtRef = useRef<number>(0)
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

  const connect = (idx?: number) => {
    if (wsRef.current) return

    // [변경] 인자로 받은 idx 우선, 없으면 state의 selectedIdx 사용
    const targetIdx = idx !== undefined ? idx : selectedIdx
    if (targetIdx === null || targetIdx === undefined) {
      console.error("❌ 기체를 먼저 선택하세요")
      return
    }

    const drone = DRONE_TARGETS[targetIdx]
    if (!drone) return

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
    // [변경] lte_ip에 포트 포함된 값 전달 (예: 3.36.81.238:51067)
    url.searchParams.set("lte_ip", drone.lteIp)

    const finalWsUrl = url.toString()
    const ws = new WebSocket(finalWsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setActiveLteIp(drone.lteIp)
      console.log(`✅ Telemetry WS connected [${drone.label}]:`, finalWsUrl)
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
      setActiveLteIp("")
      resetConnectionState()
    }
  }

  const disconnect = () => {
    wsRef.current?.close()
    wsRef.current = null
    setActiveLteIp("")
    resetConnectionState()
  }

  /* =========================
   * [변경] 기체 카드 클릭 핸들러
   * - 미연결 상태: 선택만 함
   * - 연결 중 상태: 기존 연결 해제 후 새 기체 연결
   * ========================= */
  const handleSelectDrone = (idx: number) => {
    if (connected) {
      // 이미 선택된 기체를 다시 클릭하면 무시
      if (selectedIdx === idx) return
      // 다른 기체 선택 시 기존 연결 끊고 새로 연결
      wsRef.current?.close()
      wsRef.current = null
      setActiveLteIp("")
      resetConnectionState()
      setSelectedIdx(idx)
      // 약간의 딜레이 후 연결 (close 처리 대기)
      setTimeout(() => connect(idx), 100)
    } else {
      setSelectedIdx(idx)
    }
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
   * UI Snapshot (20Hz)
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
      {/* ── 기체 선택 패널 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            기체 선택
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            연결할 기체를 선택한 뒤 조회 시작을 누르세요. 연결 중에 다른 기체를
            선택하면 자동으로 전환됩니다.
          </p>
        </div>

        {/* ── 기체 카드 3개 ── */}
        <div className="grid grid-cols-3 gap-3">
          {DRONE_TARGETS.map((drone, idx) => {
            const isSelected = selectedIdx === idx
            const isActive = connected && activeLteIp === drone.lteIp

            return (
              <button
                key={drone.lteIp}
                type="button"
                onClick={() => handleSelectDrone(idx)}
                className={[
                  "relative flex flex-col items-start rounded-xl border px-4 py-3 text-left transition-all",
                  isActive
                    ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                    : isSelected
                      ? "border-slate-500 bg-slate-50 dark:border-slate-400 dark:bg-slate-800/60"
                      : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500 dark:hover:bg-slate-800/40",
                ].join(" ")}
              >
                {/* 연결 중 표시 */}
                {isActive && (
                  <span className="absolute right-3 top-3 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                )}

                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {drone.label}
                </span>
                <span className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                  :{drone.port}
                </span>
                <span className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  {isActive ? "연결됨" : isSelected ? "선택됨" : "대기 중"}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── 조회 버튼 ── */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => connect()}
            disabled={connected || selectedIdx === null}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            조회 시작
          </button>

          <button
            type="button"
            onClick={disconnect}
            disabled={!connected}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            조회 해제
          </button>

          <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            {connected ? (
              <span>조회 중: lte_ip={activeLteIp}</span>
            ) : (
              <span>현재 조회 안 됨</span>
            )}
          </div>
        </div>
      </div>

      {/* ── 텔레메트리 카드 ── */}
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
