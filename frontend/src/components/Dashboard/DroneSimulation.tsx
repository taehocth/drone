import React, { useState, useRef, useEffect, useCallback } from "react"
import { DroneSimulationCard } from "./DroneSimulationCard"

/* =========================
 * Types
 * ========================= */

export interface MissionWaypoint {
  index: number
  command: number
  lat: number
  lng: number
  alt: number
}

export interface QgcFlightEvent {
  type: string
  level: "danger" | "caution" | "success" | "info" | "debug"
  message: string
  time: string
  detail?: string
  index?: number
  severity?: number
}

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

  missionWaypoints?: MissionWaypoint[]
}

/* =========================
 * 비행 상태 판단
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
  { label: "DM3(삼길포항)", port: 52066, lteIp: "3.36.81.238:52066" },
]

// ★ 기체 데이터가 이 시간(ms) 이상 오지 않으면 연결 끊김으로 판단
const DRONE_OFFLINE_TIMEOUT_MS = 10_000

/* =========================
 * 개별 드론 WS 상태
 * ========================= */
export interface DroneWsState {
  wsConnected: boolean
  droneActive: boolean
  connected: boolean
  data: DroneData | null
  flightStatus: FlightStatus
  // ★ 추가: 기체 연결 끊김 여부 (타임아웃 감지)
  droneOffline: boolean
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        비행 아님
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
      <span className="h-2 w-2 rounded-full bg-slate-300" />—
    </span>
  )
}

/* =========================
 * 단일 드론 WS 훅
 * ========================= */
