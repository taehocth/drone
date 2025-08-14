import { useState, useEffect, useRef } from "react"

interface LocalQGCData {
  altitude: number
  speed: number
  battery: number
  location: { lat: number; lng: number }
  heading: number
  status: string
  timestamp: string
}

interface LocalQGCConnection {
  data: LocalQGCData | null
  isConnected: boolean
  error: string | null
  connect: () => void
  disconnect: () => void
  sendCommand: (command: string) => void
}

// 로컬 시뮬레이션 데이터 생성
const generateSimulatedData = (): LocalQGCData => {
  const baseLat = 37.5665
  const baseLng = 126.978

  return {
    altitude: Math.random() * 200 + 50, // 50-250m
    speed: Math.random() * 20 + 5, // 5-25 m/s
    battery: Math.random() * 40 + 60, // 60-100%
    location: {
      lat: baseLat + (Math.random() - 0.5) * 0.01,
      lng: baseLng + (Math.random() - 0.5) * 0.01,
    },
    heading: Math.random() * 360,
    status: "connected",
    timestamp: new Date().toISOString(),
  }
}

export const useLocalQGC = (): LocalQGCConnection => {
  const [data, setData] = useState<LocalQGCData | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const connect = () => {
    try {
      // 이미 연결되어 있으면 중복 연결 방지
      if (intervalRef.current) {
        return
      }

      setIsConnected(true)
      setError(null)
      console.log("로컬 QGC 시뮬레이션 시작")

      // 실시간 데이터 생성
      intervalRef.current = setInterval(() => {
        const simulatedData = generateSimulatedData()
        setData(simulatedData)
      }, 1000) // 1초마다 업데이트
    } catch (err) {
      setError("로컬 QGC 연결 실패")
      console.error("로컬 QGC 연결 오류:", err)
    }
  }

  const disconnect = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsConnected(false)
    setData(null)
    console.log("로컬 QGC 시뮬레이션 중지")
  }

  const sendCommand = (command: string) => {
    console.log("QGC 명령 전송:", command)
    // 여기서 실제 QGC 명령을 처리할 수 있습니다
  }

  useEffect(() => {
    console.log("useLocalQGC 마운트됨")
    // 컴포넌트 마운트 시 자동 연결
    connect()

    // 컴포넌트 언마운트 시 연결 해제
    return () => {
      console.log("useLocalQGC 언마운트됨")
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, []) // 빈 의존성 배열

  return {
    data,
    isConnected,
    error,
    connect,
    disconnect,
    sendCommand,
  }
}
