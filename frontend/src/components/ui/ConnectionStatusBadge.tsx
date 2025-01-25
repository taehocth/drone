import { Badge } from "@chakra-ui/react"
import { ConnectionStatus, ConnectionStatusConfig } from "../../enum"

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus
}

export const ConnectionStatusBadge = ({
  status,
}: ConnectionStatusBadgeProps) => {
  const { text, color } = ConnectionStatusConfig[status]
  return <Badge colorScheme={color}>{text}</Badge>
}
