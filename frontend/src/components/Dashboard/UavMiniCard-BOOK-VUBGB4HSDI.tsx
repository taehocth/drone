import { Battery, Plane, Activity } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { ConnectionBadge } from "@/components/Dashboard/ConnectionBadge"
import { ConnectionsType } from "@/enum"
import { Typography } from "@/components/Common/Typography"

import { cn } from "@/lib/commonUtils"

interface UavMiniCardProps {
  uav: {
    id: string
    name: string
    location: { lat: number; lng: number }
    status: ConnectionsType
    battery: number
    altitude: number
    speed: number
    lastUpdate: string
  }
  isSelected?: boolean
  onClick?: () => void
}

export function UavMiniCard({ uav, isSelected, onClick }: UavMiniCardProps) {
  const getStatusColor = (status: ConnectionsType) => {
    switch (status) {
      case ConnectionsType.Connected:
        return "border-green-200 bg-green-50/50 dark:bg-green-900/10"
      case ConnectionsType.Connecting:
        return "border-yellow-200 bg-yellow-50/50 dark:bg-yellow-900/10"
      case ConnectionsType.Disconnected:
        return "border-red-200 bg-red-50/50 dark:bg-red-900/10"
      default:
        return "border-gray-200 bg-gray-50/50 dark:bg-gray-900/10"
    }
  }

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg",
        isSelected && "border-primary scale-105 shadow-lg",
        getStatusColor(uav.status),
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`rounded-full p-2 ${
                uav.status === ConnectionsType.Connected
                  ? "bg-green-500"
                  : uav.status === ConnectionsType.Connecting
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
            >
              {uav.altitude > 0 ? (
                <Activity className="h-4 w-4 text-white" />
              ) : (
                <Plane className="h-4 w-4 text-white" />
              )}
            </div>
            <Typography variant="h4" className="font-semibold">
              {uav.name}
            </Typography>
          </div>
          <ConnectionBadge status={uav.status} />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Battery
              className={`size-5 ${
                uav.battery > 50
                  ? "text-green-500"
                  : uav.battery > 20
                    ? "text-yellow-500"
                    : "text-red-500"
              }`}
            />
            <Typography
              variant="bold"
              className={`${
                uav.battery > 50
                  ? "text-green-600"
                  : uav.battery > 20
                    ? "text-yellow-600"
                    : "text-red-600"
              }`}
            >
              {uav.battery}%
            </Typography>
          </div>
          <div className="text-right">
            <Typography
              variant="small"
              className="text-muted-foreground text-xs"
            >
              {uav.lastUpdate}
            </Typography>
            {uav.altitude > 0 && (
              <Typography
                variant="small"
                className="text-xs font-medium text-blue-600"
              >
                {uav.altitude}m 고도
              </Typography>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// interface UAVCardProps {
//   id: number
// }

// export const UAVCard = ({ id }: UAVCardProps) => {
//   return (
//     <div className="border-1 m-2 w-full rounded-md border-gray-200 p-4 shadow-md md:w-1/2 lg:w-1/3">
//       <div className="flex justify-between">
//         <div className="flex gap-2">
//           <CardThumbnail />
//         </div>
//         <ConnectionStatusBadge status={ConnectionStatus.Connected} />
//       </div>
//       <Separator />

//       <Link
//         to="/uav/$uav"
//         params={{
//           uav: id.toString(),
//         }}
//       >
//         상세 보기 {"->"}
//       </Link>

//       <Link to={UavRoute.path({ params: { uav: "123" } })}>Go to UAV 123</Link>
//     </div>
//   )
// }

// interface CardThumbnailProps {
//   imageUrl?: string
//   width?: string
//   height?: string
// }

// export const CardThumbnail = ({
//   imageUrl,
//   width = "40px",
//   height = "40px",
// }: CardThumbnailProps) => {
//   return imageUrl ? (
//     <div className="overflow-hidden rounded-md">
//       <img src={imageUrl} alt="Card thumbnail" width={width} height={height} />
//     </div>
//   ) : (
//     // <Image
//     //   src={imageUrl}
//     //   alt="Card thumbnail"
//     //   objectFit="cover"
//     //   w={width}
//     //   h={height}
//     //   borderRadius="md"
//     // />
//     <svg
//       width={width}
//       height={height}
//       xmlns="http://www.w3.org/2000/svg"
//       style={{ borderRadius: "0.375rem" }}
//     >
//       <rect width="100%" height="100%" fill={"gray.200"} />
//       <text
//         x="50%"
//         y="50%"
//         dy=".35em"
//         textAnchor="middle"
//         fontSize={32}
//         fill="white"
//       >
//         {"u".toUpperCase() || "-"}
//       </text>
//     </svg>
//   )
// }
