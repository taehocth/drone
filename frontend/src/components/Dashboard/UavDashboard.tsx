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
    ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
    : "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* 헤더 */}
        <div className="rounded-2xl border border-slate-200/60 bg-slate-100/70 p-6 shadow-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/60">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-sm">
                  <Activity className="h-5 w-5" />
                </span>
                <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
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
              <div className="rounded-xl border border-slate-200/60 bg-slate-100/60 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/60">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  배터리
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {droneData ? `${droneData.battery}%` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-slate-100/60 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/60">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  고도
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {droneData ? `${droneData.altitude}m` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-slate-100/60 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/60">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  속도
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {droneData ? `${droneData.speed}m/s` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-slate-100/60 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/60">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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

        {/* 운영 상태 요약 */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/60 bg-slate-100/60 px-5 py-3 text-sm text-slate-600 shadow-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/60 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              운영 상태
            </span>
            <span>비행 모드: {droneData ? "AUTO" : "-"}</span>
            <span>위성: {droneData ? "12" : "-"}</span>
            <span>링크 품질: {droneConnected ? "양호" : "-"}</span>
            <span>마지막 업데이트: {droneData ? "방금" : "-"}</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>알림</span>
            <span className="rounded-full bg-slate-900/10 px-2 py-1 text-slate-600 dark:bg-white/10 dark:text-slate-200">
              이상 없음
            </span>
          </div>
        </div>

        {/* Gemini AI 채팅 */}
        <GeminiChatCard />

        {/* 드론 위치 */}
        <Card className="gap-0 overflow-hidden border-slate-200/60 bg-slate-100/60 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/60">
          <CardHeader className="border-b border-slate-200/60 bg-slate-100/80 dark:border-slate-800/60 dark:bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500 p-2 shadow-sm">
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
              <div className="rounded-xl bg-indigo-500 p-2 shadow-sm">
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
            <div className="rounded-2xl border border-slate-200/60 bg-slate-100/60 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/60">
              <DroneSimulation />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-500 p-2 shadow-sm">
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
            <div className="rounded-2xl border border-slate-200/60 bg-slate-100/60 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/60">
              <WeatherInfoCard clickedCoordinates={clickedCoordinates} />
            </div>
          </div>
        </div>

        {/* CBM 상태 기반 정비 */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-500 p-2 shadow-sm">
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

          <div className="rounded-2xl border border-slate-200/60 bg-slate-100/60 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/60">
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
