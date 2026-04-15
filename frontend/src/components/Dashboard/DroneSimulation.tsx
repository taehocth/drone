import React, { useState, useRef, useEffect, useCallback } from "react"
import { DroneSimulationCard } from "./DroneSimulationCard"
import { Search, X, Wifi, WifiOff, Radio } from "lucide-react"

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
  keywords: string[]
}

const DRONE_TARGETS: DroneTarget[] = [
  {
    label: "DM4_1",
    port: 51067,
    lteIp: "3.36.81.238:51067",
    keywords: ["DM4_1", "dm4_1", "중왕항", "중왕", "1번"],
  },
  {
    label: "DM4_2",
    port: 51568,
    lteIp: "3.36.81.238:51568",
    keywords: ["DM4_2", "dm4_2", "기은리", "기은", "2번"],
  },
  {
    label: "DM3",
    port: 52066,
    lteIp: "3.36.81.238:52066",
    keywords: ["DM3", "dm3", "삼길포항", "삼길포", "3번"],
  },
]

// 기체 데이터가 이 시간(ms) 이상 오지 않으면 오프라인으로 판단
const DRONE_OFFLINE_TIMEOUT_MS = 5_000

/* =========================
 * 개별 드론 WS 상태
 * ========================= */
export interface DroneWsState {
  wsConnected: boolean
  droneActive: boolean
  connected: boolean
  data: DroneData | null
  flightStatus: FlightStatus
  droneOffline: boolean
  lastDataAgeSec: number | null // ★ 마지막 수신 후 경과 초
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
  const [droneOffline, setDroneOffline] = useState(false)
  const [data, setData] = useState<DroneData | null>(null)
  // ★ 마지막 수신 후 경과 초 (1초마다 갱신)
  const [lastDataAgeSec, setLastDataAgeSec] = useState<number | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const targetRef = useRef<DroneData | null>(null)
  const smoothRef = useRef<DroneData | null>(null)
  const lastTsRef = useRef<number>(performance.now())
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDataReceivedRef = useRef<number | null>(null)
  const offlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
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
    setLastDataAgeSec(null)
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

      // ★ 데이터 수신 시각 갱신 + offline 즉시 해제
      lastDataReceivedRef.current = Date.now()
      setLastDataAgeSec(0)

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

  // ★ 오프라인 감지 타이머 (2초마다 체크, 5초 무응답 시 offline)
  useEffect(() => {
    offlineTimerRef.current = setInterval(() => {
      if (!droneActiveRef.current) return
      const last = lastDataReceivedRef.current
      if (last === null) return
      const age = Date.now() - last
      if (age > DRONE_OFFLINE_TIMEOUT_MS) {
        droneActiveRef.current = false
        setDroneActive(false)
        setDroneOffline(true)
      }
    }, 2000)
    return () => {
      if (offlineTimerRef.current) clearInterval(offlineTimerRef.current)
    }
  }, [])

  // ★ 경과 시간 표시 타이머 (1초마다 갱신)
  useEffect(() => {
    ageTimerRef.current = setInterval(() => {
      const last = lastDataReceivedRef.current
      if (last === null) {
        setLastDataAgeSec(null)
        return
      }
      setLastDataAgeSec(Math.floor((Date.now() - last) / 1000))
    }, 1000)
    return () => {
      if (ageTimerRef.current) clearInterval(ageTimerRef.current)
    }
  }, [])

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

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (offlineTimerRef.current) clearInterval(offlineTimerRef.current)
      if (ageTimerRef.current) clearInterval(ageTimerRef.current)
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
    lastDataAgeSec,
  }
}

/* =========================
 * 검색으로 기체 찾기 헬퍼
 * ========================= */
function searchDrone(query: string): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const idx = DRONE_TARGETS.findIndex((d) =>
    d.keywords.some((kw) => kw.toLowerCase().includes(q)),
  )
  return idx >= 0 ? idx : null
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
  onDroneOffline?: (offline: boolean) => void
}

/* =========================
 * 상태 텍스트 헬퍼
 * ========================= */
