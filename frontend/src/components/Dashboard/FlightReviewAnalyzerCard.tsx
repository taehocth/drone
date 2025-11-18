import { useState } from "react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Upload, Brain, FileChartColumn } from "lucide-react"
import Papa from "papaparse"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

interface ParsedLog {
  time: number
  altitude: number
  speed: number
  battery: number
}

export interface AnalysisResult {
  totalTimeMinutes: number
  maxAltitude: number
  avgSpeed: number
  batteryDrop: number
  rapidDescentDetected: boolean
  esc_temp_max?: number

  extra?: {
    // Battery
    battery_avg_voltage?: number
    battery_peak_current?: number
    battery_min_voltage?: number
    battery_voltage_ripple?: number
    battery_avg_current?: number
    battery_temp?: number

    // ESC
    esc_avg_output?: number
    esc_max_output?: number
    esc_output_std?: number
    esc_imbalance_index?: number
    esc_avg_rpm?: number

    // ⭐ 여기 추가해야 함
    esc_rpm_avg?: number[] // ESC RPM 배열
    esc_temp_max?: number[] // ESC 온도 배열

    // FCC
    fcc_roll_std?: number
    fcc_pitch_std?: number
    fcc_yaw_std?: number
    vibration_accel?: number
    imu_clips?: number
    max_attitude_deg?: number

    // GNSS
    gnss_avg_sat?: number
    gnss_hdop?: number
    gnss_fix_type?: number
    gnss_alt_std?: number
    gnss_signal_loss_count?: number

    // Flight Summary
    max_ground_speed?: number
    max_altitude?: number
    max_climb_rate?: number
    max_descent_rate?: number
    landing_impact?: number
  }
}
type FlightReviewAnalyzerCardProps = {
  onAnalysisChange?: (result: AnalysisResult | null) => void
}

