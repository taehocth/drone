import React, { useState, useRef, useEffect } from "react"
import { DroneSimulationCard } from "./DroneSimulationCard"
import { Radio } from "lucide-react"
import {
  DroneData,
  DroneWsState,
  MissionWaypoint,
  FlightStatus,
  FlightStatusBadge,
  getFlightStatus,
} from "./DroneSimulation"

/* =============================================================
 * SimDroneSimulation — 시뮬레이션(가짜 기체) 전용 컴포넌트
 * -------------------------------------------------------------
 * 기존 DroneSimulation 과 동일한 props 인터페이스를 구현.
 * WebSocket 대신 내부에서 '고도 50m · 속도 8m/s 정상 비행' 데이터를
 * 0.1초마다 생성하여 동일한 콜백(onAllDroneStates 등)으로 전달한다.
 *
 * 실제 운영 코드(DroneSimulation.tsx)는 건드리지 않으며,
 * UavDashboard 의 시뮬레이션 토글이 켜졌을 때만 이 컴포넌트로 교체된다.
 * ============================================================= */

// 정상 비행 목표값 (요청 사양)
const TARGET_ALT = 50 // m
const TARGET_SPEED = 8 // m/s

// 기은리(DM4_2) 근처 — 지도 이동용 정상 비행 경로 (사각 순회)
const FLIGHT_PATH: Array<{ lat: number; lng: number }> = [
  { lat: 36.9725, lng: 126.3765 },
  { lat: 36.9740, lng: 126.3795 },
  { lat: 36.9758, lng: 126.3788 },
  { lat: 36.9752, lng: 126.3752 },
  { lat: 36.9733, lng: 126.3748 },
]

const SIM_WAYPOINTS: MissionWaypoint[] = FLIGHT_PATH.map((p, i) => ({
  index: i,
  command: 16,
  lat: p.lat,
  lng: p.lng,
  alt: TARGET_ALT,
}))

const SIM_LABEL = "DM4_2"
const SIM_REGION = "기은리"
const SIM_LTE_IP = "121.153.47.136:51068"
const SIM_DRONE_INDEX = 1 // DRONE_LABELS 의 DM4_2 위치(0:DM4_1,1:DM4_2,...)

interface SimProps {
  onData?: (data: DroneData | null) => void
  onConnectionChange?: (connected: boolean) => void
  onAllDroneStates?: (states: DroneWsState[]) => void
  onMissionWaypoints?: (waypoints: MissionWaypoint[] | undefined) => void
  onSelectedDrone?: (drone: { idx: number | null; lteIp: string | null }) => void
  onDroneOffline?: (offline: boolean) => void
}

