// -------------------------------
// CBM Status Card (Apple × Aviation Style)
// -------------------------------

import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Battery,
  Thermometer,
  Cpu,
  Satellite,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react"
import type { AnalysisResult } from "@/components/Dashboard/FlightReviewAnalyzerCard"

// --------------------------------------------------------
// Types
// --------------------------------------------------------
type Level = "safe" | "warning" | "danger"

interface SubMetric {
  label: string
  value: string
  desc?: string
  unit?: string
  level?: Level
  reason?: string
}

interface SystemStatus {
  name: string
  icon: JSX.Element
  level: Level
  message: string
  metrics: SubMetric[]
}

// --------------------------------------------------------
// Color theme (Apple × Aviation)
// --------------------------------------------------------
const levelColor: Record<Level, string> = {
  safe: "border-green-300/30 bg-gradient-to-br from-green-200/30 to-green-300/20",
  warning: "border-yellow-300/40 bg-gradient-to-br from-yellow-100/30 to-yellow-300/20",
  danger: "border-red-300/40 bg-gradient-to-br from-red-100/30 to-red-300/20",
}

const levelIcon: Record<Level, JSX.Element> = {
  safe: <CheckCircle className="h-5 w-5 text-green-500 drop-shadow" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500 drop-shadow" />,
  danger: <XCircle className="h-5 w-5 text-red-500 drop-shadow" />,
}

const metricLevelColor: Record<Level, string> = {
  safe: "bg-green-100/20 border-green-300/40",
  warning: "bg-yellow-100/20 border-yellow-300/40",
  danger: "bg-red-100/20 border-red-300/40",
}

const metricLevelIcon: Record<Level, JSX.Element> = {
  safe: <CheckCircle className="h-4 w-4 text-green-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  danger: <XCircle className="h-4 w-4 text-red-500" />,
}

// --------------------------------------------------------
// Number Formatting
// --------------------------------------------------------
function formatNumber(raw: any): string {
  if (raw === "-" || raw === undefined || raw === null) return "-"
  const v = typeof raw === "number" ? raw : parseFloat(raw)
  if (isNaN(v)) return "-"
  if (Math.abs(v) >= 100) return v.toFixed(1)
  if (Math.abs(v) >= 1) return v.toFixed(2)
  return v.toFixed(3)
}

// --------------------------------------------------------
// Metric Evaluation
// --------------------------------------------------------
function evalMetric(label: string, rawValue: any) {
  const value = typeof rawValue === "number" ? rawValue : parseFloat(rawValue)
  if (isNaN(value)) return { level: "safe" as Level, reason: "" }

  if (label === "평균 전압") {
    if (value < 18) return { level: "danger", reason: "평균 전압이 매우 낮습니다." }
    if (value < 20) return { level: "warning", reason: "평균 전압이 낮은 편입니다." }
    return { level: "safe", reason: "전압 정상" }
  }

  if (label === "최저 전압") {
    if (value < 17) return { level: "danger", reason: "최저 전압 매우 낮음" }
    if (value < 19) return { level: "warning", reason: "최저 전압 낮음" }
    return { level: "safe", reason: "안정적인 최저 전압" }
  }

  if (label === "평균 전류" || label === "최대 전류") {
    if (value >= 40) return { level: "danger", reason: "전류 과부하" }
    if (value >= 20) return { level: "warning", reason: "전류 높음" }
    return { level: "safe", reason: "전류 정상" }
  }

  if (label.includes("ESC 출력")) {
    if (value >= 1600) return { level: "danger", reason: "ESC 출력 과다" }
    if (value >= 1300) return { level: "warning", reason: "ESC 출력 높음" }
    return { level: "safe", reason: "ESC 출력 정상" }
  }

  if (label === "출력 변동성") {
    if (value >= 200) return { level: "danger", reason: "출력 변동 심함" }
    if (value >= 100) return { level: "warning", reason: "출력 변동 있음" }
    return { level: "safe", reason: "출력 안정적" }
  }

  if (label === "평균 위성 수") {
    if (value < 6) return { level: "danger", reason: "위성 수신 부족" }
    if (value < 10) return { level: "warning", reason: "위성 부족" }
    return { level: "safe", reason: "수신 양호" }
  }

  if (label === "HDOP") {
    if (value >= 2.5) return { level: "danger", reason: "정확도 낮음" }
    if (value >= 1.5) return { level: "warning", reason: "정확도 낮아짐" }
    return { level: "safe", reason: "정확도 우수" }
  }

  if (label === "고도 표준편차") {
    if (value >= 3) return { level: "danger", reason: "고도 불안정" }
    if (value >= 1.5) return { level: "warning", reason: "고도 변동 있음" }
    return { level: "safe", reason: "고도 안정적" }
  }

  return { level: "safe", reason: "정상" }
}

