import React, { useState, useRef, useEffect, useCallback } from "react"
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
 * 비행 상태 판단
 * speed > 1 m/s 이면 "비행중"
 * ========================= */
export type FlightStatus = "flying" | "grounded" | "unknown"

export function getFlightStatus(data: DroneData | null): FlightStatus {
  if (!data) return "unknown"
  if (typeof data.speed === "number") {
    return data.speed > 1 ? "flying" : "grounded"
  }
  return "unknown"
}

/* =========================
 * Drone 목록 정의
 * ========================= */

interface DroneTarget {
  label: string
  port: number
  lteIp: string
}

const DRONE_TARGETS: DroneTarget[] = [
  { label: "DM4_1(중왕항)", port: 51067, lteIp: "3.36.81.238:51067" },
  { label: "DM4_2(기은리)", port: 51568, lteIp: "3.36.81.238:51568" },
  { label: "DM3(삼길포항)", port: 51066, lteIp: "3.36.81.238:51066" },
]

/* =========================
 * 개별 드론 WS 상태 (3개 동시)
 *
 * wsConnected  : WebSocket 서버 소켓 연결 여부 (onopen 기준)
 * droneActive  : 기체 텔레메트리 데이터가 실제로 수신되고 있는지
 *                (sysid가 있는 메시지가 한 번이라도 왔을 때 true,
 *                 no_data 응답 또는 소켓 닫힘 시 false)
 * ========================= */
interface DroneWsState {
  wsConnected: boolean // 서버 소켓 연결됨
  droneActive: boolean // 기체 데이터 수신 중
  connected: boolean // 하위 호환용 (droneActive와 동일)
  data: DroneData | null
  flightStatus: FlightStatus
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
  else
    throw new Error(
      "Telemetry WS URL must start with ws://, wss://, http://, or https://",
    )
  const hasWsPath =
    u.pathname === WS_PATH ||
    u.pathname.endsWith("/api/v1/qgc/ws/qgc") ||
    u.pathname.endsWith("/qgc/ws/qgc") ||
    u.pathname.endsWith("/ws/qgc")
  const origin = `${wsProtocol}//${u.host}`
  const finalUrl = new URL(hasWsPath ? u.pathname : WS_PATH, origin)
  return finalUrl.toString()
}

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
 * 비행 상태 뱃지 컴포넌트
 * ========================= */
export function FlightStatusBadge({ status }: { status: FlightStatus }) {
  if (status === "flying") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        비행중
      </span>
    )
  }
  if (status === "grounded") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        비행 아님
      </span>
    )
  }
  // unknown
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-400 dark:bg-slate-800 dark:text-slate-500">
      <span className="h-2 w-2 rounded-full bg-slate-300" />—
    </span>
  )
}

/* =========================
 * 단일 드론 WS 훅
 * ========================= */
function useDroneWs(drone: DroneTarget): DroneWsState {
  const [wsConnected, setWsConnected] = useState(false) // 서버 소켓 연결됨
  const [droneActive, setDroneActive] = useState(false) // 기체 데이터 실제 수신 중
  const [data, setData] = useState<DroneData | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const targetRef = useRef<DroneData | null>(null)
  const smoothRef = useRef<DroneData>({})
  const lastTsRef = useRef<number>(performance.now())
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (wsRef.current) return

    const TELEMETRY_WS_BASE = getTelemetryEnvBase()
    if (!TELEMETRY_WS_BASE) return

    let wsUrl: string
    try {
      wsUrl = buildTelemetryWsUrl(TELEMETRY_WS_BASE)
    } catch {
      return
    }

    const url = new URL(wsUrl)
    url.searchParams.set("lte_ip", drone.lteIp)
    const ws = new WebSocket(url.toString())
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setWsConnected(true)
      // 소켓이 열려도 기체 데이터가 올 때까지 droneActive는 false 유지
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      let msg: any
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg?.ok === false) {
        if (msg?.error === "no_data") {
          // 서버는 연결됐지만 해당 기체 데이터 없음
          targetRef.current = null
          smoothRef.current = {}
          setDroneActive(false)
          setData(null)
        }
        return
      }

      // sysid가 없는 메시지는 기체 데이터로 보지 않음
      if (typeof msg.sysid !== "number") return

      // 여기까지 왔으면 진짜 기체 데이터 수신 중
      setDroneActive(true)

      const vx = msg.velocity?.vx
      const vy = msg.velocity?.vy
      const speed: number | undefined =
        typeof msg.speed_m_s === "number"
          ? msg.speed_m_s
          : typeof vx === "number" && typeof vy === "number"
            ? Math.sqrt(vx * vx + vy * vy)
            : undefined

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

    ws.onerror = () => {}

    ws.onclose = () => {
      wsRef.current = null
      if (!mountedRef.current) return
      setWsConnected(false)
      setDroneActive(false)
      setData(null)
      targetRef.current = null
      smoothRef.current = {}
      // 5초 후 자동 재연결
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, 5000)
    }
  }, [drone.lteIp])

  // RAF 스무딩
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

  // UI 스냅샷 (20Hz)
  useEffect(() => {
    const id = window.setInterval(
      () => {
        const next = smoothRef.current
        if (!next || Object.keys(next).length === 0) return
        setData({
          ...next,
          rollInt: next.roll != null ? Math.round(next.roll) : undefined,
          pitchInt: next.pitch != null ? Math.round(next.pitch) : undefined,
          yawInt: next.yaw != null ? Math.round(next.yaw) : undefined,
        })
      },
      Math.round(1000 / 20),
    )
    return () => window.clearInterval(id)
  }, [])

  // 마운트 시 연결
  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  const flightStatus = getFlightStatus(data)
  return {
    wsConnected,
    droneActive,
    connected: droneActive, // 하위 호환: UavDashboard의 connected 체크에 사용
    data,
    flightStatus,
  }
}

