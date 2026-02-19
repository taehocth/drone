import { useState } from "react"
import { NaverMap } from "@/components/Map/NaverMap"
import { WeatherInfoCard } from "@/components/Dashboard/WeatherInfoCard"

import DroneSimulation, { DroneData } from "./DroneSimulation"

import { RealtimeCBMStatusCard } from "@/components/Dashboard/RealtimeCBMStatusCard"
import { FlightReviewAnalyzerCard } from "@/components/Dashboard/FlightReviewAnalyzerCard"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { MapPin, Cloud, Activity, AlertTriangle } from "lucide-react"

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
// UAV Dashboard Component
// ==========================
export function UavDashboard() {
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

      {/* 비행 로그 분석 */}
      <FlightReviewAnalyzerCard />

      {/* 드론 위치 */}
      <Card className="gap-0 pb-0 transition-all duration-300 hover:scale-[1.01] hover:shadow-xl">
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

      {/* 실시간 시뮬레이션 + 기상 정보 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-indigo-500 p-2">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                기체 실시간 정보
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                연결된 드론의 자세, 속도, 배터리 및 위치를 실시간으로
                모니터링합니다.
              </p>
            </div>
          </div>
          <DroneSimulation />
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
