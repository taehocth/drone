import { Battery } from "lucide-react"

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
  return (
    <Card
      className={cn(
        "hover:bg-muted/50 cursor-pointer transition-colors",
        isSelected && "border-primary",
      )}
      onClick={onClick}
    >
      <CardContent className="px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Typography variant="h4">{uav.name}</Typography>
          </div>
          <ConnectionBadge status={uav.status} />
        </div>

        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Battery className="text-muted-foreground size-7 fill-gray-100" />
            <Typography variant="bold">{uav.battery}%</Typography>
          </div>
          <Typography variant="small" className="text-muted-foreground text-xs">
            {uav.lastUpdate}
          </Typography>
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
