import { useEffect, useState } from "react"
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

import { MapPin, Cloud, Activity, AlertTriangle, ArrowUp } from "lucide-react"

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
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showAlertDetails, setShowAlertDetails] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 320)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const connectionLabel = droneConnected ? "연결됨" : "연결 대기"
  const connectionTone = droneConnected
    ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
    : "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"

  const alerts = (() => {
    if (!droneConnected) return []

    if (!droneData) {
      return [
        {
          id: "waiting",
          level: "caution",
          label: "데이터 수신 대기",
        },
      ] as const
    }

    const next: Array<{
      id: string
      level: "safe" | "caution" | "danger"
      label: string
    }> = []

    if (typeof droneData.battery === "number") {
      if (droneData.battery <= 20) {
        next.push({
          id: "battery",
          level: "danger",
          label: `배터리 낮음 (${droneData.battery.toFixed(0)}%)`,
        })
      } else if (droneData.battery <= 35) {
        next.push({
          id: "battery",
          level: "caution",
          label: `배터리 주의 (${droneData.battery.toFixed(0)}%)`,
        })
      }
    }

    if (typeof droneData.altitude === "number") {
      if (droneData.altitude > 150) {
        next.push({
          id: "altitude",
          level: "danger",
          label: `고도 초과 (${droneData.altitude.toFixed(0)}m)`,
        })
      } else if (droneData.altitude > 120) {
        next.push({
          id: "altitude",
          level: "caution",
          label: `고도 주의 (${droneData.altitude.toFixed(0)}m)`,
        })
      }
    }

    if (typeof droneData.speed === "number") {
      if (droneData.speed > 35) {
        next.push({
          id: "speed",
          level: "danger",
          label: `과속 위험 (${droneData.speed.toFixed(0)}m/s)`,
        })
      } else if (droneData.speed > 25) {
        next.push({
          id: "speed",
          level: "caution",
          label: `과속 주의 (${droneData.speed.toFixed(0)}m/s)`,
        })
      }
    }

    const hasGps =
      typeof droneData.latitude === "number" &&
      typeof droneData.longitude === "number"
    if (!hasGps) {
      next.push({
        id: "gps",
        level: "caution",
        label: "GPS 신호 약함",
      })
    }

    if (droneData.timestamp) {
      const lastAt = new Date(droneData.timestamp).getTime()
      if (!Number.isNaN(lastAt)) {
        const ageMs = Date.now() - lastAt
        if (ageMs > 15000) {
          next.push({
            id: "stale",
            level: "danger",
            label: "데이터 지연 15초+",
          })
        } else if (ageMs > 8000) {
          next.push({
            id: "stale",
            level: "caution",
            label: "데이터 지연 8초+",
          })
        }
      }
    }

    return next
  })()

  const alertLevel = alerts.some((alert) => alert.level === "danger")
    ? "danger"
    : alerts.some((alert) => alert.level === "caution")
      ? "caution"
      : "safe"

  const alertTone =
    alertLevel === "danger"
      ? "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-300"
      : alertLevel === "caution"
        ? "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"

  return (
    <div className="relative min-h-screen overflow-x-hidden scroll-smooth p-4 text-slate-900 md:p-6 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-10 lg:space-y-12">
        {/* Gemini AI 채팅 */}
        <div className="rounded-[30px] border border-transparent bg-transparent p-4 shadow-none ring-0">
          <GeminiChatCard />
        </div>

        {/* 헤더 */}
        <div className="relative overflow-hidden rounded-[32px] border border-transparent bg-transparent p-6 shadow-none ring-0 transition-all duration-300">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_60%)] dark:bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.12),transparent_60%)]" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-500 to-sky-500 text-white shadow-sm">
                  <Activity className="h-5 w-5" />
                </span>
                <div>
                  <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                    드론 관제 센터
                  </h1>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400/90 dark:text-slate-400">
                    Drone Operations Hub
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${connectionTone}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                    </span>
                    {connectionLabel}
                  </span>
                </span>
              </div>
              <p className="mt-3 max-w-2xl text-sm text-slate-600/90 dark:text-slate-300">
                실시간 비행 데이터, 기상, 상태 기반 정비를 한 화면에서
                관리합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 운영 상태 요약 */}
        {/* <div className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/60 bg-white/85 px-5 py-3 text-sm text-slate-600 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.35)] backdrop-blur-md ring-1 ring-white/70 transition-all duration-300 dark:border-slate-800/60 dark:bg-slate-900/80 dark:text-slate-300 dark:ring-slate-800/70">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              운영 상태
            </span>
            <span>비행 모드: {droneData ? "AUTO" : "-"}</span>
            <span>위성: {droneData ? "12" : "-"}</span>
            <span>링크 품질: {droneConnected ? "양호" : "-"}</span>
            <span>마지막 업데이트: {droneData ? "방금" : "-"}</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            <span>알림</span>
            <button
              type="button"
              onClick={() =>
                setShowAlertDetails((prev) => (alerts.length ? !prev : prev))
              }
              className={`rounded-full px-3 py-1 transition ${alertTone} ${alerts.length ? "hover:opacity-80" : ""}`}
              aria-expanded={showAlertDetails}
              aria-label="알림 상세 보기"
            >
              {alerts.length ? `${alerts.length}건 감지` : "이상 없음"}
            </button>
          </div>
        </div> */}

        {/* 드론 위치 */}
        <Card className="gap-0 overflow-hidden rounded-[30px] border-transparent bg-transparent shadow-none ring-0 transition-all duration-300">
          <CardHeader className="border-b border-transparent bg-transparent">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 p-2 shadow-sm">
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
                dronePosition={
                  droneData &&
                  typeof droneData.latitude === "number" &&
                  typeof droneData.longitude === "number"
                    ? {
                        lat: droneData.latitude,
                        lng: droneData.longitude,
                        yaw: droneData.yawInt,
                        satellites: droneData.gpsSatellites,
                      }
                    : undefined
                }
                onMapClick={(nx, ny) => setClickedCoordinates({ nx, ny })}
              />
            </div>
          </CardContent>
        </Card>

        {/* 실시간 시뮬레이션 + 기상 정보 */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 p-2 shadow-sm">
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
            <div className="rounded-[28px] border border-transparent bg-transparent p-4 shadow-none ring-0 transition-all duration-300">
              <DroneSimulation
                onConnectionChange={setDroneConnected}
                onData={setDroneData}
              />
            </div>

            {/* 실시간 비행 모니터링 임계값 알림 */}
            <div className="rounded-[28px] border border-transparent bg-transparent p-4 shadow-none ring-0 transition-all duration-300">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 p-2 shadow-sm">
                    <AlertTriangle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      실시간 비행 모니터링 임계값 알림
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      연결된 기체의 임계값 위반을 즉시 표시합니다.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setShowAlertDetails((prev) =>
                      alerts.length ? !prev : prev,
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${alertTone} ${alerts.length ? "hover:opacity-80" : ""}`}
                  aria-expanded={showAlertDetails}
                  aria-label="임계값 알림 상세 토글"
                >
                  {droneConnected
                    ? alerts.length
                      ? "주의 필요"
                      : "정상"
                    : "연결 필요"}
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {!droneConnected ? (
                  <div className="flex min-h-[96px] items-center justify-center rounded-2xl border border-dashed border-slate-200/60 bg-transparent px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700/60 dark:text-slate-300">
                    기체 연결 후 임계값 알림을 확인할 수 있습니다.
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="rounded-xl border border-emerald-200/80 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200">
                    모든 항목 정상 범위입니다.
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                        alert.level === "danger"
                          ? "border-red-200/80 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200"
                          : "border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
                      }`}
                    >
                      {alert.label}
                    </div>
                  ))
                )}
              </div>

              {showAlertDetails && alerts.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-200/60 bg-transparent px-4 py-3 text-sm text-slate-600 dark:border-slate-700/60 dark:text-slate-300">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    감지 사유
                  </p>
                  <div className="mt-2 space-y-1">
                    {alerts.map((alert) => (
                      <div
                        key={`${alert.id}-detail`}
                        className="flex items-start gap-2"
                      >
                        <span
                          className={`mt-1 h-2 w-2 rounded-full ${
                            alert.level === "danger"
                              ? "bg-red-500"
                              : "bg-amber-500"
                          }`}
                        />
                        <span>{alert.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CBM 상태 기반 정비 */}
            <div className="w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-400 p-2 shadow-sm">
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

              <div className="rounded-[26px] border border-transparent bg-transparent p-4 shadow-none ring-0 transition-all duration-300">
                <RealtimeCBMStatusCard
                  connected={droneConnected}
                  droneData={
                    droneData
                      ? {
                          battery: droneData.battery,
                          altitude: droneData.altitude,
                          speed: droneData.speed,
                          gpsFixType: droneData.gpsFixType,
                          gpsSatellites: droneData.gpsSatellites,
                        }
                      : undefined
                  }
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-500 p-2 shadow-sm">
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
            <div className="rounded-[28px] border border-transparent bg-transparent p-4 shadow-none ring-0 transition-all duration-300">
              <WeatherInfoCard clickedCoordinates={clickedCoordinates} />
            </div>
          </div>
        </div>
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 rounded-full border border-slate-200/70 bg-white/90 p-3 text-slate-700 shadow-lg backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          aria-label="맨 위로 이동"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
