export enum ConnectionStatus {
  Connecting = "CONNECTING",
  Connected = "CONNECTED",
  Disconnected = "DISCONNECTED",
}

export const ConnectionStatusConfig = {
  [ConnectionStatus.Connecting]: {
    text: "연결 중",
    color: "gray",
  },
  [ConnectionStatus.Connected]: {
    text: "연결 성공",
    color: "green",
  },
  [ConnectionStatus.Disconnected]: {
    text: "연결 끊김",
    color: "red",
  },
} as const
