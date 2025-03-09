export enum ConnectionStatus {
  Connecting = "CONNECTING",
  Connected = "CONNECTED",
  Disconnected = "DISCONNECTED",
}

export const ConnectionStatusConfig = {
  [ConnectionStatus.Connecting]: {
    text: "연결 중",
    color: "bg-gray-400",
  },
  [ConnectionStatus.Connected]: {
    text: "연결 성공",
    color: "bg-green-400",
  },
  [ConnectionStatus.Disconnected]: {
    text: "연결 끊김",
    color: "bg-red-400",
  },
} as const
