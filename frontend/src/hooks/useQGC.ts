import { useState, useEffect, useCallback } from "react"

interface MAVLinkData {
  altitude: number
  speed: number
  battery: number
  location: { lat: number; lng: number }
  status: string
  timestamp: string
}

interface QGCConnection {
  mavlinkData: MAVLinkData | null
  isConnected: boolean
  error: string | null
  connect: () => void
  disconnect: () => void
}

export const useQGC = (): QGCConnection => {
  const [mavlinkData, setMavlinkData] = useState<MAVLinkData | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)

  const connect = useCallback(() => {
    try {
      const websocket = new WebSocket("wss://127.0.0.1:8000/api/v1/qgc/ws/qgc")

      websocket.onopen = () => {
        setIsConnected(true)
        setError(null)
        console.log("QGC WebSocket 연결됨")
      }

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "mavlink_data") {
            setMavlinkData({
              ...data.data,
              timestamp: new Date().toISOString(),
            })
          }
        } catch (parseError) {
          console.error("QGC 데이터 파싱 오류:", parseError)
        }
      }

      websocket.onclose = () => {
        setIsConnected(false)
        console.log("QGC WebSocket 연결 끊김")
      }

      websocket.onerror = (event) => {
        setError("QGC WebSocket 연결 오류")
        console.error("QGC WebSocket 오류:", event)
      }

      setWs(websocket)
    } catch (err) {
      setError("QGC 연결 실패")
      console.error("QGC 연결 오류:", err)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (ws) {
      ws.close()
      setWs(null)
      setIsConnected(false)
    }
  }, [ws])

  useEffect(() => {
    // 컴포넌트 마운트 시 자동 연결
    connect()

    // 컴포넌트 언마운트 시 연결 해제
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    mavlinkData,
    isConnected,
    error,
    connect,
    disconnect,
  }
}
