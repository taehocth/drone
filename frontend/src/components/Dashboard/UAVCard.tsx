import { ConnectionStatusBadge } from "../ui/ConnectionStatusBadge"

import { Link } from "@tanstack/react-router"

import { ConnectionStatus } from "../../enum"
import { Typography } from "../Common/Typography"
import { Separator } from "@radix-ui/react-separator"

interface UAVCardProps {
  id: number
}

export const UAVCard = ({ id }: UAVCardProps) => {
  return (
    <div className="p-4 m-2 w-full md:w-1/2 lg:w-1/3 border-1 border-gray-200 rounded-md shadow-md">
      <div className="flex justify-between">
        <div className="flex gap-2">
          <CardThumbnail />
          <Typography variant="h3">UAV1</Typography>
        </div>
        <ConnectionStatusBadge status={ConnectionStatus.Connected} />
      </div>
      <Separator />

      <Link
        to="/uav/$uav"
        params={{
          uav: id.toString(),
        }}
      >
        상세 보기 {"->"}
      </Link>

      {/* <Link to={UavRoute.path({ params: { uav: "123" } })}>Go to UAV 123</Link> */}
    </div>
  )
}

interface CardThumbnailProps {
  imageUrl?: string
  width?: string
  height?: string
}

export const CardThumbnail = ({
  imageUrl,
  width = "40px",
  height = "40px",
}: CardThumbnailProps) => {
  return imageUrl ? (
    <div className="rounded-md overflow-hidden">
      <img src={imageUrl} alt="Card thumbnail" width={width} height={height} />
    </div>
  ) : (
    // <Image
    //   src={imageUrl}
    //   alt="Card thumbnail"
    //   objectFit="cover"
    //   w={width}
    //   h={height}
    //   borderRadius="md"
    // />
    <svg
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      style={{ borderRadius: "0.375rem" }}
    >
      <rect width="100%" height="100%" fill={"gray.200"} />
      <text
        x="50%"
        y="50%"
        dy=".35em"
        textAnchor="middle"
        fontSize={32}
        fill="white"
      >
        {"u".toUpperCase() || "-"}
      </text>
    </svg>
  )
}
