import { ConnectionsType, ConnectionConfig } from "../../enum"
import { Badge } from "../ui/badge"

interface ConnectionBadgeProps {
  status: ConnectionsType
}

export const ConnectionBadge = ({ status }: ConnectionBadgeProps) => {
  const { label, color } = ConnectionConfig[status]
  return <Badge className={`${color} h-6`}>{label}</Badge>
}
