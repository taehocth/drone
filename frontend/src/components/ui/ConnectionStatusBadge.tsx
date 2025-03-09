import { ConnectionStatus, ConnectionStatusConfig } from "../../enum"
import { Badge } from "./badge"

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus
}

export const ConnectionStatusBadge = ({
  status,
}: ConnectionStatusBadgeProps) => {
  const { text, color } = ConnectionStatusConfig[status]
  return <Badge className={`${color} h-6`}>{text}</Badge>
}