/* =========================
 * Props
 * ========================= */
interface DroneSimulationProps {
  onData?: (data: DroneData | null) => void
  onConnectionChange?: (connected: boolean) => void
  /** 3개 기체 전체 상태를 상위로 전달 (종합 위젯용) */
  onAllDroneStates?: (states: DroneWsState[]) => void
}

/* =========================
 * Component
 * ========================= */
const DroneSimulation: React.FC<DroneSimulationProps> = ({
  onData,
  onConnectionChange,
  onAllDroneStates,
}) => {
  // 3개 WS 동시 연결
  const drone0 = useDroneWs(DRONE_TARGETS[0])
  const drone1 = useDroneWs(DRONE_TARGETS[1])
  const drone2 = useDroneWs(DRONE_TARGETS[2])

  const allStates = [drone0, drone1, drone2]

  // 선택된 기체 (텔레메트리 카드에 표시할 기체)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  const selectedState = selectedIdx !== null ? allStates[selectedIdx] : null

  // 상위 콜백
  useEffect(() => {
    if (onAllDroneStates) onAllDroneStates(allStates)
  }, [drone0, drone1, drone2]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (onConnectionChange)
      onConnectionChange(selectedState?.connected ?? false)
  }, [selectedState?.connected, onConnectionChange])

  useEffect(() => {
    if (onData) onData(selectedState?.data ?? null)
  }, [selectedState?.data, onData])

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

        {/* ── 기체 카드 3개 (모두 동시 연결, 비행중/아님 표시) ── */}
        <div className="grid grid-cols-3 gap-3">
          {DRONE_TARGETS.map((drone, idx) => {
            const state = allStates[idx]
            const isSelected = selectedIdx === idx
            const { wsConnected, droneActive, flightStatus } = state

            // 카드 테두리/배경: 기체 데이터 수신 중일 때만 초록
            const cardClass = droneActive
              ? isSelected
                ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                : "border-emerald-300 bg-emerald-50/50 hover:border-emerald-400 dark:border-emerald-700 dark:bg-emerald-950/20"
              : isSelected
                ? "border-slate-500 bg-slate-50 dark:border-slate-400 dark:bg-slate-800/60"
                : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500 dark:hover:bg-slate-800/40"

            // 우상단 점: 기체 데이터 수신 중 → 초록 ping, 서버만 연결 → 회색 점, 끊김 → 없음
            const dotEl = droneActive ? (
              <span className="absolute right-3 top-3 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            ) : wsConnected ? (
              <span className="absolute right-3 top-3 flex h-2 w-2">
                <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
              </span>
            ) : null

            // 상태 텍스트
            const statusText = droneActive
              ? "기체 수신 중"
              : wsConnected
                ? "서버 연결됨 (기체 없음)"
                : "연결 중..."

            return (
              <button
                key={drone.lteIp}
                type="button"
                onClick={() => setSelectedIdx(isSelected ? null : idx)}
                className={[
                  "relative flex flex-col items-start rounded-xl border px-4 py-3 text-left transition-all",
                  cardClass,
                ].join(" ")}
              >
                {dotEl}

                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {drone.label}
                </span>
                <span className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                  :{drone.port}
                </span>

                {/* 연결 상태 텍스트 */}
                <span
                  className={`mt-0.5 text-xs ${droneActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}
                >
                  {statusText}
                </span>

                {/* ★ 비행중 / 비행 아님 뱃지 — 기체 데이터 있을 때만 의미 있음 */}
                <div className="mt-2">
                  <FlightStatusBadge
                    status={droneActive ? flightStatus : "unknown"}
                  />
                </div>

                {/* 선택 표시 */}
                {isSelected && (
                  <span className="absolute bottom-2 right-3 text-xs font-semibold text-indigo-500 dark:text-indigo-400">
                    선택됨
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── 안내 문구 ── */}
        <div className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          {selectedIdx !== null ? (
            <span>
              선택된 기체:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {DRONE_TARGETS[selectedIdx].label}
              </span>{" "}
              — 아래 텔레메트리 카드에 표시됩니다
            </span>
          ) : (
            <span>
              기체 카드를 클릭하면 아래에 상세 텔레메트리가 표시됩니다
            </span>
          )}
        </div>
      </div>

      {/* ── 드론 상태 (선택된 기체의 텔레메트리) ── */}
      <DroneSimulationCard
        data={selectedState?.data ?? {}}
        connected={selectedState?.connected ?? false}
        onConnect={() => {}}
        onDisconnect={() => {}}
      />
    </div>
  )
}

export default DroneSimulation
export type { DroneWsState }
