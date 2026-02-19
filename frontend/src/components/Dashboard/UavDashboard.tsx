import { useState } from "react"
import { NaverMap } from "@/components/Map/NaverMap"
import { WeatherInfoCard } from "@/components/Dashboard/WeatherInfoCard"

import DroneSimulation, { DroneData } from "./DroneSimulation"

import { RealtimeCBMStatusCard } from "@/components/Dashboard/RealtimeCBMStatusCard"
import { GeminiChatCard } from "@/components/Dashboard/GeminiChatCard"

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

  const [droneConnected] = useState(false)
  const [droneData] = useState<DroneData | null>(null)

  const connectionLabel = droneConnected ? "연결됨" : "연결 대기"
  const connectionTone = droneConnected
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
    : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 dark:from-slate-950 dark:to-slate-900 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* 헤더 */}
        <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/60">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-lg">
                  <Activity className="h-5 w-5" />
                </span>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  드론 관제 센터
                </h1>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${connectionTone}`}
                >
                  {connectionLabel}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                실시간 비행 데이터, 기상, 상태 기반 정비를 한 화면에서
                관리합니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/60">
                <p className="text-xs font-semibold text-slate-500">
                  배터리
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {droneData ? `${droneData.battery}%` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/60">
                <p className="text-xs font-semibold text-slate-500">
                  고도
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {droneData ? `${droneData.altitude}m` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/60">
                <p className="text-xs font-semibold text-slate-500">
                  속도
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {droneData ? `${droneData.speed}m/s` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/60">
                <p className="text-xs font-semibold text-slate-500">
                  좌표
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {clickedCoordinates
                    ? `${clickedCoordinates.nx}, ${clickedCoordinates.ny}`
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Gemini AI 채팅 */}
        <GeminiChatCard />

        {/* 드론 위치 */}
        <Card className="gap-0 overflow-hidden border-slate-200/70 bg-white/80 shadow-md backdrop-blur transition-all duration-300 hover:shadow-xl dark:border-slate-800/70 dark:bg-slate-900/60">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500 p-2 shadow-lg">
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
              <div className="rounded-xl bg-indigo-500 p-2 shadow-lg">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  기체 실시간 정보
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  연결된 드론의 자세, 속도, 배터리 및 위치를 실시간으로
                  모니터링합니다.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-md backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/60">
              <DroneSimulation />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-500 p-2 shadow-lg">
                <Cloud className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  기상 정보
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  실시간 기상 데이터 및 비행 안전성 분석
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-md backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/60">
              <WeatherInfoCard clickedCoordinates={clickedCoordinates} />
            </div>
          </div>
        </div>

        {/* CBM 상태 기반 정비 */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-500 p-2 shadow-lg">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                상태 기반 정비 (CBM)
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                드론 연결 상태에 따라 실시간으로 시스템 상태를 평가합니다.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-md backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/60">
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
      </div>
    </div>
  )
}
