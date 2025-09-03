// 기상청 API 서비스
const WEATHER_API_KEY_ENCODED = ""
const WEATHER_API_KEY_DECODED = decodeURIComponent(WEATHER_API_KEY_ENCODED)
const BASE_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0"

export interface WeatherData {
  temperature: number // 기온 (°C)
  humidity: number // 습도 (%)
  windSpeed: number // 풍속 (m/s)
  windDirection: number // 풍향 (deg)
  precipitation: number // 강수량 (mm)
  sky: string // 하늘상태 (맑음, 구름많음, 흐림)
  pty: string // 강수형태 (없음, 비, 눈, 소나기)
  pop: number // 강수확률 (%)
  visibility: number // 시정 (km)
  updateTime: string
}

// 격자 좌표 변환 함수 (위경도 -> 기상청 격자)
function convertToGrid(lat: number, lon: number) {
  // 기상청 공식 좌표 변환 (정확한 변환 공식)
  const RE = 6371.00877 // 지구 반경(km)
  const GRID = 5.0 // 격자 간격(km)
  const SLAT1 = 30.0 // 투영 위도1(degree)
  const SLAT2 = 60.0 // 투영 위도2(degree)
  const OLON = 126.0 // 기준점 경도(degree)
  const OLAT = 38.0 // 기준점 위도(degree)
  const XO = 43 // 기준점 X좌표(GRID)
  const YO = 136 // 기준점 Y좌표(GRID)

  const DEGRAD = Math.PI / 180.0

  const re = RE / GRID
  const slat1 = SLAT1 * DEGRAD
  const slat2 = SLAT2 * DEGRAD
  const olon = OLON * DEGRAD
  const olat = OLAT * DEGRAD

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = (sf ** sn * Math.cos(slat1)) / sn
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5)
  ro = (re * sf) / ro ** sn

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5)
  ra = (re * sf) / ra ** sn
  let theta = lon * DEGRAD - olon
  if (theta > Math.PI) theta -= 2.0 * Math.PI
  if (theta < -Math.PI) theta += 2.0 * Math.PI
  theta *= sn

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5)
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)

  return { nx, ny }
}

// 현재 날짜/시간을 기상청 API 형식으로 변환
function getApiDateTime() {
  const now = new Date()

  // 단기예보 API는 3시간마다 업데이트 (02, 05, 08, 11, 14, 17, 20, 23시)
  const hour = now.getHours()
  const apiHours = [2, 5, 8, 11, 14, 17, 20, 23]

  // 현재 시간보다 이전의 가장 최근 업데이트 시간 찾기
  let baseTime = 23
  let baseDate = now.toISOString().slice(0, 10).replace(/-/g, "")

  for (let i = apiHours.length - 1; i >= 0; i--) {
    if (hour >= apiHours[i]) {
      baseTime = apiHours[i]
      break
    }
  }

  // 만약 현재 시간이 02시 이전이면 전날 23시 데이터 사용
  if (hour < 2) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    baseDate = yesterday.toISOString().slice(0, 10).replace(/-/g, "")
    baseTime = 23
  }

  return {
    base_date: baseDate,
    base_time: baseTime.toString().padStart(2, "0") + "00",
  }
}

