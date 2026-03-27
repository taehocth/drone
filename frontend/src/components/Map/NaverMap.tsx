import { useEffect, useRef, useState } from "react"
import { convertGRID_GPS } from "@/utils/convertGrid"
import {
  Maximize2,
  Minimize2,
  Navigation,
  NavigationOff,
  Satellite,
  Battery,
  Gauge,
  ArrowUp,
  X,
  MapPin,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  WifiOff,
} from "lucide-react"

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1"

interface NaverMapProps {
  lat?: number
  lng?: number
  markers?: Array<{ lat: number; lng: number; id: number }>
  onMapClick?: (nx: number, ny: number) => void
  flightPath?: Array<{ lat: number; lng: number; alt?: number; time?: number }>
  dronePosition?: {
    lat: number
    lng: number
    yaw?: number
    satellites?: number
  }
  droneStats?: {
    battery?: number
    altitude?: number
    speed?: number
  }
}

const DEFAULT_LAT = 36.5941
const DEFAULT_LNG = 126.2932

type SafetyLevel = "safe" | "caution" | "danger"

interface SafetyItem {
  label: string
  level: SafetyLevel
  hint: string
}

function calcSafety(
  droneStats?: { battery?: number; altitude?: number; speed?: number },
  satellites?: number | null,
  windSpeed?: number,
): { overall: SafetyLevel; items: SafetyItem[] } {
  const items: SafetyItem[] = []

  if (droneStats?.battery != null) {
    const b = droneStats.battery
    items.push(
      b <= 20
        ? {
            label: "배터리",
            level: "danger",
            hint: `${b.toFixed(0)}% — 즉시 복귀`,
          }
        : b <= 35
          ? {
              label: "배터리",
              level: "caution",
              hint: `${b.toFixed(0)}% — 복귀 준비`,
            }
          : { label: "배터리", level: "safe", hint: `${b.toFixed(0)}%` },
    )
  }

  if (droneStats?.altitude != null) {
    const a = droneStats.altitude
    items.push(
      a > 150
        ? {
            label: "고도",
            level: "danger",
            hint: `${a.toFixed(0)}m — 법적 제한 초과`,
          }
        : a > 120
          ? {
              label: "고도",
              level: "caution",
              hint: `${a.toFixed(0)}m — 제한 접근`,
            }
          : { label: "고도", level: "safe", hint: `${a.toFixed(0)}m` },
    )
  }

  if (droneStats?.speed != null) {
    const s = droneStats.speed
    items.push(
      s > 35
        ? { label: "속도", level: "danger", hint: `${s.toFixed(1)}m/s — 과속` }
        : s > 25
          ? {
              label: "속도",
              level: "caution",
              hint: `${s.toFixed(1)}m/s — 주의`,
            }
          : { label: "속도", level: "safe", hint: `${s.toFixed(1)}m/s` },
    )
  }

  if (satellites != null) {
    items.push(
      satellites < 10
        ? {
            label: "GNSS",
            level: "danger",
            hint: `${satellites}위성 — 신호 불량`,
          }
        : satellites < 25
          ? {
              label: "GNSS",
              level: "caution",
              hint: `${satellites}위성 — 보통`,
            }
          : { label: "GNSS", level: "safe", hint: `${satellites}위성` },
    )
  }

  if (windSpeed != null) {
    items.push(
      windSpeed >= 14
        ? {
            label: "풍속",
            level: "danger",
            hint: `${windSpeed}m/s — 비행 위험`,
          }
        : windSpeed >= 7
          ? { label: "풍속", level: "caution", hint: `${windSpeed}m/s — 주의` }
          : { label: "풍속", level: "safe", hint: `${windSpeed}m/s` },
    )
  }

  const overall: SafetyLevel = items.some((i) => i.level === "danger")
    ? "danger"
    : items.some((i) => i.level === "caution")
      ? "caution"
      : "safe"

  return { overall, items }
}

const levelText: Record<SafetyLevel, string> = {
  safe: "text-emerald-400",
  caution: "text-amber-400",
  danger: "text-red-400",
}