function getStatusText(state: DroneWsState, ageSec: number | null): string {
  if (state.droneOffline) return "⚠ 기체 신호 끊김 — 재연결 대기 중"
  if (state.droneActive) {
    if (ageSec !== null && ageSec >= 3)
      return `텔레메트리 수신 중 · ${ageSec}초 전`
    return "텔레메트리 수신 중"
  }
  if (state.wsConnected) return "서버 연결됨 — 기체 응답 대기"
  return "서버 연결 중..."
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

  const [searchQuery, setSearchQuery] = useState("")
  const [searchError, setSearchError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSelectDrone = useCallback(
    (idx: number | null) => {
      setSelectedIdx(idx)
      onSelectedDrone?.({
        idx,
        lteIp: idx !== null ? DRONE_TARGETS[idx].lteIp : null,
      })
    },
    [onSelectedDrone],
  )

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchError("검색어를 입력해주세요")
      return
    }
    const found = searchDrone(q)
    if (found === null) {
      setSearchError(`"${q}"에 해당하는 기체를 찾을 수 없습니다`)
      return
    }
    setSearchError(null)
    setSearchQuery("")
    handleSelectDrone(found)
  }, [searchQuery, handleSelectDrone])

  const handleDisconnect = useCallback(() => {
    handleSelectDrone(null)
    setSearchQuery("")
    setSearchError(null)
  }, [handleSelectDrone])

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

  useEffect(() => {
    if (onDroneOffline) {
      onDroneOffline(selectedState?.droneOffline ?? false)
    }
  }, [selectedState?.droneOffline, onDroneOffline])

  const selectedDrone = selectedIdx !== null ? DRONE_TARGETS[selectedIdx] : null
  const selectedWsState = selectedIdx !== null ? allStates[selectedIdx] : null

  // ★ 상태에 따른 스타일 결정
  const cardBorderBg = selectedWsState?.droneOffline
    ? "border-red-300 bg-red-50/60"
    : selectedWsState?.droneActive
      ? "border-emerald-300 bg-emerald-50/60"
      : "border-slate-200 bg-slate-50/60"

  const iconBg = selectedWsState?.droneOffline
    ? "bg-red-100"
    : selectedWsState?.droneActive
      ? "bg-emerald-100"
      : "bg-slate-100"

  const statusTextColor = selectedWsState?.droneOffline
    ? "text-red-500"
    : selectedWsState?.droneActive
      ? selectedWsState.lastDataAgeSec !== null &&
        selectedWsState.lastDataAgeSec >= 3
        ? "text-amber-500" // 데이터가 3초 이상 안 오면 주황색으로 경고
        : "text-emerald-600"
      : "text-slate-400"

  return (
    <div className="space-y-4">
      {/* 검색 패널 */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">기체 연결</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            지역명 또는 기체명으로 검색하세요 —{" "}
            <span className="text-slate-400">
              중왕항, 기은리, 삼길포항 / DM4_1, DM4_2, DM3
            </span>
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSearchError(null)
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="기체명 또는 지역명 입력 후 Enter"
              className={[
                "w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm outline-none transition",
                searchError
                  ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                  : "border-slate-200 bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100",
              ].join(" ")}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  setSearchError(null)
                  inputRef.current?.focus()
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearch}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 active:scale-95"
          >
            검색
          </button>
        </div>

        {searchError && (
          <p className="mt-2 text-xs text-red-500">{searchError}</p>
        )}

        {!selectedDrone && !searchError && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DRONE_TARGETS.map((d, idx) => (
              <button
                key={d.lteIp}
                type="button"
                onClick={() => handleSelectDrone(idx)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
              >
                {d.label} · {d.keywords[2]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 연결된 기체 상태 카드 */}
      {selectedDrone && selectedWsState ? (
        <div
          className={`rounded-2xl border p-4 transition-all ${cardBorderBg}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* 상태 아이콘 */}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}
              >
                {selectedWsState.droneOffline ? (
                  <WifiOff className="h-5 w-5 text-red-500" />
                ) : selectedWsState.droneActive ? (
                  <Radio className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Wifi className="h-5 w-5 text-slate-400" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    {selectedDrone.label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {selectedDrone.keywords[2]}
                  </span>
                  {/* 상태 점 */}
                  {selectedWsState.droneOffline ? (
                    <span className="flex h-2 w-2">
                      <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                  ) : selectedWsState.droneActive ? (
                    <span className="flex h-2 w-2">
                      <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                  ) : null}
                </div>

                {/* ★ 상태 텍스트 — 경과 시간 포함 */}
                <p className={`text-xs font-medium ${statusTextColor}`}>
                  {getStatusText(
                    selectedWsState,
                    selectedWsState.lastDataAgeSec,
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 마지막 수신 데이터 요약 */}
              {selectedWsState.data && (
                <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
                  {selectedWsState.data.battery != null && (
                    <span className="font-mono">
                      🔋 {selectedWsState.data.battery.toFixed(0)}%
                    </span>
                  )}
                  {selectedWsState.data.altitude != null && (
                    <span className="font-mono">
                      ↑ {selectedWsState.data.altitude.toFixed(0)}m
                    </span>
                  )}
                  {(selectedWsState.data.missionWaypoints?.length ?? 0) > 0 && (
                    <span className="font-mono text-blue-500">
                      📍 WP {selectedWsState.data.missionWaypoints!.length}
                    </span>
                  )}
                </div>
              )}

              <FlightStatusBadge
                status={
                  selectedWsState.droneActive
                    ? selectedWsState.flightStatus
                    : "unknown"
                }
              />

              <button
                type="button"
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
                해제
              </button>
            </div>
          </div>

          {/* ★ 오프라인 배지 — 끊긴 시각 표시 */}
          {selectedWsState.droneOffline && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-100/60 px-3 py-2 text-xs text-red-700">
              <span className="font-semibold">기체 신호 없음</span> — 마지막
              수신 후{" "}
              {selectedWsState.lastDataAgeSec !== null
                ? `${selectedWsState.lastDataAgeSec}초 경과`
                : "시간 측정 불가"}
              . 기체 전원과 LTE 연결을 확인하세요.
            </div>
          )}

          {/* ★ 연결은 됐지만 데이터가 느릴 때 경고 (3~5초 지연) */}
          {!selectedWsState.droneOffline &&
            selectedWsState.droneActive &&
            selectedWsState.lastDataAgeSec !== null &&
            selectedWsState.lastDataAgeSec >= 3 &&
            selectedWsState.lastDataAgeSec <
              DRONE_OFFLINE_TIMEOUT_MS / 1000 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700">
                데이터 지연 감지 — 마지막 수신 {selectedWsState.lastDataAgeSec}
                초 전. LTE 신호를 확인하세요.
              </div>
            )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
          <Radio className="mx-auto mb-2 h-8 w-8 text-slate-200" />
          <p className="text-sm font-medium text-slate-400">
            관제할 기체를 검색해서 연결하세요
          </p>
          <p className="mt-1 text-xs text-slate-300">
            한 번에 하나의 기체만 관제합니다
          </p>
        </div>
      )}

      {/* 드론 텔레메트리 카드 */}
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