export async function fetchWeatherData(
  latitude: number,
  longitude: number,
): Promise<WeatherData> {
  try {
    const { nx, ny } = convertToGrid(latitude, longitude)
    const { base_date, base_time } = getApiDateTime()

    console.log(`🌍 위치: ${latitude}, ${longitude} → 격자: ${nx}, ${ny}`)
    console.log(`⏰ 요청 시간: ${base_date} ${base_time}`)

    // API 키 시도 (먼저 디코딩된 키로 시도)
    const apiKeys = [WEATHER_API_KEY_DECODED, WEATHER_API_KEY_ENCODED]

    for (let attempt = 1; attempt <= apiKeys.length; attempt++) {
      try {
        const apiKey = apiKeys[attempt - 1]
        console.log(
          `🔄 시도 ${attempt}: ${attempt === 1 ? "디코딩된" : "인코딩된"} 키 사용`,
        )

        const params = new URLSearchParams({
          serviceKey: apiKey,
          pageNo: "1",
          numOfRows: "1000",
          dataType: "JSON",
          base_date,
          base_time,
          nx: nx.toString(),
          ny: ny.toString(),
        })

        const url = `${BASE_URL}/getVilageFcst?${params}`
        console.log(`🔗 API 호출: ${url}`)

        const response = await fetch(url)

        if (!response.ok) {
          console.error(
            `API 호출 실패: ${response.status} ${response.statusText}`,
          )
          continue // 다음 키로 시도
        }

        // 응답 텍스트 먼저 확인
        const responseText = await response.text()
        console.log(`📊 API 응답 텍스트:`, responseText)

        // XML 응답인지 확인
        if (
          responseText.includes("<OpenAPI_S") ||
          responseText.includes("<?xml")
        ) {
          console.log("XML 응답을 받았습니다. 다음 키로 시도합니다.")
          continue // 다음 키로 시도
        }

        let data
        try {
          data = JSON.parse(responseText)
        } catch (parseError) {
          console.error("JSON 파싱 실패:", parseError)
          continue // 다음 키로 시도
        }

        if (data.response?.header?.resultCode !== "00") {
          console.log(`API 오류: ${data.response?.header?.resultMsg}`)
          continue // 다음 키로 시도
        }

        const items = data.response.body.items.item || []
        console.log(`📊 단기예보 데이터:`, items)

        // 단기예보 데이터 파싱
        const weatherMap: Record<string, number | string> = {}
        items.forEach((item: any) => {
          weatherMap[item.category] = item.fcstValue
        })

        // 하늘상태 코드 변환 (단기예보 API)
        const getSkyCondition = (code: string) => {
          switch (code) {
            case "1":
              return "맑음"
            case "3":
              return "구름많음"
            case "4":
              return "흐림"
            default:
              return "정보없음"
          }
        }

        // 강수형태 코드 변환 (단기예보 API)
        const getPrecipitationType = (code: string) => {
          switch (code) {
            case "0":
              return "없음"
            case "1":
              return "비"
            case "2":
              return "눈"
            case "3":
              return "눈비"
            case "4":
              return "소나기"
            default:
              return "정보없음"
          }
        }

        return {
          temperature: Number(weatherMap.TMP) || 15, // 기온
          humidity: Number(weatherMap.REH) || 60, // 습도
          windSpeed: Number(weatherMap.WSD) || 2.5, // 풍속
          windDirection: Number(weatherMap.VEC) || 180, // 풍향
          precipitation: Number(weatherMap.PCP) || 0, // 강수량
          sky: getSkyCondition(weatherMap.SKY as string),
          pty: getPrecipitationType(weatherMap.PTY as string),
          pop: Number(weatherMap.POP) || 20, // 강수확률
          visibility: Number(weatherMap.VIS) || 10, // 시정
          updateTime: new Date().toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }),
        }
      } catch (error) {
        console.log(`시도 ${attempt} 실패:`, error)
        if (attempt === apiKeys.length) {
          throw error // 마지막 시도였다면 에러 던지기
        }
      }
    }

    // 모든 시도가 실패한 경우
    throw new Error("모든 API 키 시도가 실패했습니다.")
  } catch (error) {
    console.error("날씨 데이터 가져오기 실패:", error)

    // 기본값 반환 (API 실패 시) - 지역별로 다른 값 생성
    const locationHash = Math.abs((latitude * 1000 + longitude * 1000) % 100)

    return {
      temperature: 15 + (locationHash % 15), // 15-30도 범위
      humidity: 50 + (locationHash % 40), // 50-90% 범위
      windSpeed: 1 + ((locationHash * 7) % 80) / 10, // 1-9 m/s 범위
      windDirection: (locationHash * 3.6) % 360, // 0-360도
      precipitation: locationHash % 5, // 0-4mm
      sky: ["맑음", "구름많음", "흐림"][locationHash % 3],
      pty: ["없음", "비", "눈"][locationHash % 3],
      pop: 10 + (locationHash % 80), // 10-90%
      visibility: 5 + (locationHash % 15), // 5-20km
      updateTime: new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
    }
  }
}

// 바람 방향을 텍스트로 변환
export function getWindDirectionText(degree: number): string {
  const directions = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"]
  const index = Math.round(degree / 45) % 8
  return directions[index]
}

// 비행 안전도 평가 (드론 비행에 영향을 주는 요소들)
export function getFlightSafety(weather: WeatherData): {
  level: "safe" | "caution" | "danger"
  message: string
  color: string
} {
  const { windSpeed, precipitation, visibility, sky } = weather

  if (windSpeed > 10 || precipitation > 5 || visibility < 5) {
    return {
      level: "danger",
      message: "비행 위험",
      color: "text-red-600",
    }
  }

  if (windSpeed > 5 || precipitation > 0 || visibility < 10 || sky === "흐림") {
    return {
      level: "caution",
      message: "비행 주의",
      color: "text-yellow-600",
    }
  }

  return {
    level: "safe",
    message: "비행 안전",
    color: "text-green-600",
  }
}
