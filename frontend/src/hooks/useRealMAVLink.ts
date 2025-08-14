import { useState, useEffect, useRef } from "react"

interface MAVLinkData {
  // GLOBAL_POSITION_INT (33) 메시지 - MAVLink 공식 포맷
  time_boot_ms: number // Timestamp (time since system boot) - uint32_t, ms
  lat: number // Latitude, expressed (scaled integer, 1e7 = 1 degree) - int32_t, degE7
  lon: number // Longitude, expressed (scaled integer, 1e7 = 1 degree) - int32_t, degE7
  alt: number // Altitude (MSL) - int32_t, mm
  relative_alt: number // Altitude above home - int32_t, mm
  vx: number // Ground X Speed (Latitude, positive north) - int16_t, cm/s
  vy: number // Ground Y Speed (Longitude, positive east) - int16_t, cm/s
  vz: number // Ground Z Speed (Altitude, positive down) - int16_t, cm/s
  hdg: number // Vehicle heading (yaw angle), 0.0..359.99 degrees - uint16_t, cdeg

  // 추가 MAVLink 메시지들
  battery_remaining: number // SYS_STATUS 메시지에서
  system_status: string // HEARTBEAT 메시지에서
  timestamp: string // 웹에서 추가한 타임스탬프
}

interface MAVLinkConnection {
  data: MAVLinkData | null
  isConnected: boolean
  error: string | null
  connect: () => void
  disconnect: () => void
  sendCommand: (command: string, params?: any) => void
}

export const useRealMAVLink = (): MAVLinkConnection => {
  const [data, setData] = useState<MAVLinkData | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const connect = () => {
    // 로컬 시뮬레이션으로 즉시 연결 (테스트용)
    console.log("로컬 MAVLink 시뮬레이션 시작")
    setIsConnected(true)
    setError(null)

    // 시뮬레이션 데이터 생성
    intervalRef.current = setInterval(() => {
      const simulatedData = {
        time_boot_ms: Date.now(),
        lat: 365943000, // 36.5943 * 1e7
        lon: 126292900, // 126.2929 * 1e7
        alt: 100000, // 100m * 1000
        relative_alt: 50000, // 50m * 1000
        vx: 1000, // 10 m/s * 100
        vy: 500, // 5 m/s * 100
        vz: 0,
        hdg: 18000, // 180도 * 100
        battery_remaining: 85,
        system_status: "connected",
        timestamp: new Date().toISOString(),
      }
      setData(simulatedData)
    }, 1000)
  }

  const disconnect = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsConnected(false)
    setData(null)
    console.log("MAVLink 시뮬레이션 중지")
  }

  const sendCommand = (command: string, params: any = {}) => {
    console.log("MAVLink 명령 전송 (시뮬레이션):", command, params)
    // 시뮬레이션에서는 명령을 로그로만 출력
  }

  useEffect(() => {
    // 컴포넌트 마운트 시 자동 연결
    connect()

    // 컴포넌트 언마운트 시 연결 해제
    return () => {
      disconnect()
    }
  }, [])

  return {
    data,
    isConnected,
    error,
    connect,
    disconnect,
    sendCommand,
  }
}
