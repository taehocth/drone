import { useState } from "react"
import { NaverMap } from "@/components/Map/NaverMap"
import { UavMiniCard } from "@/components/Dashboard/UavMiniCard"
import { WeatherInfoCard } from "@/components/Dashboard/WeatherInfoCard"
// import { DroneNewsBanner } from "@/components/Dashboard/DroneNewsBanner"

// ⛔ 잘못된 named import 제거
// import { UavCard } from "./UavCard"
// ✅ default import로 변경해야 정상 동작
import { UavCard } from "./UavCard"

import DroneSimulation, { DroneData } from "./DroneSimulation"

import { RealtimeCBMStatusCard } from "@/components/Dashboard/RealtimeCBMStatusCard"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { MapPin, Cloud, Activity, AlertTriangle } from "lucide-react"
import { ConnectionsType } from "@/enum"

// ==========================
// 기본 지도 설정
// ==========================
const DEFAULT_MAP_OPTIONS = {
  zoom: 11,
  center: { lat: 36.7881, lng: 126.4664 },
  gestureHandling: "greedy",
  disableDefaultUI: true,
}

// ==========================
// 샘플 드론 데이터
// ==========================
const uavs = [
  {
    id: "drone-001",
    name: "드론 1호",
    status: ConnectionsType.Connected,
    battery: 87,
    altitude: 120,
    speed: 15.2,
    location: { lat: 37.5665, lng: 126.978 },
    flightData: [
      { time: "09:00", altitude: 50, speed: 10, battery: 100 },
      { time: "09:15", altitude: 120, speed: 15, battery: 95 },
      { time: "09:30", altitude: 150, speed: 18, battery: 90 },
      { time: "09:45", altitude: 130, speed: 16, battery: 85 },
      { time: "10:00", altitude: 100, speed: 12, battery: 80 },
    ],
    lastUpdate: "2분 전",
  },
  {
    id: "drone-002",
    name: "드론 2호",
    status: ConnectionsType.Connecting,
    battery: 92,
    altitude: 0,
    speed: 0,
    location: { lat: 37.5635, lng: 126.98 },
    flightData: [
      { time: "09:00", altitude: 60, speed: 8, battery: 45 },
      { time: "09:15", altitude: 75, speed: 10, battery: 40 },
      { time: "09:30", altitude: 90, speed: 14, battery: 35 },
      { time: "09:45", altitude: 85, speed: 13, battery: 30 },
      { time: "10:00", altitude: 85, speed: 12.8, battery: 23 },
    ],
    lastUpdate: "5분 전",
  },
  {
    id: "drone-003",
    name: "드론 3호",
    status: ConnectionsType.Disconnected,
    battery: 23,
    altitude: 85,
    speed: 12.8,
    location: { lat: 37.5695, lng: 126.975 },
    flightData: [
      { time: "09:00", altitude: 45, speed: 12, battery: 25 },
      { time: "09:15", altitude: 30, speed: 8, battery: 20 },
      { time: "09:30", altitude: 15, speed: 5, battery: 15 },
      { time: "09:45", altitude: 5, speed: 2, battery: 10 },
      { time: "10:00", altitude: 0, speed: 0, battery: 5 },
    ],
    lastUpdate: "1분 전",
  },
  {
    id: "drone-004",
    name: "드론 4호",
    status: ConnectionsType.Disconnected,
    battery: 5,
    altitude: 0,
    speed: 0,
    location: { lat: 37.5615, lng: 126.982 },
    flightData: [
      { time: "09:00", altitude: 0, speed: 0, battery: 100 },
      { time: "09:15", altitude: 0, speed: 0, battery: 98 },
      { time: "09:30", altitude: 0, speed: 0, battery: 96 },
      { time: "09:45", altitude: 0, speed: 0, battery: 94 },
      { time: "10:00", altitude: 0, speed: 0, battery: 92 },
    ],
    lastUpdate: "15분 전",
  },
]

// ==========================
// UAV Dashboard Component
// ==========================
export function UavDashboard() {
  const [selectedUav, setSelectedUav] = useState(uavs[0])
  const [clickedCoordinates, setClickedCoordinates] = useState<{
    nx: number
    ny: number
  } | null>(null)

  const [droneConnected, setDroneConnected] = useState(false)
  const [droneData, setDroneData] = useState<DroneData | null>(null)

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              드론 대시보드
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              실시간 드론 상태 모니터링 및 비행 관리 시스템
            </p>
          </div>
        </div>
      </div>

      {/* 드론 미니 카드 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {uavs.map((uav) => (
          <UavMiniCard
            key={uav.id}
            uav={uav}
            isSelected={selectedUav.id === uav.id}
            onClick={() => setSelectedUav(uav)}
          />
        ))}
      </div>

      {/* 드론 위치 + 상세 정보 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="gap-0 pb-0 transition-all duration-300 hover:scale-[1.01] hover:shadow-xl lg:col-span-2">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-500 p-2">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>드론 위치</CardTitle>
                <CardDescription>실시간 드론 위치 및 비행 경로</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="aspect-video overflow-hidden rounded-b-lg">
              <NaverMap
                lat={DEFAULT_MAP_OPTIONS.center.lat}
                lng={DEFAULT_MAP_OPTIONS.center.lng}
                onMapClick={(nx, ny) => setClickedCoordinates({ nx, ny })}
              />
            </div>
          </CardContent>
        </Card>

        {/* 상세 카드 */}
        <UavCard uav={selectedUav} />
      </div>

      {/* 실시간 시뮬레이션 + 기상 정보 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-indigo-500 p-2">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                드론 실시간 시뮬레이션
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                연결된 드론의 자세, 속도, 배터리 및 위치를 실시간으로
                모니터링합니다.
              </p>
            </div>
          </div>
          <DroneSimulation
            onConnectionChange={setDroneConnected}
            onDataChange={setDroneData}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-cyan-500 p-2">
              <Cloud className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                기상 정보
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                실시간 기상 데이터 및 비행 안전성 분석
              </p>
            </div>
          </div>
          <WeatherInfoCard clickedCoordinates={clickedCoordinates} />
        </div>
      </div>

      {/* CBM 상태 기반 정비 */}
      <div className="mt-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-500 p-2">
            <AlertTriangle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              상태 기반 정비 (CBM)
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              드론 연결 상태에 따라 실시간으로 시스템 상태를 평가합니다.
            </p>
          </div>
        </div>

        <RealtimeCBMStatusCard
          connected={droneConnected}
          droneData={
            droneData
              ? {
                  battery: droneData.battery,
                  altitude: droneData.altitude,
                  speed: droneData.speed,
                }
              : undefined
          }
        />
      </div>
    </div>
  )
}