// --------------------------------------------------------
// Component
// --------------------------------------------------------
export function LogCBMStatusCard({ analysis }: { analysis: AnalysisResult | null }) {
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const [openSections, setOpenSections] = useState([false, false, false, false])

  if (!analysis) {
    return (
      <Card className="border bg-white/40 shadow-lg backdrop-blur-xl rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            상태 기반 정비 (CBM)
          </CardTitle>
        </CardHeader>
        <CardContent>로그를 업로드하면 상태가 분석됩니다.</CardContent>
      </Card>
    )
  }

  const e = analysis.extra ?? {}

  const statuses: SystemStatus[] = [
    {
      name: "배터리",
      icon: <Battery className="h-6 w-6 text-amber-500 drop-shadow" />,
      level:
        (analysis.batteryDrop ?? 0) > 35 ? "danger"
        : (analysis.batteryDrop ?? 0) > 20 ? "warning"
        : "safe",
      message:
        (analysis.batteryDrop ?? 0) > 35
          ? "배터리 급격한 소모"
          : (analysis.batteryDrop ?? 0) > 20
          ? "소모량 다소 높음"
          : "안정적입니다",
      metrics: [
        { label: "평균 전압", value: formatNumber(e.battery_avg_voltage), unit: "V", desc: "전압 평균" },
        { label: "최저 전압", value: formatNumber(e.battery_min_voltage), unit: "V", desc: "최저 전압" },
        { label: "평균 전류", value: formatNumber(e.battery_avg_current), unit: "A", desc: "전류 평균" },
        { label: "최대 전류", value: formatNumber(e.battery_peak_current), unit: "A", desc: "전류 피크" },
      ].map(m => ({ ...m, ...evalMetric(m.label, m.value) })),
    },

    {
      name: "ESC / 추진계",
      icon: <Thermometer className="h-6 w-6 text-red-500 drop-shadow" />,
      level:
        (e.esc_avg_output ?? 0) > 1600 ? "danger"
        : (e.esc_avg_output ?? 0) > 1300 ? "warning"
        : "safe",
      message:
        (e.esc_avg_output ?? 0) > 1600
          ? "추진계 과부하"
          : (e.esc_avg_output ?? 0) > 1300
          ? "추진계 부하 증가"
          : "정상 작동",
      metrics: [
        { label: "평균 ESC 출력", value: formatNumber(e.esc_avg_output), unit: "μs", desc: "평균 PWM" },
        { label: "최대 ESC 출력", value: formatNumber(e.esc_max_output), unit: "μs", desc: "최대 PWM" },
        { label: "출력 변동성", value: formatNumber(e.esc_output_std), unit: "μs", desc: "변동성" },

        ...(Array.isArray(e.esc_rpm_avg)
          ? e.esc_rpm_avg.map((rpm: number, idx: number) => ({
              label: `ESC RPM #${idx + 1}`,
              value: formatNumber(rpm),
              unit: "RPM",
              desc: "회전 속도",
              ...evalMetric("ESC RPM", rpm),
            }))
          : []),

        ...(Array.isArray(e.esc_temp_max)
          ? e.esc_temp_max.map((temp: number, idx: number) => ({
              label: `ESC 온도 #${idx + 1}`,
              value: formatNumber(temp),
              unit: "°C",
              desc: "온도",
              ...evalMetric("ESC 온도", temp),
            }))
          : []),
      ].map(m => ({ ...m, ...evalMetric(m.label, m.value) })),
    },

    {
      name: "FCC / 비행 제어",
      icon: <Cpu className="h-6 w-6 text-orange-500 drop-shadow" />,
      level:
        (e.fcc_roll_std ?? 0) > 0.1 || (e.fcc_pitch_std ?? 0) > 0.1
          ? "danger"
          : (e.fcc_roll_std ?? 0) > 0.05
          ? "warning"
          : "safe",
      message:
        (e.fcc_roll_std ?? 0) > 0.1
          ? "기체 떨림 심함"
          : (e.fcc_roll_std ?? 0) > 0.05
          ? "약간 흔들림"
          : "매우 안정적",
      metrics: [
        { label: "Roll 안정성", value: formatNumber(e.fcc_roll_std), desc: "좌우 흔들림" },
        { label: "Pitch 안정성", value: formatNumber(e.fcc_pitch_std), desc: "앞뒤 흔들림" },
        { label: "최대 기울기", value: formatNumber(e.max_attitude_deg), unit: "°", desc: "최대 기울기" },
      ].map(m => ({ ...m, ...evalMetric(m.label, m.value) })),
    },

    {
      name: "GNSS / GPS",
      icon: <Satellite className="h-6 w-6 text-blue-500 drop-shadow" />,
      level:
        (e.gnss_avg_sat ?? 0) < 6 ? "danger"
        : (e.gnss_avg_sat ?? 0) < 15 ? "warning"
        : "safe",
      message:
        (e.gnss_avg_sat ?? 0) < 6
          ? "GPS 신호 매우 약함"
          : (e.gnss_avg_sat ?? 0) < 10
          ? "신호 약함"
          : "신호 양호",
      metrics: [
        { label: "평균 위성 수", value: formatNumber(e.gnss_avg_sat), unit: "개", desc: "위성 수" },
        { label: "HDOP", value: formatNumber(e.gnss_hdop), desc: "정확도" },
        { label: "고도 표준편차", value: formatNumber(e.gnss_alt_std), unit: "m", desc: "고도 흔들림" },
        { label: "신호 손실 이벤트", value: formatNumber(e.gnss_signal_loss_count), unit: "회", desc: "Loss Count" },
      ].map(m => ({ ...m, ...evalMetric(m.label, m.value) })),
    },
  ]

  return (
    <Card className="
      rounded-3xl 
      border border-white/20 
      bg-white/30 
      shadow-2xl 
      backdrop-blur-2xl 
      p-6
    ">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-3 text-2xl font-bold text-gray-900 drop-shadow-sm">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
          상태 기반 정비 (CBM) 분석
        </CardTitle>
        <p className="text-gray-700/80 text-sm mt-1">
        </p>
      </CardHeader>

      <CardContent className="space-y-10">

        {/* TOP BUTTONS */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {statuses.map((sys, i) => (
            <button
              key={i}
              onClick={() =>
                setOpenSections(prev => {
                  const newVal = [...prev]
                  newVal[i] = !newVal[i]
                  return newVal
                })
              }
              className={`
                flex items-center gap-3 p-4 rounded-2xl border ${levelColor[sys.level]}
                shadow-md hover:shadow-xl hover:scale-[1.03]
                active:scale-[0.98] transition
                backdrop-blur-lg
              `}
            >
              <div className="rounded-full bg-white/50 p-2 shadow-inner backdrop-blur-xl">
                {sys.icon}
              </div>
              <div>
                <div className="font-semibold text-gray-800">{sys.name}</div>
                <div className="flex items-center gap-1 text-xs opacity-70">
                  {levelIcon[sys.level]}
                  <span>{sys.message}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* DETAIL SECTIONS */}
        {statuses.map((sys, i) => (
          <div
            key={i}
            ref={el => (sectionRefs.current[i] = el)}
            className={`transition-all duration-500 ${
              openSections[i] ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
            } overflow-hidden`}
          >
            <div className="
              mt-4 rounded-2xl border border-white/20 bg-white/30
              backdrop-blur-xl shadow-xl p-6
            ">
              <div className="mb-4 flex items-center gap-3 border-b border-white/30 pb-3">
                <div className={`rounded-full p-2 ${levelColor[sys.level]}`}>
                  {sys.icon}
                </div>
                <div>
                  <div className="text-xl font-bold text-gray-900">
                    {sys.name}
                  </div>
                  <div className="text-sm text-gray-700/70">
                    {sys.message}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {sys.metrics.map((m, idx) => (
                  <div
                    key={idx}
                    className={`
                      rounded-xl border p-5 shadow 
                      hover:shadow-xl hover:scale-[1.02] transition 
                      ${metricLevelColor[m.level ?? "safe"]}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">{m.label}</div>
                      {metricLevelIcon[m.level ?? "safe"]}
                    </div>

                    <div className="mt-1 flex items-end gap-1 text-2xl font-bold text-gray-900">
                      {m.value}
                      {m.unit && <span className="text-sm text-gray-600">{m.unit}</span>}
                    </div>

                    <div className="mt-2 text-xs text-gray-700/70">
                      {m.desc} — {m.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

      </CardContent>
    </Card>
  )
}
