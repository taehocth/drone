"use client"

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { LucideCircleHelp } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { type KindexRecent } from "@/client"

interface GeomagneticChartProps {
  kindexRecent: KindexRecent[] | undefined
}

const chartConfig = {
  kp: {
    label: "kp",
    color: "--chart-2",
  },
  kk: {
    label: "kk",
    color: "--chart-5",
  },
} satisfies ChartConfig

export const GeomagneticChart = ({ kindexRecent }: GeomagneticChartProps) => {
  const refinedKindexRecent = kindexRecent?.map((item) => ({
    ...item,
    time: `${item.time.substring(0, 13)}시`,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>지구자기장 관측 데이터</CardTitle>
        <CardDescription>
          관측 값을 0 ~ 9 로그 스케일로 산출합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={refinedKindexRecent}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${value.substring(11, 13)}시`}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <defs>
              <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--chart-2)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--chart-2)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--chart-5)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--chart-5)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <Area
              dataKey="kk"
              type="natural"
              fill="url(#fillMobile)"
              fillOpacity={0.4}
              stroke="var(--chart-5)"
              stackId="a"
            />
            <Area
              dataKey="kp"
              type="natural"
              fill="url(#fillDesktop)"
              fillOpacity={0.4}
              stroke="var(--chart-2)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-center gap-2 text-sm opacity-80">
          <LucideCircleHelp className="size-6 stroke-gray-500" />
          <div className="grid gap-2">
            <div className="flex items-center leading-none text-[var(--chart-2)]">
              KP
              <span className="text-gray-500">
                : 미국 북반구 위도 44~60도 사이 8개 관측소 데이터
              </span>
            </div>
            <div className="flex items-center text-[var(--chart-5)]">
              KK
              <span className="text-gray-500">
                : 국내 이천, 강릉, 제주 관측소 데이터
              </span>
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