function useDroneWs(drone: DroneTarget): DroneWsState {
  const [wsConnected, setWsConnected] = useState(false)
  const [droneActive, setDroneActive] = useState(false)
  // ★ 기체 데이터 타임아웃으로 인한 오프라인 상태
  const [droneOffline, setDroneOffline] = useState(false)
  const [data, setData] = useState<DroneData | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const targetRef = useRef<DroneData | null>(null)
  const smoothRef = useRef<DroneData | null>(null)
  const lastTsRef = useRef<number>(performance.now())
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ★ 마지막 데이터 수신 시각 (타임아웃 감지용)
  const lastDataReceivedRef = useRef<number | null>(null)
  const offlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const droneActiveRef = useRef(false)
  const clearingRef = useRef(false)

  const clearDroneData = useCallback(() => {
    clearingRef.current = true
    targetRef.current = null
    smoothRef.current = null
    droneActiveRef.current = false
    lastDataReceivedRef.current = null
    setDroneActive(false)
    setDroneOffline(false)
    setData(null)
    requestAnimationFrame(() => {
      clearingRef.current = false
    })
  }, [])

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
      clearDroneData()
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
        if (msg?.error === "no_data") clearDroneData()
        return
      }

      if (typeof msg.sysid !== "number") return
      if (!msg.lte_ip || msg.lte_ip !== drone.lteIp) return

      // ★ 데이터 수신 시각 갱신 → 오프라인 해제
      lastDataReceivedRef.current = Date.now()
      if (droneOffline) setDroneOffline(false)

      droneActiveRef.current = true
      setDroneActive(true)
      setDroneOffline(false)

      const vx = msg.velocity?.vx
      const vy = msg.velocity?.vy
      const speed: number | undefined =
        typeof msg.speed_m_s === "number"
          ? msg.speed_m_s
          : typeof vx === "number" && typeof vy === "number"
            ? Math.sqrt(vx * vx + vy * vy)
            : undefined

      const incomingWps =
        Array.isArray(msg.mission_waypoints) && msg.mission_waypoints.length > 0
          ? (msg.mission_waypoints as MissionWaypoint[])
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
        missionWaypoints: incomingWps ?? targetRef.current?.missionWaypoints,
      }

      if (Array.isArray(msg.flight_events) && msg.flight_events.length > 0) {
        window.dispatchEvent(
          new CustomEvent("qgcFlightEvents", {
            detail: {
              events: msg.flight_events as QgcFlightEvent[],
              droneId: msg.drone_id,
              lteIp: msg.lte_ip,
            },
          }),
        )
      }
    }

    ws.onerror = () => {}

    ws.onclose = () => {
      wsRef.current = null
      if (!mountedRef.current) return
      setWsConnected(false)
      clearDroneData()
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, 5000)
    }
  }, [drone.lteIp, clearDroneData, droneOffline])

  // ★ 타임아웃 감지 폴링 — 마지막 수신으로부터 DRONE_OFFLINE_TIMEOUT_MS 초과 시 오프라인 처리
  useEffect(() => {
    offlineTimerRef.current = setInterval(() => {
      if (!droneActiveRef.current) return
      const last = lastDataReceivedRef.current
      if (last === null) return
      const age = Date.now() - last
      if (age > DRONE_OFFLINE_TIMEOUT_MS) {
        // 타임아웃 → 오프라인 상태로 전환
        droneActiveRef.current = false
        setDroneActive(false)
        setDroneOffline(true)
        // 마지막 데이터는 유지 (화면에 마지막 값 + 경고 표시용)
      }
    }, 2000) // 2초마다 체크
    return () => {
      if (offlineTimerRef.current) clearInterval(offlineTimerRef.current)
    }
  }, [])

  // RAF 스무딩
  useEffect(() => {
    let rafId: number
    const rafLoop = () => {
      if (
        clearingRef.current ||
        !droneActiveRef.current ||
        !targetRef.current
      ) {
        smoothRef.current = null
        rafId = requestAnimationFrame(rafLoop)
        return
      }
      const target = targetRef.current
      const now = performance.now()
      const dt = Math.min((now - lastTsRef.current) / 1000, 0.1)
      lastTsRef.current = now
      const alpha = Math.min(dt * 20, 1)
      const prev = smoothRef.current

      smoothRef.current = {
        ...target,
        altitude:
          prev?.altitude != null && target.altitude != null
            ? lerp(prev.altitude, target.altitude, alpha)
            : target.altitude,
        speed: target.speed,
        roll:
          prev?.roll != null && target.roll != null
            ? lerp(prev.roll, target.roll, alpha)
            : target.roll,
        pitch:
          prev?.pitch != null && target.pitch != null
            ? lerp(prev.pitch, target.pitch, alpha)
            : target.pitch,
        yaw:
          prev?.yaw != null && target.yaw != null
            ? smoothYaw(prev.yaw, target.yaw, dt, 120)
            : target.yaw,
        missionWaypoints: target.missionWaypoints,
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
        if (clearingRef.current) {
          setData(null)
          return
        }
        const next = smoothRef.current
        if (!next) {
          setData((prev) => (prev === null ? null : null))
          return
        }
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
      if (offlineTimerRef.current) clearInterval(offlineTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  const flightStatus = getFlightStatus(data)
  return {
    wsConnected,
    droneActive,
    connected: droneActive,
    data,
    flightStatus,
    droneOffline,
  }
}

/* =========================
 * Props
 * ========================= */
interface DroneSimulationProps {
  onData?: (data: DroneData | null) => void
  onConnectionChange?: (connected: boolean) => void
  onAllDroneStates?: (states: DroneWsState[]) => void
  onMissionWaypoints?: (waypoints: MissionWaypoint[] | undefined) => void
  onSelectedDrone?: (drone: {
    idx: number | null
    lteIp: string | null
  }) => void
  // ★ 추가: 기체 오프라인 상태 변경 콜백
  onDroneOffline?: (offline: boolean) => void
}

/* =========================
 * Component
 * ========================= */
const DroneSimulation: React.FC<DroneSimulationProps> = ({
  onData,
  onConnectionChange,
  onAllDroneStates,
  onMissionWaypoints,
  onSelectedDrone,
  onDroneOffline,
}) => {
  const drone0 = useDroneWs(DRONE_TARGETS[0])
  const drone1 = useDroneWs(DRONE_TARGETS[1])
  const drone2 = useDroneWs(DRONE_TARGETS[2])

  const allStates = [drone0, drone1, drone2]

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const selectedState = selectedIdx !== null ? allStates[selectedIdx] : null

  useEffect(() => {
    if (onAllDroneStates) onAllDroneStates(allStates)
  }, [drone0, drone1, drone2]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (onConnectionChange)
      onConnectionChange(selectedState?.connected ?? false)
  }, [selectedState?.connected, onConnectionChange])

  useEffect(() => {
    if (onData)
      onData(selectedState?.droneActive ? (selectedState?.data ?? null) : null)
  }, [selectedState?.data, selectedState?.droneActive, onData])

  useEffect(() => {
    if (onMissionWaypoints) {
      onMissionWaypoints(selectedState?.data?.missionWaypoints)
    }
  }, [selectedState?.data?.missionWaypoints, onMissionWaypoints]) // eslint-disable-line react-hooks/exhaustive-deps

  // ★ 선택된 기체의 오프라인 상태를 UavDashboard로 전달
  useEffect(() => {
    if (onDroneOffline) {
      onDroneOffline(selectedState?.droneOffline ?? false)
    }
  }, [selectedState?.droneOffline, onDroneOffline])

  const handleSelectDrone = (idx: number, isSelected: boolean) => {
    const newIdx = isSelected ? null : idx
    setSelectedIdx(newIdx)
    onSelectedDrone?.({
      idx: newIdx,
      lteIp: newIdx !== null ? DRONE_TARGETS[newIdx].lteIp : null,
    })
  }

  return (
    <div className="space-y-6">
      {/* 기체 선택 패널 */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">기체 선택</h3>
          <p className="mt-1 text-xs text-slate-500">
            연결할 기체를 선택한 뒤 조회 시작을 누르세요. 연결 중에 다른 기체를
            선택하면 자동으로 전환됩니다.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {DRONE_TARGETS.map((drone, idx) => {
            const state = allStates[idx]
            const isSelected = selectedIdx === idx
            const { wsConnected, droneActive, flightStatus, droneOffline } =
              state

            // ★ 오프라인 시 카드 스타일 별도 처리
            const cardClass = droneOffline
              ? isSelected
                ? "border-red-400 bg-red-50"
                : "border-red-300 bg-red-50/50 hover:border-red-400"
              : droneActive
                ? isSelected
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-emerald-300 bg-emerald-50/50 hover:border-emerald-400"
                : isSelected
                  ? "border-slate-500 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"

            // ★ 오프라인 시 붉은 점 깜빡임
            const dotEl = droneOffline ? (
              <span className="absolute right-3 top-3 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
            ) : droneActive ? (
              <span className="absolute right-3 top-3 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            ) : wsConnected ? (
              <span className="absolute right-3 top-3 flex h-2 w-2">
                <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-300" />
              </span>
            ) : null

            // ★ 상태 텍스트
            const statusText = droneOffline
              ? "⚠ 기체 신호 끊김"
              : droneActive
                ? "기체 수신 중"
                : wsConnected
                  ? "서버 연결됨 (기체 없음)"
                  : "연결 중..."

            const statusColor = droneOffline
              ? "text-red-500 font-semibold"
              : droneActive
                ? "text-emerald-600"
                : "text-slate-400"

            const wpCount = state.data?.missionWaypoints?.length ?? 0

            return (
              <button
                key={drone.lteIp}
                type="button"
                onClick={() => handleSelectDrone(idx, isSelected)}
                className={[
                  "relative flex flex-col items-start rounded-xl border px-4 py-3 text-left transition-all",
                  cardClass,
                ].join(" ")}
              >
                {dotEl}
                <span className="text-sm font-semibold text-slate-900">
                  {drone.label}
                </span>
                <span className="mt-1 font-mono text-xs text-slate-500">
                  :{drone.port}
                </span>
                <span className={`mt-0.5 text-xs ${statusColor}`}>
                  {statusText}
                </span>

                {/* ★ 오프라인 경고 배지 */}
                {droneOffline && (
                  <span className="mt-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                    연결 끊김
                  </span>
                )}

                {(droneActive || droneOffline) && state.data && (
                  <div className="mt-1.5 flex gap-2 text-xs text-slate-500">
                    {state.data.battery != null && (
                      <span className="font-mono">
                        🔋 {state.data.battery.toFixed(0)}%
                      </span>
                    )}
                    {state.data.altitude != null && (
                      <span className="font-mono">
                        ↑ {state.data.altitude.toFixed(0)}m
                      </span>
                    )}
                    {wpCount > 0 && (
                      <span className="font-mono text-blue-500">
                        📍 WP {wpCount}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-2">
                  <FlightStatusBadge
                    status={droneActive ? flightStatus : "unknown"}
                  />
                </div>

                {isSelected && (
                  <span className="absolute bottom-2 right-3 text-xs font-semibold text-indigo-500">
                    선택됨
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-3 text-xs text-slate-400">
          {selectedIdx !== null ? (
            <span>
              선택된 기체:{" "}
              <span className="font-semibold text-slate-700">
                {DRONE_TARGETS[selectedIdx].label}
              </span>{" "}
              — 아래 텔레메트리 카드에 표시됩니다
              {allStates[selectedIdx].droneOffline && (
                <span className="ml-2 font-semibold text-red-500">
                  ⚠ 기체 신호 끊김 — 재연결 대기 중
                </span>
              )}
              {!allStates[selectedIdx].droneActive &&
                !allStates[selectedIdx].droneOffline && (
                  <span className="ml-2 text-amber-500">
                    ⚠ 기체 데이터 없음
                  </span>
                )}
            </span>
          ) : (
            <span>
              기체 카드를 클릭하면 아래에 상세 텔레메트리가 표시됩니다
            </span>
          )}
        </div>
      </div>

      {/* 드론 상태 카드 */}
      <DroneSimulationCard
        data={selectedState?.droneActive ? (selectedState?.data ?? {}) : {}}
        connected={selectedState?.droneActive ?? false}
        onConnect={() => {}}
        onDisconnect={() => {}}
      />
    </div>
  )
}

export default DroneSimulation
