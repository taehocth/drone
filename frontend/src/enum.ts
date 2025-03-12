export enum ConnectionsType {
  Connecting = "CONNECTING",
  Connected = "CONNECTED",
  Disconnected = "DISCONNECTED",
}

export const ConnectionConfig = {
  [ConnectionsType.Connecting]: {
    label: "대기",
    color: "bg-gray-400",
  },
  [ConnectionsType.Connected]: {
    label: "활성",
    color: "bg-green-400",
  },
  [ConnectionsType.Disconnected]: {
    label: "끊김",
    color: "bg-red-400",
  },
} as const
