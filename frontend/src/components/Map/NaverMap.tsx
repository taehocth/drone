import { useEffect, useRef, useState } from "react"
import { convertGRID_GPS } from "@/utils/convertGrid"

interface NaverMapProps {
  lat?: number
  lng?: number
  markers?: Array<{ lat: number; lng: number; id: number }>
  onMapClick?: (nx: number, ny: number) => void // ✅ (lat,lng) → (nx,ny)
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

  // ✅ 경로 관련 Ref
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

  // ✅ 날씨 정보 가져오기
  const fetchWeatherData = async (nx: number, ny: number) => {
    try {
      const now = new Date()
      now.setMinutes(now.getMinutes() - 40)

      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, "0")
      const day = String(now.getDate()).padStart(2, "0")
      const hour = String(now.getHours()).padStart(2, "0")

      const url = `http://localhost:8000/api/v1/weather?nx=${nx}&ny=${ny}&base_date=${year}${month}${day}&base_time=${hour}00`
      const res = await fetch(url)
      if (!res.ok) return console.error("❌ 날씨 API 요청 실패:", res.status)

      const data = await res.json()
      const items = data?.response?.body?.items?.item ?? []
      if (items.length === 0) return console.warn("⚠️ 날씨 데이터 없음")

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
      console.error("날씨 불러오기 실패:", err)
      setWeatherData(null)
    }
  }

  // ✅ 장소 검색
  const handleSearch = async () => {
    if (!mapInstance.current) return
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/naver/search-place?query=${encodeURIComponent(
          searchQuery,
        )}`,
      )
      if (!res.ok) return alert("검색 실패")

      const data = await res.json()
      if (!data.items || data.items.length === 0)
        return alert("검색 결과가 없습니다.")

      const place = data.items[0]
      const lat = parseFloat(place.mapy) / 1e7
      const lng = parseFloat(place.mapx) / 1e7
      const latlng = new (window as any).naver.maps.LatLng(lat, lng)

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
      console.error("검색 에러:", err)
    }
  }

  // ✅ 마커 제거
  const removeCurrentMarker = () => {
    if (currentMarker.current) {
      currentMarker.current.setMap(null)
      currentMarker.current = null
    }
  }

  // ✅ 마커 추가
  const addMarker = (lat: number, lng: number) => {
    if (!mapInstance.current) return
    removeCurrentMarker()
    const marker = new (window as any).naver.maps.Marker({
      position: new (window as any).naver.maps.LatLng(lat, lng),
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
        anchor: new (window as any).naver.maps.Point(9, 9),
      },
    })
    currentMarker.current = marker
  }

  // ✅ 지도 클릭 이벤트
  const handleMapClick = (e: any) => {
    const lat = e.coord.lat()
    const lng = e.coord.lng()
    addMarker(lat, lng)

    const { nx, ny } = convertGRID_GPS("toXY", lat, lng)
    onMapClick?.(nx, ny)
    fetchWeatherData(nx, ny)
    ;(window as any).naver.maps.Service.reverseGeocode(
      {
        coords: new (window as any).naver.maps.LatLng(lat, lng),
        orders: [
          (window as any).naver.maps.Service.OrderType.ADDR,
          (window as any).naver.maps.Service.OrderType.ROAD_ADDR,
        ].join(","),
      },
      (status: any, response: any) => {
        if (status === (window as any).naver.maps.Service.Status.OK) {
          const address =
            response.v2.address.jibunAddress || response.v2.address.roadAddress
          setClickedInfo({ lat, lng, address })
          setShowInfoPanel(true)
          setIsAddressExpanded(false)
        }
      },
    )
  }

  // ✅ 네이버 지도 초기화
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
      const map = new naver.maps.Map(mapRef.current, {
        center: new naver.maps.LatLng(DEFAULT_LAT, DEFAULT_LNG),
        zoom: 15,
      })
      mapInstance.current = map
      naver.maps.Event.addListener(map, "click", handleMapClick)
    }

    const handleResize = () => {
      if (mapInstance.current)
        (window as any).naver.maps.Event.trigger(mapInstance.current, "resize")
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [lat, lng])

  // ✅ 실시간 드론 경로 업데이트 (DroneSimulation.tsx → window 이벤트)
  useEffect(() => {
    const handleDroneUpdate = (e: CustomEvent) => {
      const { lat, lng } = e.detail
      if (!lat || !lng || !mapInstance.current) return

      // ✅ 경로 누적
      pathCoords.current.push(new (window as any).naver.maps.LatLng(lat, lng))

      // ✅ 이전 경로 삭제 후 새로 그림
      if (polylineRef.current) polylineRef.current.setMap(null)
      polylineRef.current = new (window as any).naver.maps.Polyline({
        map: mapInstance.current,
        path: pathCoords.current,
        strokeColor: "#1E90FF",
        strokeWeight: 4,
        strokeOpacity: 0.8,
      })

      // ✅ 지도 중심 이동
      mapInstance.current.setCenter(
        new (window as any).naver.maps.LatLng(lat, lng),
      )
    }

    window.addEventListener("dronePositionUpdate", handleDroneUpdate)
    return () =>
      window.removeEventListener("dronePositionUpdate", handleDroneUpdate)
  }, [])

  // ✅ 경로 초기화 버튼
  const clearPath = () => {
    pathCoords.current = []
    if (polylineRef.current) {
      polylineRef.current.setMap(null)
      polylineRef.current = null
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col">
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

      {/* ✅ 경로 초기화 버튼 */}
      <button
        onClick={clearPath}
        className="absolute right-4 top-4 z-50 rounded bg-red-500 px-3 py-1 text-xs text-white shadow hover:bg-red-600"
      >
        경로 초기화
      </button>

      {/* ✅ 클릭 정보 표시 패널 */}
      {showInfoPanel && clickedInfo && (
        <div className="absolute bottom-0 left-0 right-0 z-50">
          <div className="mx-4 mb-4 rounded-lg bg-black/80 px-3 py-2 text-white backdrop-blur-sm">
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
                {/* 날씨 정보 */}
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
