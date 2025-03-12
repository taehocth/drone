import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

interface FlightDataChartProps {
  data: Array<{
    time: string
    [key: string]: string | number
  }>
  dataKey: string
  label: string
  color: string
}

export function FlightDataChart({
  data,
  dataKey,
  label,
  color,
}: FlightDataChartProps) {
  return (
    <ChartContainer
      config={{
        [dataKey]: {
          label,
          color,
        },
      }}
      className="h-[300px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 20,
            right: 0,
            left: 0,
            bottom: 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="time"
            className="text-muted-foreground text-xs"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            className="text-muted-foreground text-xs"
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={`var(--color-${dataKey})`}
            fill={`var(--color-${dataKey})`}
            fillOpacity={0.2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
