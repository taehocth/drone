import { useEffect, useRef, useState } from "react"
import { convertGRID_GPS } from "@/utils/convertGrid"
import { Maximize2, Minimize2 } from "lucide-react"

interface NaverMapProps {
  lat?: number
  lng?: number
  markers?: Array<{ lat: number; lng: number; id: number }>
  onMapClick?: (nx: number, ny: number) => void
}

const DEFAULT_LAT = 36.5941
const DEFAULT_LNG = 126.2932

export function NaverMap({
  lat,
  lng,
  markers: _markers = [],
  onMapClick,
}: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const currentMarker = useRef<any>(null)
  const droneMarkerRef = useRef<any>(null)

  const pathCoords = useRef<any[]>([])
  const polylineRef = useRef<any>(null)

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

  // ⭐ GNSS 위성 수 State
  const [satellites, setSatellites] = useState<number | null>(null)

  // ⭐ 전체화면 State
  const [isFullscreen, setIsFullscreen] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  // ⭐ 비행 계획 관련 State
  const planPolylineRef = useRef<any>(null)
  const planFileInputRef = useRef<HTMLInputElement>(null)

  const lastWeatherUpdateRef = useRef<{ lat: number; lng: number } | null>(null)

  // ================================
  // ⭐ 위성수 이벤트 수신
  // ================================
  useEffect(() => {
    const handleSatelliteUpdate = (e: Event) => {
      const customEvent = e as CustomEvent
      const satellitesValue = customEvent.detail?.satellites
      if (satellitesValue !== undefined) {
        setSatellites(satellitesValue)
      }
    }

    window.addEventListener("droneSatelliteUpdate", handleSatelliteUpdate)
    return () =>
      window.removeEventListener("droneSatelliteUpdate", handleSatelliteUpdate)
  }, [])

  // ================================
  // ⭐ 전체화면 상태 감지
  // ================================
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
      // 전체화면 상태 변경 시 지도 크기 조정
      if (mapInstance.current) {
        setTimeout(() => {
          const naver = (window as any).naver
          if (naver && mapInstance.current) {
            naver.maps.Event.trigger(mapInstance.current, "resize")
          }
        }, 100)
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange)
    document.addEventListener("mozfullscreenchange", handleFullscreenChange)
    document.addEventListener("MSFullscreenChange", handleFullscreenChange)

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      )
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange,
      )
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange)
    }
  }, [])

  // ================================
  // ⭐ 전체화면 전환 함수
  // ================================
  const toggleFullscreen = async () => {
    if (!mapContainerRef.current) return

    try {
      if (!document.fullscreenElement) {
        // 전체화면 진입
        const element = mapContainerRef.current
        if (element.requestFullscreen) {
          await element.requestFullscreen()
        } else if ((element as any).webkitRequestFullscreen) {
          // Safari
          await (element as any).webkitRequestFullscreen()
        } else if ((element as any).mozRequestFullScreen) {
          // Firefox
          await (element as any).mozRequestFullScreen()
        } else if ((element as any).msRequestFullscreen) {
          // IE/Edge
          await (element as any).msRequestFullscreen()
        }
      } else {
        // 전체화면 종료
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen()
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen()
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen()
        }
      }
    } catch (error) {
      console.error("전체화면 전환 실패:", error)
    }
  }

  // ================================
  // 날씨 정보 가져오기
  // ================================
  const fetchWeatherData = async (nx: number, ny: number) => {
    try {
      const now = new Date()
      now.setMinutes(now.getMinutes() - 40)

      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, "0")
      const day = String(now.getDate()).padStart(2, "0")
      const hour = String(now.getHours()).padStart(2, "0")

      // 환경 변수에서 API URL 가져오기
      const apiBaseUrl = "http://192.168.50.80:8000/api/v1"
      const url = `${apiBaseUrl}/weather?nx=${nx}&ny=${ny}&base_date=${year}${month}${day}&base_time=${hour}00`
      const res = await fetch(url)

      if (!res.ok) return

      const data = await res.json()
      const items = data?.response?.body?.items?.item ?? []

      let temperature = 0
      let windSpeed = 0
      let precipitationAmount = 0

      for (const item of items) {
        switch (item.category) {
          case "T1H":
            temperature = parseFloat(item.obsrValue)
            break
          case "WSD":
            windSpeed = parseFloat(item.obsrValue)
            break
          case "RN1":
            precipitationAmount = parseFloat(item.obsrValue)
            break
        }
      }

      setWeatherData({ temperature, windSpeed, precipitationAmount })
    } catch (err) {
      console.error("날씨 API 실패:", err)
    }
  }

  // ================================
  // 장소 검색
  // ================================
  const handleSearch = async () => {
    if (!mapInstance.current) return

    try {
      // 환경 변수에서 API URL 가져오기
      const apiBaseUrl = "http://192.168.50.80:8000/api/v1"
      const res = await fetch(
        `${apiBaseUrl}/naver/search-place?query=${encodeURIComponent(
          searchQuery,
        )}`,
      )

      if (!res.ok) return alert("검색 실패")

      const data = await res.json()
      if (!data.items || data.items.length === 0) return alert("결과 없음")

      const place = data.items[0]
      const lat = parseFloat(place.mapy) / 1e7
      const lng = parseFloat(place.mapx) / 1e7

      const naver = (window as any).naver
      const latlng = new naver.maps.LatLng(lat, lng)

      mapInstance.current.setCenter(latlng)
      mapInstance.current.setZoom(15)
      addMarker(lat, lng)

      const address = place.roadAddress || place.address
      setClickedInfo({ lat, lng, address })
      setShowInfoPanel(true)
      setIsAddressExpanded(false)
      setSearchQuery("")

      const { nx, ny } = convertGRID_GPS("toXY", lat, lng)
      onMapClick?.(nx, ny)
      fetchWeatherData(nx, ny)
    } catch (err) {
      console.error(err)
    }
  }

  // ================================
  // 클릭 마커 제거
  // ================================
  const removeCurrentMarker = () => {
    if (currentMarker.current) {
      currentMarker.current.setMap(null)
      currentMarker.current = null
    }
  }

  // ================================
  // 클릭 마커 추가
  // ================================
  const addMarker = (lat: number, lng: number) => {
    if (!mapInstance.current) return
    removeCurrentMarker()

    const naver = (window as any).naver
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(lat, lng),
      map: mapInstance.current,
      icon: {
        content: `
          <div style="
            width: 18px;
            height: 18px;
            background-color: #3b82f6;
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
        `,
        anchor: new naver.maps.Point(9, 9),
      },
    })

    currentMarker.current = marker
  }

  // ================================
  // 지도 클릭: 주소 + 날씨 표시
  // ================================
  const handleMapClick = (e: any) => {
    const lat = e.coord.lat()
    const lng = e.coord.lng()

    addMarker(lat, lng)

    const { nx, ny } = convertGRID_GPS("toXY", lat, lng)
    onMapClick?.(nx, ny)
    fetchWeatherData(nx, ny)

    const naver = (window as any).naver
    naver.maps.Service.reverseGeocode(
      {
        coords: new naver.maps.LatLng(lat, lng),
        orders: [
          naver.maps.Service.OrderType.ADDR,
          naver.maps.Service.OrderType.ROAD_ADDR,
        ].join(","),
      },
      (status: any, response: any) => {
        if (status === naver.maps.Service.Status.OK) {
          const address =
            response.v2.address.roadAddress || response.v2.address.jibunAddress

          setClickedInfo({ lat, lng, address })
          setShowInfoPanel(true)
          setIsAddressExpanded(false)
        }
      },
    )
  }

  // ================================
  // 지도 초기화
  // ================================
  useEffect(() => {
    const scriptId = "naver-map-script"

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script")
      script.id = scriptId
      script.src =
        "https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=zuroo29p7x&submodules=geocoder"
      script.async = true
      document.head.appendChild(script)
      script.onload = () => initMap()
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

    const handleResize = () => {
      if (mapInstance.current)
        (window as any).naver.maps.Event.trigger(mapInstance.current, "resize")
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [lat, lng])

  // ================================
  // 드론 화살표 마커 생성/업데이트
  // ================================
  const updateDroneMarker = (lat: number, lng: number, yaw?: number) => {
    if (!mapInstance.current) return

    const naver = (window as any).naver
    const position = new naver.maps.LatLng(lat, lng)
    const rotation = yaw ?? 0

    const createArrowIcon = (angle: number) => ({
      content: `
        <div style="
          width: 40px;
          height: 40px;
          position: relative;
          transform: rotate(${angle}deg);
        ">
          <svg width="40" height="40" viewBox="0 0 40 40" style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));">
            <path d="M 20 5 L 28 25 L 12 25 Z"
                  fill="#ef4444"
                  stroke="white"
                  stroke-width="2"/>
            <circle cx="20" cy="25" r="6" fill="#ef4444" stroke="white" stroke-width="2"/>
          </svg>
        </div>
      `,
      anchor: new naver.maps.Point(20, 20),
      size: new naver.maps.Size(40, 40),
    })

    if (!droneMarkerRef.current) {
      droneMarkerRef.current = new naver.maps.Marker({
        position,
        map: mapInstance.current,
        icon: createArrowIcon(rotation),
        zIndex: 1000,
      })
    } else {
      droneMarkerRef.current.setPosition(position)
      droneMarkerRef.current.setIcon(createArrowIcon(rotation))
    }
  }

  const removeDroneMarker = () => {
    if (droneMarkerRef.current) {
      droneMarkerRef.current.setMap(null)
      droneMarkerRef.current = null
    }
  }

  // ================================
  // 실시간 드론 위치 업데이트
  // ================================
  useEffect(() => {
    const handleDroneUpdate = (e: CustomEvent) => {
      const { lat, lng, yaw, satellites } = e.detail

      if (!lat || !lng || !mapInstance.current) return

      updateDroneMarker(lat, lng, yaw)
      setIsDroneConnected(true)

      // ✅ GPS 위성 개수 업데이트
      if (satellites !== undefined) {
        setSatellites(satellites)
      }

      const naver = (window as any).naver

      pathCoords.current.push(new naver.maps.LatLng(lat, lng))

      if (polylineRef.current) polylineRef.current.setMap(null)
      polylineRef.current = new naver.maps.Polyline({
        map: mapInstance.current,
        path: pathCoords.current,
        strokeColor: "#1E90FF",
        strokeWeight: 4,
        strokeOpacity: 0.8,
      })

      if (isTrackingDrone) {
        mapInstance.current.setCenter(new naver.maps.LatLng(lat, lng))
      }

      // ✅ 드론 위치의 기상정보와 주소 가져오기 (일정 거리 이상 이동했을 때만)
      const lastUpdate = lastWeatherUpdateRef.current
      const shouldUpdateWeather =
        !lastUpdate ||
        Math.abs(lat - lastUpdate.lat) > 0.01 ||
        Math.abs(lng - lastUpdate.lng) > 0.01 // 약 1km 이상 이동

      if (shouldUpdateWeather) {
        const { nx, ny } = convertGRID_GPS("toXY", lat, lng)
        fetchWeatherData(nx, ny)
        lastWeatherUpdateRef.current = { lat, lng }

        naver.maps.Service.reverseGeocode(
          {
            coords: new naver.maps.LatLng(lat, lng),
            orders: [
              naver.maps.Service.OrderType.ADDR,
              naver.maps.Service.OrderType.ROAD_ADDR,
            ].join(","),
          },
          (status: any, response: any) => {
            if (status === naver.maps.Service.Status.OK) {
              const address =
                response.v2.address.roadAddress ||
                response.v2.address.jibunAddress

              setClickedInfo({ lat, lng, address })
              setShowInfoPanel(true)
              setIsAddressExpanded(false)
            }
          },
        )
      }
    }

    const handleDisconnect = () => {
      removeDroneMarker()
      setIsDroneConnected(false)
      setSatellites(null) // ✅ 위성 수 초기화
    }

    window.addEventListener("dronePositionUpdate", handleDroneUpdate)
    window.addEventListener("droneDisconnected", handleDisconnect)

    return () => {
      window.removeEventListener("dronePositionUpdate", handleDroneUpdate)
      window.removeEventListener("droneDisconnected", handleDisconnect)
      removeDroneMarker()
    }
  }, [isTrackingDrone])

  // ================================
  // 경로 초기화
  // ================================
  const clearPath = () => {
    pathCoords.current = []
    if (polylineRef.current) {
      polylineRef.current.setMap(null)
      polylineRef.current = null
    }
  }

  // ================================
  // .plan 파일 파싱 및 경로 표시
  // ================================
  const handlePlanFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file || !file.name.endsWith(".plan")) {
      alert("QGroundControl .plan 파일만 업로드 가능합니다.")
      return
    }

    try {
      const text = await file.text()
      const planData = JSON.parse(text)

      // mission.items에서 waypoint 추출 (command 16: WAYPOINT)
      const waypoints: Array<{ lat: number; lng: number }> = []

      if (
        planData.mission &&
        planData.mission.items &&
        Array.isArray(planData.mission.items)
      ) {
        for (const item of planData.mission.items) {
          // command 16 = MAV_CMD_NAV_WAYPOINT
          if (item.command === 16 && item.params && item.params.length >= 6) {
            const lat = item.params[4]
            const lng = item.params[5]
            if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
              waypoints.push({ lat, lng })
            }
          }
        }
      }

      if (waypoints.length === 0) {
        alert("비행 계획 파일에서 waypoint를 찾을 수 없습니다.")
        return
      }

      // 기존 plan polyline 제거
      if (planPolylineRef.current) {
        planPolylineRef.current.setMap(null)
      }

      // 새로운 polyline 생성
      if (!mapInstance.current) {
        alert("지도가 초기화되지 않았습니다.")
        return
      }

      const naver = (window as any).naver
      const path = waypoints.map((wp) => new naver.maps.LatLng(wp.lat, wp.lng))

      planPolylineRef.current = new naver.maps.Polyline({
        map: mapInstance.current,
        path: path,
        strokeColor: "#FF6B6B", // 빨간색으로 비행 계획 표시
        strokeWeight: 3,
        strokeOpacity: 0.8,
        zIndex: 100,
      })

      // 파일 입력 초기화
      if (planFileInputRef.current) {
        planFileInputRef.current.value = ""
      }

      alert(`비행 계획 경로가 추가되었습니다. (${waypoints.length}개 waypoint)`)
    } catch (error) {
      console.error("Plan 파일 파싱 오류:", error)
      alert("Plan 파일을 읽는 중 오류가 발생했습니다.")
    }
  }

  // ================================
  // 비행 계획 경로 제거
  // ================================
  const removePlanPath = () => {
    if (planPolylineRef.current) {
      planPolylineRef.current.setMap(null)
      planPolylineRef.current = null
      alert("비행 계획 경로가 제거되었습니다.")
    } else {
      alert("표시된 비행 계획 경로가 없습니다.")
    }
  }

  // -------------------------------------------------------------------
  //                             UI 출력
  // -------------------------------------------------------------------
  return (
    <div ref={mapContainerRef} className="relative flex h-full w-full flex-col">
      {/* 검색창 */}
      <div className="absolute left-1/2 top-3 z-50 w-[90%] max-w-md -translate-x-1/2">
        <div className="flex items-center rounded-full border border-gray-300 bg-white px-3 py-1 shadow-sm">
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
            className="rounded-full bg-blue-600 px-4 py-1 text-sm text-white hover:bg-blue-700"
          >
            검색
          </button>
        </div>
      </div>

      {/* 경로 초기화 버튼 */}
      {/* <button
        onClick={clearPath}
        className="absolute right-4 top-4 z-50 rounded bg-red-500 px-3 py-1 text-xs text-white shadow hover:bg-red-600"
      >
        경로 초기화
      </button> */}

      {/* Plan 넣기 버튼 */}
      {/* <div className="absolute left-4 top-4 z-50 flex gap-2">
        <label className="cursor-pointer rounded bg-blue-500 px-3 py-1 text-xs text-white shadow hover:bg-blue-600">
          Plan 넣기
          <input
            ref={planFileInputRef}
            type="file"
            accept=".plan"
            onChange={handlePlanFileUpload}
            className="hidden"
          />
        </label>
        <button
          onClick={removePlanPath}
          className="rounded bg-orange-500 px-3 py-1 text-xs text-white shadow hover:bg-orange-600"
        >
          Plan 제거
        </button>
      </div> */}

      {/* 드론 추적 모드 */}
      {isDroneConnected && (
        <button
          onClick={() => setIsTrackingDrone(!isTrackingDrone)}
          className={`absolute right-4 top-16 z-50 rounded px-3 py-1 text-xs text-white shadow ${
            isTrackingDrone
              ? "bg-green-500 hover:bg-green-600"
              : "bg-gray-500 hover:bg-gray-600"
          }`}
        >
          {isTrackingDrone ? "📍 추적 중" : "📍 추적 해제"}
        </button>
      )}

      {/* ⭐ GNSS 위성 HUD */}
      {satellites !== null && (
        <div className="absolute right-4 top-28 z-50 rounded-lg bg-black/70 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span>🛰️</span>
            <span>
              <strong>위성:</strong> {satellites}
            </span>
          </div>
        </div>
      )}

      {/* ⭐ 전체화면 버튼 */}
      <button
        onClick={toggleFullscreen}
        className="absolute bottom-4 right-4 z-[60] flex items-center justify-center rounded-full bg-blue-600 p-3 text-white shadow-lg transition-all hover:scale-110 hover:bg-blue-700"
        title={isFullscreen ? "전체화면 종료" : "전체화면"}
      >
        {isFullscreen ? (
          <Minimize2 className="h-5 w-5" />
        ) : (
          <Maximize2 className="h-5 w-5" />
        )}
      </button>

      {/* 클릭 패널 */}
      {showInfoPanel && clickedInfo && (
        <div className="absolute bottom-0 left-0 right-0 z-40">
          <div className="mb-4 ml-4 mr-20 rounded-lg bg-black/80 px-3 py-2 text-white backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex-1 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    <strong>위도:</strong> {clickedInfo.lat.toFixed(6)}
                  </span>
                  <span>
                    <strong>경도:</strong> {clickedInfo.lng.toFixed(6)}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={isAddressExpanded ? "" : "truncate"}>
                      <strong>주소:</strong> {clickedInfo.address}
                    </span>
                    {clickedInfo.address.length > 20 && (
                      <button
                        onClick={() => setIsAddressExpanded(!isAddressExpanded)}
                        className="ml-1 text-xs text-white/70 hover:text-white"
                      >
                        {isAddressExpanded ? "▲" : "▼"}
                      </button>
                    )}
                  </div>
                </div>

                {weatherData && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-white/20 pt-2">
                    <span>
                      🌡️ <strong>기온:</strong> {weatherData.temperature}°C
                    </span>
                    <span>
                      💨 <strong>풍속:</strong> {weatherData.windSpeed}m/s
                    </span>
                    <span>
                      🌧️ <strong>강수량:</strong>{" "}
                      {weatherData.precipitationAmount}mm
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setShowInfoPanel(false)
                  removeCurrentMarker()
                  setWeatherData(null)
                }}
                className="ml-2 text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 지도 영역 */}
      <div ref={mapRef} className="min-h-[400px] w-full flex-1" />
    </div>
  )
}
