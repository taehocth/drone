import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Typography } from "@/components/Common/Typography"
import {
  Battery,
  Calendar,
  Clock,
  TrendingUp as Altitude,
  Gauge,
  ArrowRight as LinkIcon,
  Plane,
  Activity,
} from "lucide-react"

import { ConnectionsType } from "@/enum"
import { Link } from "@tanstack/react-router"

interface UavCardProps {
  uav: {
    id: string
    name: string
    status: ConnectionsType
    battery: number
    altitude: number
    speed: number
    lastUpdate: string
  }
  // onClick?: () => void
}

function getBatteryColorClass(batteryLevel: number): string {
  if (batteryLevel > 60) return "bg-green-500"
  if (batteryLevel > 20) return "bg-yellow-500"
  return "bg-red-500"
}

export function UavCard({ uav }: UavCardProps) {
  return (
    <Card className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl">
      <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-indigo-500 p-2">
              {uav.altitude > 0 ? (
                <Activity className="h-5 w-5 text-white" />
              ) : (
                <Plane className="h-5 w-5 text-white" />
              )}
            </div>
            <div>
              <CardTitle>기체 정보</CardTitle>
              <CardDescription>{uav.name}</CardDescription>
            </div>
          </div>
          <Link
            className="flex items-center gap-2"
            to="/uav/$uav"
            params={{
              uav: uav.id.toString(),
            }}
          >
            <Typography variant="bold" className="text-primary">
              상세 보기
            </Typography>
            <LinkIcon className="stroke-primary size-6" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex items-center gap-4 rounded-lg border p-4">
            <Battery className="text-muted-foreground h-5 w-5" />
            <div>
              <Typography variant="span" className="block leading-none">
                배터리
              </Typography>
              <Typography
                variant="span"
                className="text-muted-foreground block"
              >
                {uav.battery}%
              </Typography>
            </div>
            <div
              className={`h-2 w-16 max-w-80 rounded-full ${getBatteryColorClass(uav.battery)}`}
              style={{ width: `${uav.battery}%` }}
            >
              <div
                className={`h-full rounded-full ${getBatteryColorClass(uav.battery)}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <Altitude className="text-muted-foreground h-5 w-5" />
              <div>
                <Typography variant="span" className="block leading-none">
                  고도
                </Typography>
                <Typography
                  variant="span"
                  className="text-muted-foreground block"
                >
                  {uav.altitude} m
                </Typography>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <Gauge className="text-muted-foreground h-5 w-5" />
              <div>
                <Typography variant="span" className="block leading-none">
                  속도
                </Typography>
                <Typography
                  variant="span"
                  className="text-muted-foreground block"
                >
                  {uav.speed} m/s
                </Typography>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <Calendar className="text-muted-foreground h-5 w-5" />
              <div>
                <Typography variant="span" className="block leading-none">
                  날짜
                </Typography>
                <Typography
                  variant="span"
                  className="text-muted-foreground block"
                >
                  {new Date().toLocaleDateString("ko-KR")}
                </Typography>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <Clock className="text-muted-foreground h-5 w-5" />
              <div>
                <Typography variant="span" className="block leading-none">
                  마지막 업데이트
                </Typography>
                <Typography
                  variant="span"
                  className="text-muted-foreground block"
                >
                  {uav.lastUpdate}
                </Typography>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