// 부드러운 보간
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const SimDroneSimulation: React.FC<SimProps> = ({
  onData,
  onConnectionChange,
  onAllDroneStates,
  onMissionWaypoints,
  onSelectedDrone,
  onDroneOffline,
}) => {
  const [data, setData] = useState<DroneData | null>(null)
  const tRef = useRef(0) // 경과 스텝
  const segRef = useRef(0) // 현재 경로 구간
  const segProgRef = useRef(0) // 구간 내 진행도(0~1)

  // 콜백을 ref로 잡아 effect 재실행 방지
  const cbRef = useRef({
    onData,
    onConnectionChange,
    onAllDroneStates,
    onMissionWaypoints,
    onSelectedDrone,
    onDroneOffline,
  })
  cbRef.current = {
    onData,
    onConnectionChange,
    onAllDroneStates,
    onMissionWaypoints,
    onSelectedDrone,
    onDroneOffline,
  }

  // 마운트 시: 기체 선택됨 + 미션 경로 전달 (UavDashboard 가 DM4_2 를 선택한 것처럼)
  useEffect(() => {
    cbRef.current.onSelectedDrone?.({ idx: SIM_DRONE_INDEX, lteIp: SIM_LTE_IP })
    cbRef.current.onMissionWaypoints?.(SIM_WAYPOINTS)
    cbRef.current.onConnectionChange?.(true)
    return () => {
      // 시뮬 종료 시 정리
      cbRef.current.onSelectedDrone?.({ idx: null, lteIp: null })
      cbRef.current.onConnectionChange?.(false)
      cbRef.current.onData?.(null)
    }
  }, [])

  // 0.1초마다 정상 비행 데이터 생성
  useEffect(() => {
    const id = setInterval(() => {
      const t = (tRef.current += 1)

      // 1) 이륙 구간(처음 ~3초): 고도 0→50 상승, 속도 0→8
      const rampSteps = 30
      const climbing = t <= rampSteps
      const alt = climbing
        ? lerp(0, TARGET_ALT, t / rampSteps)
        : TARGET_ALT + Math.sin(t / 25) * 0.4 // 순항 시 ±0.4m 미세 변동
      const speed = climbing
        ? lerp(0, TARGET_SPEED, t / rampSteps)
        : TARGET_SPEED + Math.sin(t / 18) * 0.15 // ±0.15m/s

      // 2) 경로 이동 (순항 시작 후): 구간을 따라 부드럽게 이동
      let lat = FLIGHT_PATH[0].lat
      let lng = FLIGHT_PATH[0].lng
      if (!climbing) {
        segProgRef.current += 0.006 // 구간 진행 속도
        if (segProgRef.current >= 1) {
          segProgRef.current = 0
          segRef.current = (segRef.current + 1) % FLIGHT_PATH.length
        }
        const a = FLIGHT_PATH[segRef.current]
        const b = FLIGHT_PATH[(segRef.current + 1) % FLIGHT_PATH.length]
        lat = lerp(a.lat, b.lat, segProgRef.current)
        lng = lerp(a.lng, b.lng, segProgRef.current)
      }

      // 3) 자세 — 정상 범주 안에서 미세 변동 (deg)
      const roll = Math.sin(t / 20) * 2.5 // ±2.5°
      const pitch = Math.cos(t / 22) * 2.0 // ±2.0°
      // yaw: 진행 방향 기준 천천히 회전
      const yaw = (t * 0.6) % 360

      // 4) 배터리: 100%에서 아주 천천히 감소
      const battery = Math.max(60, 100 - t * 0.03)

      const next: DroneData = {
        droneId: "drone-002",
        lteIp: SIM_LTE_IP,
        online: true,
        sysid: 2,
        altitude: alt,
        latitude: lat,
        longitude: lng,
        battery,
        gpsFixType: 6,
        gpsSatellites: 31,
        roll,
        pitch,
        yaw,
        rollInt: Math.round(roll),
        pitchInt: Math.round(pitch),
        yawInt: Math.round(yaw),
        speed,
        timestamp: new Date().toISOString(),
        missionWaypoints: SIM_WAYPOINTS,
      }

      setData(next)

      const flightStatus: FlightStatus = getFlightStatus(next)
      const wsState: DroneWsState = {
        wsConnected: true,
        droneActive: true,
        connected: true,
        data: next,
        flightStatus,
        droneOffline: false,
        lastDataAgeSec: 0,
      }

      // UavDashboard 가 기대하는 4기체 배열 — DM4_2(index1)만 활성
      const empty: DroneWsState = {
        wsConnected: false,
        droneActive: false,
        connected: false,
        data: null,
        flightStatus: "unknown",
        droneOffline: false,
        lastDataAgeSec: null,
      }
      const states = [empty, wsState, empty, empty]

      cbRef.current.onAllDroneStates?.(states)
      cbRef.current.onData?.(next)
    }, 100)

    return () => clearInterval(id)
  }, [])

  const isActive = data !== null

  return (
    <div className="space-y-4">
      {/* 연결된 기체 상태 카드 (실제 컴포넌트와 동일 톤) */}
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
              <Radio className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {SIM_LABEL}
                </span>
                <span className="text-xs text-slate-400">{SIM_REGION}</span>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              </div>
              <p className="text-xs font-medium text-emerald-600">
                텔레메트리 수신 중 (시뮬레이션)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
                <span className="font-mono">
                  🔋 {data.battery?.toFixed(0)}%
                </span>
                <span className="font-mono">
                  ↑ {data.altitude?.toFixed(0)}m
                </span>
                <span className="font-mono text-blue-500">
                  📍 WP {SIM_WAYPOINTS.length}
                </span>
              </div>
            )}
            <FlightStatusBadge status={isActive ? "flying" : "unknown"} />
          </div>
        </div>
      </div>

      <DroneSimulationCard
        data={data ?? {}}
        connected={isActive}
        onConnect={() => {}}
        onDisconnect={() => {}}
      />
    </div>
  )
}

export default SimDroneSimulation