const getBatteryColor = (v: number) =>
  v <= 20 ? "text-red-400" : v <= 35 ? "text-amber-400" : "text-emerald-400"

const getAltitudeColor = (v: number) =>
  v > 150 ? "text-red-400" : v > 120 ? "text-amber-400" : "text-emerald-400"

const getSpeedColor = (v: number) =>
  v > 35 ? "text-red-400" : v > 25 ? "text-amber-400" : "text-emerald-400"

function SafetyBanner({
  overall,
  items,
  connected,
}: {
  overall: SafetyLevel
  items: SafetyItem[]
  connected: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (!connected) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-500/40 bg-slate-900/80 px-4 py-2 text-xs text-slate-300 shadow-lg backdrop-blur-md">
        <WifiOff className="h-4 w-4 text-slate-400" />
        <span className="font-semibold">
          드론 미연결 — 연결 후 안전 상태가 표시됩니다
        </span>
      </div>
    )
  }

  const bannerStyle =
    overall === "danger"
      ? "border-red-500/50 bg-red-950/80"
      : overall === "caution"
        ? "border-amber-500/50 bg-amber-950/80"
        : "border-emerald-500/50 bg-emerald-950/80"

  const Icon =
    overall === "danger"
      ? ShieldAlert
      : overall === "caution"
        ? AlertTriangle
        : CheckCircle

  const overallLabel =
    overall === "danger" ? "위험" : overall === "caution" ? "주의" : "정상"

  return (
    <div
      className={`rounded-xl border shadow-lg backdrop-blur-md transition-all ${bannerStyle}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-2 text-left"
      >
        <Icon className={`h-4 w-4 shrink-0 ${levelText[overall]}`} />
        <span className={`text-xs font-bold ${levelText[overall]}`}>
          비행 안전 {overallLabel}
        </span>
        <div className="ml-1 flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item.label}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                item.level === "danger"
                  ? "bg-red-500/20 text-red-300"
                  : item.level === "caution"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300"
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-white/30">
          {expanded ? "▲ 닫기" : "▼ 상세"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-4 py-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.label}
                className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${
                  item.level === "danger"
                    ? "bg-red-500/15 text-red-300"
                    : item.level === "caution"
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                <span className="font-semibold">{item.label}</span>
                <span className="text-white/70">{item.hint}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function NaverMap({
  lat,
  lng,
  markers: _markers = [],
  onMapClick,
  flightPath,
  dronePosition,
  droneStats,
}: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const currentMarker = useRef<any>(null)
  const droneMarkerRef = useRef<any>(null)
  const flightPathPolylineRef = useRef<any>(null)
  const lastWeatherUpdateRef = useRef<{ lat: number; lng: number } | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [clickedInfo, setClickedInfo] = useState<{
    lat: number
    lng: number
    address: string
  } | null>(null)
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [isAddressExpanded, setIsAddressExpanded] = useState(false)
  const [weatherData, setWeatherData] = useState<{
    temperature: number
    windSpeed: number
    precipitationAmount: number
  } | null>(null)
  const [isTrackingDrone, setIsTrackingDrone] = useState(true)
  const [isDroneConnected, setIsDroneConnected] = useState(false)
  const [satellites, setSatellites] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { overall: safetyOverall, items: safetyItems } = calcSafety(
    droneStats,
    isDroneConnected ? satellites : null,
    weatherData?.windSpeed,
  )

  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent).detail?.satellites
      if (v !== undefined) setSatellites(v)
    }
    window.addEventListener("droneSatelliteUpdate", handler)
    return () => window.removeEventListener("droneSatelliteUpdate", handler)
  }, [])

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
      if (mapInstance.current) {
        setTimeout(() => {
          const naver = (window as any).naver
          if (naver) naver.maps.Event.trigger(mapInstance.current, "resize")
        }, 100)
      }
    }
    document.addEventListener("fullscreenchange", onChange)
    document.addEventListener("webkitfullscreenchange", onChange)
    return () => {
      document.removeEventListener("fullscreenchange", onChange)
      document.removeEventListener("webkitfullscreenchange", onChange)
    }
  }, [])

  const toggleFullscreen = async () => {
    if (!mapContainerRef.current) return
    try {
      if (!document.fullscreenElement) {
        await mapContainerRef.current.requestFullscreen?.()
      } else {
        await document.exitFullscreen?.()
      }
    } catch (e) {
      console.error("전체화면 오류:", e)
    }
  }

  const fetchWeatherData = async (nx: number, ny: number) => {
    try {
      const now = new Date()
      now.setMinutes(now.getMinutes() - 40)
      const yy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, "0")
      const dd = String(now.getDate()).padStart(2, "0")
      const hh = String(now.getHours()).padStart(2, "0")
      const res = await fetch(
        `${API_BASE_URL}/weather/?nx=${nx}&ny=${ny}&base_date=${yy}${mm}${dd}&base_time=${hh}00`,
      )
      if (!res.ok) return
      const data = await res.json()
      const items = data?.response?.body?.items?.item ?? []
      let temperature = 0,
        windSpeed = 0,
        precipitationAmount = 0
      for (const item of items) {
        if (item.category === "T1H") temperature = parseFloat(item.obsrValue)
        if (item.category === "WSD") windSpeed = parseFloat(item.obsrValue)
        if (item.category === "RN1")
          precipitationAmount = parseFloat(item.obsrValue)
      }
      setWeatherData({ temperature, windSpeed, precipitationAmount })
    } catch (err) {
      console.error("날씨 API 실패:", err)
    }
  }

  const handleSearch = async () => {
    if (!mapInstance.current) return
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/naver/search-place?query=${encodeURIComponent(searchQuery)}`,
      )
      if (!res.ok) return alert("검색 실패")
      const data = await res.json()
      if (!data.items?.length) return alert("결과 없음")
      const place = data.items[0]
      const la = parseFloat(place.mapy) / 1e7
      const lo = parseFloat(place.mapx) / 1e7
      const naver = (window as any).naver
      mapInstance.current.setCenter(new naver.maps.LatLng(la, lo))
      mapInstance.current.setZoom(15)
      addMarker(la, lo)
      setClickedInfo({
        lat: la,
        lng: lo,
        address: place.roadAddress || place.address,
      })
      setShowInfoPanel(true)
      setSearchQuery("")
      const { nx, ny } = convertGRID_GPS("toXY", la, lo)
      onMapClick?.(nx, ny)
      fetchWeatherData(nx, ny)
    } catch (err) {
      console.error(err)
    }
  }

  const removeCurrentMarker = () => {
    if (currentMarker.current) {
      currentMarker.current.setMap(null)
      currentMarker.current = null
    }
  }

  const addMarker = (la: number, lo: number) => {
    if (!mapInstance.current) return
    removeCurrentMarker()
    const naver = (window as any).naver
    currentMarker.current = new naver.maps.Marker({
      position: new naver.maps.LatLng(la, lo),
      map: mapInstance.current,
      icon: {
        content: `<div style="width:18px;height:18px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.3)"></div>`,
        anchor: new naver.maps.Point(9, 9),
      },
    })
  }

  const handleMapClick = (e: any) => {
    const la = e.coord.lat(),
      lo = e.coord.lng()
    addMarker(la, lo)
    const { nx, ny } = convertGRID_GPS("toXY", la, lo)
    onMapClick?.(nx, ny)
    fetchWeatherData(nx, ny)
    const naver = (window as any).naver
    naver.maps.Service.reverseGeocode(
      { coords: new naver.maps.LatLng(la, lo), orders: "roadaddr,addr" },
      (status: any, response: any) => {
        if (status === naver.maps.Service.Status.OK) {
          setClickedInfo({
            lat: la,
            lng: lo,
            address:
              response.v2.address.roadAddress ||
              response.v2.address.jibunAddress,
          })
          setShowInfoPanel(true)
          setIsAddressExpanded(false)
        }
      },
    )
  }

  useEffect(() => {
    const scriptId = "naver-map-script"
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script")
      s.id = scriptId
      s.src =
        "https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=zuroo29p7x&submodules=geocoder"
      s.async = true
      document.head.appendChild(s)
      s.onload = () => initMap()
    } else {
      initMap()
    }
    function initMap() {
      if (!mapRef.current || !(window as any).naver) return
      const naver = (window as any).naver
      mapInstance.current = new naver.maps.Map(mapRef.current, {
        center: new naver.maps.LatLng(DEFAULT_LAT, DEFAULT_LNG),
        zoom: 15,
      })
      naver.maps.Event.addListener(mapInstance.current, "click", handleMapClick)
    }
    const onResize = () => {
      if (mapInstance.current)
        (window as any).naver.maps.Event.trigger(mapInstance.current, "resize")
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [lat, lng])

  const updateDroneMarker = (la: number, lo: number, yaw?: number) => {
    if (!mapInstance.current) return
    const naver = (window as any).naver
    const pos = new naver.maps.LatLng(la, lo)
    const rot = yaw ?? 0
    const icon = {
      content: `<div style="width:40px;height:40px;transform:rotate(${rot}deg)"><svg width="40" height="40" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))"><path d="M20 5L28 25L12 25Z" fill="#ef4444" stroke="white" stroke-width="2"/><circle cx="20" cy="25" r="6" fill="#ef4444" stroke="white" stroke-width="2"/></svg></div>`,
      anchor: new naver.maps.Point(20, 20),
      size: new naver.maps.Size(40, 40),
    }
    if (!droneMarkerRef.current) {
      droneMarkerRef.current = new naver.maps.Marker({
        position: pos,
        map: mapInstance.current,
        icon,
        zIndex: 1000,
      })
    } else {
      droneMarkerRef.current.setPosition(pos)
      droneMarkerRef.current.setIcon(icon)
    }
  }

  const removeDroneMarker = () => {
    if (droneMarkerRef.current) {
      droneMarkerRef.current.setMap(null)
      droneMarkerRef.current = null
    }
  }

  // ── 드론 이벤트 (폴리라인 제거) ───────────────────────────────
  useEffect(() => {
    const onUpdate = (e: CustomEvent) => {
      const { lat: la, lng: lo, yaw, satellites: sats } = e.detail
      if (!la || !lo || !mapInstance.current) return
      updateDroneMarker(la, lo, yaw)
      setIsDroneConnected(true)
      if (sats !== undefined) setSatellites(sats)
      if (isTrackingDrone)
        mapInstance.current.setCenter(
          new (window as any).naver.maps.LatLng(la, lo),
        )
      const last = lastWeatherUpdateRef.current
      if (
        !last ||
        Math.abs(la - last.lat) > 0.01 ||
        Math.abs(lo - last.lng) > 0.01
      ) {
        const { nx, ny } = convertGRID_GPS("toXY", la, lo)
        fetchWeatherData(nx, ny)
        lastWeatherUpdateRef.current = { lat: la, lng: lo }
      }
    }
    const onDisconnect = () => {
      removeDroneMarker()
      setIsDroneConnected(false)
      setSatellites(null)
    }
    window.addEventListener("dronePositionUpdate", onUpdate as EventListener)
    window.addEventListener("droneDisconnected", onDisconnect)
    return () => {
      window.removeEventListener(
        "dronePositionUpdate",
        onUpdate as EventListener,
      )
      window.removeEventListener("droneDisconnected", onDisconnect)
      removeDroneMarker()
    }
  }, [isTrackingDrone])

  // ── dronePosition prop ────────────────────────────────────────
  useEffect(() => {
    if (!dronePosition) {
      removeDroneMarker()
      setIsDroneConnected(false)
      return
    }
    if (!mapInstance.current) return
    const { lat: la, lng: lo, yaw, satellites: sats } = dronePosition
    if (typeof la !== "number" || typeof lo !== "number") {
      removeDroneMarker()
      setIsDroneConnected(false)
      return
    }
    updateDroneMarker(la, lo, yaw)
    setIsDroneConnected(true)
    if (sats !== undefined) setSatellites(sats)
    if (isTrackingDrone)
      mapInstance.current.setCenter(
        new (window as any).naver.maps.LatLng(la, lo),
      )
  }, [dronePosition, isTrackingDrone])

  // ── 비행 로그 경로 (flightPath prop은 유지) ───────────────────
  useEffect(() => {
    if (!flightPath?.length || !mapInstance.current) {
      flightPathPolylineRef.current?.setMap(null)
      flightPathPolylineRef.current = null
      return
    }
    const naver = (window as any).naver
    const path = flightPath.map((p) => new naver.maps.LatLng(p.lat, p.lng))
    flightPathPolylineRef.current?.setMap(null)
    flightPathPolylineRef.current = new naver.maps.Polyline({
      map: mapInstance.current,
      path,
      strokeColor: "#10B981",
      strokeWeight: 3,
      strokeOpacity: 0.8,
      zIndex: 200,
    })
    if (path.length > 0) {
      const bounds = new naver.maps.LatLngBounds(path[0], path[0])
      path.forEach((pt: any) => bounds.extend(pt))
      mapInstance.current.fitBounds(bounds, { padding: 50 })
    }
  }, [flightPath])

  return (
    <div ref={mapContainerRef} className="relative flex h-full w-full flex-col">
      {/* 검색창 — 기체 연결 시 숨김 */}
      {!isDroneConnected && (
        <div className="absolute left-1/2 top-3 z-50 w-[90%] max-w-md -translate-x-1/2">
          <div className="flex items-center rounded-full border border-gray-200 bg-white/95 px-3 py-1 shadow-md backdrop-blur-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="장소 검색"
              className="flex-1 border-none bg-transparent px-2 py-1 text-sm focus:outline-none"
            />
            <button
              onClick={handleSearch}
              className="rounded-full bg-blue-600 px-4 py-1 text-sm text-white transition hover:bg-blue-700"
            >
              검색
            </button>
          </div>
        </div>
      )}

      {/* 안전 배너 */}
      <div className="absolute left-3 right-3 top-14 z-50">
        <SafetyBanner
          overall={safetyOverall}
          items={safetyItems}
          connected={isDroneConnected}
        />
      </div>

      {/* 드론 HUD */}
      {isDroneConnected && droneStats && (
        <div className="absolute left-3 top-[7.5rem] z-50 flex flex-col gap-1.5">
          {droneStats.battery != null && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-md">
              <Battery
                className={`h-3.5 w-3.5 ${getBatteryColor(droneStats.battery)}`}
              />
              <span className="text-white/50">배터리</span>
              <span
                className={`font-semibold tabular-nums ${getBatteryColor(droneStats.battery)}`}
              >
                {droneStats.battery.toFixed(0)}%
              </span>
              {droneStats.battery <= 20 && (
                <span className="ml-1 animate-pulse rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold">
                  즉시 복귀
                </span>
              )}
            </div>
          )}
          {droneStats.altitude != null && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-md">
              <ArrowUp
                className={`h-3.5 w-3.5 ${getAltitudeColor(droneStats.altitude)}`}
              />
              <span className="text-white/50">고도</span>
              <span
                className={`font-semibold tabular-nums ${getAltitudeColor(droneStats.altitude)}`}
              >
                {droneStats.altitude.toFixed(0)}m
              </span>
              {droneStats.altitude > 150 && (
                <span className="ml-1 animate-pulse rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold">
                  제한 초과
                </span>
              )}
            </div>
          )}
          {droneStats.speed != null && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-md">
              <Gauge
                className={`h-3.5 w-3.5 ${getSpeedColor(droneStats.speed)}`}
              />
              <span className="text-white/50">속도</span>
              <span
                className={`font-semibold tabular-nums ${getSpeedColor(droneStats.speed)}`}
              >
                {droneStats.speed.toFixed(1)}m/s
              </span>
            </div>
          )}
        </div>
      )}

      {/* GNSS HUD */}
      {satellites !== null && isDroneConnected && (
        <div
          className={`absolute right-3 top-[7.5rem] z-50 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md ${
            satellites < 10
              ? "border-red-500/40 bg-red-950/80"
              : satellites < 25
                ? "border-amber-500/40 bg-amber-950/80"
                : "border-emerald-500/40 bg-emerald-950/80"
          }`}
        >
          <Satellite
            className={`h-4 w-4 ${satellites < 10 ? "text-red-400" : satellites < 25 ? "text-amber-400" : "text-emerald-400"}`}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] text-white/40">GNSS</span>
            <span
              className={`font-semibold ${satellites < 10 ? "text-red-400" : satellites < 25 ? "text-amber-400" : "text-emerald-400"}`}
            >
              {satellites < 10 ? "불량" : satellites < 25 ? "보통" : "양호"} (
              {satellites})
            </span>
          </div>
        </div>
      )}

      {/* 드론 추적 버튼 */}
      {isDroneConnected && (
        <button
          onClick={() => setIsTrackingDrone((v) => !v)}
          className={`absolute bottom-16 left-3 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 ${
            isTrackingDrone
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-slate-600/80 backdrop-blur-sm hover:bg-slate-700"
          }`}
        >
          {isTrackingDrone ? (
            <Navigation className="h-4 w-4" />
          ) : (
            <NavigationOff className="h-4 w-4" />
          )}
          {isTrackingDrone ? "추적 중" : "추적 해제"}
        </button>
      )}

      {/* 전체화면 버튼 */}
      <button
        onClick={toggleFullscreen}
        className="absolute bottom-4 right-3 z-[60] flex items-center justify-center rounded-full bg-blue-600 p-3 text-white shadow-lg transition-all hover:scale-110 hover:bg-blue-700"
        title={isFullscreen ? "전체화면 종료" : "전체화면"}
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </button>

      {/* 클릭 정보 패널 */}
      {showInfoPanel && clickedInfo && (
        <div className="absolute bottom-0 left-0 right-0 z-40 p-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
                <MapPin className="h-3.5 w-3.5" />
                선택 위치
              </div>
              <button
                onClick={() => {
                  setShowInfoPanel(false)
                  removeCurrentMarker()
                  setWeatherData(null)
                }}
                className="rounded-lg p-1 text-white/30 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-white/40">
                    위도
                  </span>
                  <p className="font-mono text-sm font-semibold text-sky-300">
                    {clickedInfo.lat.toFixed(6)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-white/40">
                    경도
                  </span>
                  <p className="font-mono text-sm font-semibold text-sky-300">
                    {clickedInfo.lng.toFixed(6)}
                  </p>
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-white/40">
                  주소
                </span>
                <div className="mt-0.5 flex items-start gap-1">
                  <p
                    className={`text-sm text-white/90 ${isAddressExpanded ? "" : "line-clamp-1"}`}
                  >
                    {clickedInfo.address}
                  </p>
                  {clickedInfo.address.length > 28 && (
                    <button
                      onClick={() => setIsAddressExpanded((v) => !v)}
                      className="shrink-0 text-xs text-white/30 hover:text-white"
                    >
                      {isAddressExpanded ? "▲" : "▼"}
                    </button>
                  )}
                </div>
              </div>
              {weatherData && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <span className="text-[10px] uppercase tracking-wide text-white/40">
                    기상 정보
                  </span>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-lg font-bold text-orange-300">
                        {weatherData.temperature}°
                      </p>
                      <p className="text-[10px] text-white/40">기온</p>
                    </div>
                    <div className="text-center">
                      <p
                        className={`text-lg font-bold ${weatherData.windSpeed >= 14 ? "text-red-400" : weatherData.windSpeed >= 7 ? "text-amber-400" : "text-emerald-400"}`}
                      >
                        {weatherData.windSpeed}
                        <span className="text-xs font-normal">m/s</span>
                      </p>
                      <p className="text-[10px] text-white/40">풍속</p>
                      {weatherData.windSpeed >= 14 && (
                        <span className="mt-0.5 inline-block rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
                          비행 위험
                        </span>
                      )}
                      {weatherData.windSpeed >= 7 &&
                        weatherData.windSpeed < 14 && (
                          <span className="mt-0.5 inline-block rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                            주의
                          </span>
                        )}
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-sky-300">
                        {weatherData.precipitationAmount}
                        <span className="text-xs font-normal">mm</span>
                      </p>
                      <p className="text-[10px] text-white/40">강수</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 지도 영역 */}
      <div ref={mapRef} className="min-h-[400px] w-full flex-1" />
    </div>
  )
}