export function FlightReviewAnalyzerCard({
  onAnalysisChange,
}: FlightReviewAnalyzerCardProps = {}) {
  const [data, setData] = useState<ParsedLog[]>([])
  const [summary, setSummary] = useState<string>("")
  const [fileName, setFileName] = useState<string>("")
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  )

  // 📁 파일 업로드 핸들러
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSummary("")
    setAnalysisResult(null)
    onAnalysisChange?.(null)

    if (file.name.endsWith(".ulg")) {
      await parseUlgFile(file)
    } else if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
      parseCsvFile(file)
    } else {
      setSummary(
        "지원하지 않는 파일 형식입니다. CSV 또는 ULG 파일을 업로드해주세요.",
      )
    }
  }

  // 📊 CSV 파싱
  const parseCsvFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result: Papa.ParseResult<any>) => {
        if (!result.data || result.data.length === 0) {
          setSummary("CSV 파일이 비어 있거나 잘못된 형식입니다.")
          onAnalysisChange?.(null)
          return
        }
        const parsed: ParsedLog[] = result.data.map((row: any) => ({
          time: parseFloat(row.TimeUS) / 1_000_000 || 0,
          altitude: parseFloat(row.Alt || row.altitude || 0),
          speed: parseFloat(row.GroundSpeed || row.speed || 0),
          battery: parseFloat(row.Battery || row.battery || 0),
        }))
        setData(parsed)
        generateSummary(parsed)
      },
      error: (err) => {
        console.error(err)
        setSummary("CSV 파일을 읽는 중 오류가 발생했습니다.")
        onAnalysisChange?.(null)
      },
    })
  }

  // 🧩 ULG 파일 파싱 (백엔드 연동)
  const parseUlgFile = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("http://localhost:8000/api/v1/logs/analyze", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        setSummary(`ULG 파일 업로드 실패 (${res.status} ${res.statusText})`)
        onAnalysisChange?.(null)
        return
      }

      const result = await res.json().catch(() => ({}))
      if (!result || !result.data) {
        setSummary(result.error || "ULG 파일 처리 실패 (서버 응답 오류)")
        onAnalysisChange?.(null)
        return
      }

      const parsed = Array.isArray(result.data)
        ? result.data.map((row: any) => ({
            time: row.time || 0,
            altitude: row.altitude || 0,
            speed: row.speed || 0,
            battery: row.battery ?? 0,
          }))
        : []

      if (parsed.length === 0) {
        setSummary("ULG 파일에서 데이터를 추출하지 못했습니다.")
        onAnalysisChange?.(null)
        return
      }

      setData(parsed)
      // ✅ 백엔드 summary 함께 전달
      generateSummary(parsed, result.summary ?? {})
    } catch (err) {
      console.error(err)
      setSummary("ULG 파일 처리 실패 (서버 연결 오류)")
      onAnalysisChange?.(null)
    }
  }

  // 🤖 로그 자동 분석
  const generateSummary = (data: ParsedLog[], extraSummary: any = {}) => {
    if (!data || data.length === 0) {
      setSummary("로그 데이터가 비어 있습니다.")
      onAnalysisChange?.(null)
      return
    }

    const totalTime = (data[data.length - 1].time - data[0].time) / 60
    const maxAlt = Math.max(...data.map((d) => d.altitude))
    const avgSpeed =
      data.reduce((sum, d) => sum + d.speed, 0) / data.length || 0

    // ⚙️ 비행 중(상승~하강) 구간만 추출하여 배터리 계산
    const startIdx = Math.floor(data.length * 0.05)
    const endIdx = Math.floor(data.length * 0.95)
    const activeData = data.slice(startIdx, endIdx)

    const startAvg =
      activeData
        .slice(0, Math.min(100, activeData.length))
        .reduce((sum, d) => sum + d.battery, 0) /
      Math.min(100, activeData.length)

    const endAvg =
      activeData
        .slice(-Math.min(100, activeData.length))
        .reduce((sum, d) => sum + d.battery, 0) /
      Math.min(100, activeData.length)

    const batteryDrop = startAvg - endAvg

    let summaryText = `총 비행 시간은 약 ${totalTime.toFixed(
      1,
    )}분이며, 최고 고도는 ${maxAlt.toFixed(
      1,
    )}m, 평균 속도는 ${avgSpeed.toFixed(1)}m/s였습니다.`

    if (batteryDrop > 3)
      summaryText += ` 배터리 소모율이 ${batteryDrop.toFixed(1)}%로 확인되었습니다.`
    if (maxAlt > 120)
      summaryText += ` 비행 고도가 120m 이상으로, 비가시권(BVLOS) 가능성이 있습니다.`

    const rapidDesc = data.some(
      (d, i, arr) => i > 0 && arr[i - 1].altitude - d.altitude > 40,
    )
    if (rapidDesc) summaryText += ` 급하강 구간이 감지되었습니다.`

    setSummary(summaryText)
    const result: AnalysisResult = {
      totalTimeMinutes: totalTime,
      maxAltitude: maxAlt,
      avgSpeed,
      batteryDrop,
      rapidDescentDetected: rapidDesc,
      extra: extraSummary, // ✅ 여기에 올바르게 저장
    }
    setAnalysisResult(result)
    onAnalysisChange?.(result)
  }

  return (
    <Card className="transition-all hover:shadow-lg">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-800/20">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-indigo-500 p-2">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle>PX4 비행 로그 분석기</CardTitle>
            <CardDescription>
              CSV 및 ULG 로그 업로드 기반 자동 분석 (Flight Review 스타일)
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gray-300 p-4 hover:bg-gray-50 dark:hover:bg-gray-800">
          <Upload className="h-5 w-5 text-gray-500" />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {fileName ? `${fileName} 업로드 완료` : "CSV 또는 ULG 로그 업로드"}
          </span>
          <input
            type="file"
            accept=".csv,.txt,.ulg"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {/* 데이터 그래프 */}
        {data.length > 0 && (
          <div className="h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickCount={10}
                  interval="preserveStartEnd"
                  tickFormatter={(t) => {
                    if (t >= 60) {
                      const m = Math.floor(t / 60)
                      const s = Math.floor(t % 60)
                      return s === 0 ? `${m}m` : `${m}m ${s}s`
                    }
                    return `${t.toFixed(0)}s`
                  }}
                />
                <YAxis />
                <Tooltip
                  formatter={(value: number, name: string, props: any) => {
                    if (props.dataKey === "altitude")
                      return [`${value.toFixed(1)} m`, "고도"]
                    if (props.dataKey === "speed")
                      return [`${value.toFixed(1)} m/s`, "속도"]
                    if (props.dataKey === "battery")
                      return [`${value.toFixed(1)} %`, "배터리"]
                    return [value, name]
                  }}
                  labelFormatter={(label) => {
                    const totalSec = Math.floor(label)
                    const m = Math.floor(totalSec / 60)
                    const s = totalSec % 60
                    return m > 0 ? `시간: ${m}분 ${s}초` : `시간: ${s}초`
                  }}
                />
                <Legend verticalAlign="top" height={36} />
                <Line
                  type="monotone"
                  dataKey="altitude"
                  stroke="#3b82f6"
                  name="고도 (m)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="speed"
                  stroke="#f59e0b"
                  name="속도 (m/s)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="battery"
                  stroke="#ef4444"
                  name="배터리 (%)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {summary && (
          <div className="flex items-start gap-3 rounded-lg bg-indigo-50 p-3 dark:bg-indigo-900/10">
            <FileChartColumn className="mt-0.5 h-5 w-5 text-indigo-500" />
            <p className="text-sm text-gray-800 dark:text-gray-300">
              {summary}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
