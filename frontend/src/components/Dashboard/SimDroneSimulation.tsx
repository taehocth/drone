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
 * WebSocket 대신 내부에서 데이터를 0.1초마다 생성하여 동일한
 * 콜백(onAllDroneStates 등)으로 전달한다.
 *
 * scenario prop:
 *   "normal"  — 정상 비행 (고도 50m·속도 8m/s, 배터리 서서히 감소)
 *   "battery" — 배터리 급감 (25% 이하로 빠르게 하강 → 위험 알람/모달/RTL)
 *   "gps"     — GPS 상실 (위성 수 급감 <10 → GPS 위험 알람)
 *
 * 실제 운영 코드(DroneSimulation.tsx)는 건드리지 않으며,
 * UavDashboard 의 시뮬레이션 토글이 켜졌을 때만 이 컴포넌트로 교체된다.
 * ============================================================= */

export type SimScenario = "normal" | "battery" | "gps"

// 정상 비행 목표값
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

const SCENARIO_META: Record<
  SimScenario,
  { label: string; tone: string; desc: string }
> = {
  normal: {
    label: "정상 비행",
    tone: "emerald",
    desc: "텔레메트리 수신 중 (시뮬레이션)",
  },
  battery: {
    label: "배터리 위험 시나리오",
    tone: "red",
    desc: "배터리 급감 재현 중 (시뮬레이션)",
  },
  gps: {
    label: "GPS 상실 시나리오",
    tone: "red",
    desc: "GPS 위성 급감 재현 중 (시뮬레이션)",
  },
}

interface SimProps {
  scenario?: SimScenario
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
  scenario = "normal",
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

  // 시나리오가 바뀌면 시뮬레이션을 처음부터 다시 시작
  const scenarioRef = useRef<SimScenario>(scenario)

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

  // 시나리오 변경 시: 타이머/진행도 리셋 (같은 기체로 상황만 전환)
  useEffect(() => {
    scenarioRef.current = scenario
    tRef.current = 0
    segRef.current = 0
    segProgRef.current = 0
  }, [scenario])

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

  // 0.1초마다 데이터 생성
  useEffect(() => {
    const id = setInterval(() => {
      const t = (tRef.current += 1)
      const sc = scenarioRef.current

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
      const yaw = (t * 0.6) % 360

      // ── 4) 시나리오별 배터리 / GPS 위성 ────────────────────
      // 기본값 (정상)
      let battery = Math.max(60, 100 - t * 0.03) // 100%에서 아주 천천히 감소
      let gpsSatellites = 31
      let gpsFixType = 6
      let latitude: number | undefined = lat
      let longitude: number | undefined = lng

      if (sc === "battery") {
        // 배터리 급감: 100%에서 시작해 빠르게 하강.
        // 순항 진입(rampSteps) 후부터 초당 약 3%씩 감소 → 약 25초 만에 위험(25%) 도달.
        // 위험 구간에서는 15% 부근에서 바닥을 유지(계속 위험 유지).
        const afterClimb = Math.max(0, t - rampSteps)
        battery = Math.max(12, 100 - afterClimb * 0.3)
      } else if (sc === "gps") {
        // GPS 상실: 순항 진입 후 위성 수가 급격히 감소.
        // 31 → 약 20초에 걸쳐 6개 아래로 떨어져 위험 유지.
        const afterClimb = Math.max(0, t - rampSteps)
        gpsSatellites = Math.max(4, Math.round(31 - afterClimb * 0.14))
        // 위성이 위험 수준으로 떨어지면 fix 품질도 하락, 위치도 소실 처리
        if (gpsSatellites < 10) {
          gpsFixType = 1 // No fix
          latitude = undefined
          longitude = undefined
        }
      }

      const next: DroneData = {
        droneId: "drone-002",
        lteIp: SIM_LTE_IP,
        online: true,
        sysid: 2,
        altitude: alt,
        latitude,
        longitude,
        battery,
        gpsFixType,
        gpsSatellites,
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
  const meta = SCENARIO_META[scenario]
  const isDanger = scenario !== "normal"

  return (
    <div className="space-y-4">
      {/* 연결된 기체 상태 카드 (시나리오에 따라 톤 변경) */}
      <div
        className={`rounded-2xl border p-4 ${
          isDanger
            ? "border-red-300 bg-red-50/60"
            : "border-emerald-300 bg-emerald-50/60"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                isDanger ? "bg-red-100" : "bg-emerald-100"
              }`}
            >
              <Radio
                className={`h-5 w-5 ${isDanger ? "text-red-600" : "text-emerald-600"}`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {SIM_LABEL}
                </span>
                <span className="text-xs text-slate-400">{SIM_REGION}</span>
                <span className="relative flex h-2 w-2">
                  <span
                    className={`absolute inline-flex h-2 w-2 animate-ping rounded-full opacity-75 ${
                      isDanger ? "bg-red-400" : "bg-emerald-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      isDanger ? "bg-red-500" : "bg-emerald-500"
                    }`}
                  />
                </span>
              </div>
              <p
                className={`text-xs font-medium ${
                  isDanger ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {meta.desc}
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
                  📡 {data.gpsSatellites}위성
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