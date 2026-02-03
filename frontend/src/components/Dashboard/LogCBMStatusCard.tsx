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
  Map,
} from "lucide-react"
import type { AnalysisResult } from "@/components/Dashboard/FlightReviewAnalyzerCard"
import { NaverMap } from "@/components/Map/NaverMap"

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
  warning:
    "border-yellow-300/40 bg-gradient-to-br from-yellow-100/30 to-yellow-300/20",
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
// Metric Evaluation (쿼드콥터 기준 신뢰성 임계값)
// --------------------------------------------------------
function evalMetric(
  label: string,
  rawValue: any,
  avgVoltage?: number, // 배터리 전압 기반 셀 수 추정용
): { level: Level; reason: string } {
  const value = typeof rawValue === "number" ? rawValue : parseFloat(rawValue)
  if (isNaN(value)) return { level: "safe", reason: "" }

  // -------------------- 배터리 --------------------
  // 전압 평가: 6S/12S 자동 판단 (평균 전압 기반)
  if (label === "평균 전압") {
    // 6S 배터리: 공칭 22.2V, 범위 18V(방전) ~ 25.2V(완충)
    // 12S 배터리: 공칭 44.4V, 범위 36V(방전) ~ 50.4V(완충)
    if (value >= 35) {
      // 12S 배터리
      if (value < 36) return { level: "danger", reason: "전압 위험 수준 (12S)" }
      if (value < 40) return { level: "warning", reason: "전압 낮음 (12S)" }
      if (value > 50.4)
        return { level: "warning", reason: "전압 과충전 가능성" }
      return { level: "safe", reason: "전압 정상 (12S)" }
    } else {
      // 6S 배터리 (기본값)
      if (value < 18) return { level: "danger", reason: "전압 위험 수준 (6S)" }
      if (value < 20) return { level: "warning", reason: "전압 낮음 (6S)" }
      if (value > 25.5)
        return { level: "warning", reason: "전압 과충전 가능성" }
      return { level: "safe", reason: "전압 정상 (6S)" }
    }
  }

  if (label === "최저 전압") {
    // 셀당 3.0V 이하는 위험, 3.2V 이하는 경고
    if (avgVoltage && avgVoltage >= 35) {
      // 12S 배터리
      if (value < 33) return { level: "danger", reason: "최저 전압 위험 (12S)" }
      if (value < 36)
        return { level: "warning", reason: "최저 전압 낮음 (12S)" }
      return { level: "safe", reason: "정상 범위 (12S)" }
    } else {
      // 6S 배터리
      if (value < 16.5)
        return { level: "danger", reason: "최저 전압 위험 (6S)" }
      if (value < 18) return { level: "warning", reason: "최저 전압 낮음 (6S)" }
      return { level: "safe", reason: "정상 범위 (6S)" }
    }
  }

  // 전류 평가: 6S/12S 구분 (이미 배율 적용된 값 사용)
  // 6S: 평균 8-25A, 최대 40-80A
  // 12S: 평균 4-15A, 최대 20-50A
  if (label === "평균 전류") {
    if (value > 35) return { level: "danger", reason: "평균 전류 과부하" }
    if (value > 25) return { level: "warning", reason: "평균 전류 높음" }
    if (value < 3)
      return { level: "warning", reason: "평균 전류 비정상적으로 낮음" }
    return { level: "safe", reason: "정상 범위" }
  }

  if (label === "최대 전류") {
    if (value > 85) return { level: "danger", reason: "최대 전류 과부하" }
    if (value > 60) return { level: "warning", reason: "최대 전류 높음" }
    return { level: "safe", reason: "정상 범위" }
  }

  // -------------------- ESC --------------------
  // ESC PWM 출력: 일반적으로 1100-1900 μs 범위
  // 1500 μs = 중립, 1900 μs = 최대 출력
  if (label.includes("ESC 출력")) {
    if (value >= 1900)
      return { level: "danger", reason: "ESC 출력 과부하 (최대 근접)" }
    if (value >= 1750) return { level: "warning", reason: "ESC 출력 높음" }
    if (value < 1100)
      return { level: "warning", reason: "ESC 출력 비정상적으로 낮음" }
    return { level: "safe", reason: "정상 작동 범위" }
  }

  if (label === "출력 변동성") {
    // ESC 출력 표준편차 (변동성)
    if (value >= 120)
      return { level: "danger", reason: "출력 변동 심함 (불안정)" }
    if (value >= 60) return { level: "warning", reason: "출력 변동 있음" }
    return { level: "safe", reason: "출력 안정적" }
  }

  // -------------------- FCC (Flight Control) --------------------
  // Roll/Pitch 안정성: 표준편차 (rad 단위)
  if (label === "Roll 안정성" || label === "Pitch 안정성") {
    // 0.05 rad ≈ 2.9도, 0.1 rad ≈ 5.7도
    if (value > 0.1) return { level: "danger", reason: "진동/흔들림 심함" }
    if (value > 0.05) return { level: "warning", reason: "약간의 흔들림" }
    return { level: "safe", reason: "매우 안정적" }
  }

  if (label === "최대 기울기") {
    // 최대 기울기 (도 단위)
    if (value > 60) return { level: "danger", reason: "기울기 과도 (위험)" }
    if (value > 45) return { level: "warning", reason: "기울기 증가" }
    if (value > 30) return { level: "safe", reason: "정상 범위 (활공)" }
    return { level: "safe", reason: "매우 안정적" }
  }

  // -------------------- GNSS / GPS --------------------
  if (label === "평균 위성 수") {
    // 쿼드콥터: 더 관대한 기준 적용
    // 최소 4개 이상이면 비행 가능, 6개 이상 권장
    if (value < 4) return { level: "danger", reason: "위성 부족 (위험)" }
    if (value < 6)
      return { level: "warning", reason: "위성 수 적음 (비행 가능)" }
    if (value >= 8) return { level: "safe", reason: "위성 수 양호" }
    return { level: "safe", reason: "정상 범위" }
  }

  if (label === "HDOP") {
    // Horizontal Dilution of Precision
    // 더 관대한 기준: 8.0 이상 위험, 3.0 이상 경고
    if (value >= 8.0)
      return { level: "danger", reason: "정확도 매우 낮음 (위험)" }
    if (value >= 3.0) return { level: "warning", reason: "정확도 떨어짐" }
    if (value >= 1.5) return { level: "safe", reason: "정확도 양호" }
    return { level: "safe", reason: "정확도 우수" }
  }

  if (label === "고도 표준편차") {
    // 고도 변동성 (미터 단위) - 더 관대한 기준
    if (value >= 8.0)
      return { level: "danger", reason: "고도 변동 심함 (8m 이상)" }
    if (value >= 3.0) return { level: "warning", reason: "고도 변동 있음" }
    return { level: "safe", reason: "고도 안정적" }
  }

  if (label === "신호 손실 이벤트") {
    // GPS 신호 손실 횟수 - 더 관대한 기준
    if (value >= 20) return { level: "danger", reason: "신호 손실 빈번 (위험)" }
    if (value >= 10) return { level: "warning", reason: "신호 손실 있음" }
    return { level: "safe", reason: "신호 안정" }
  }

  return { level: "safe", reason: "정상" }
}

// --------------------------------------------------------
// Component
// --------------------------------------------------------
export function LogCBMStatusCard({
  analysis,
}: {
  analysis: AnalysisResult | null
}) {
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const [openSections, setOpenSections] = useState([false, false, false, false, false])

  if (!analysis) {
    return (
      <Card className="rounded-2xl border bg-white/40 shadow-lg backdrop-blur-xl">
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
  const avgVoltage = e.battery_avg_voltage
    ? parseFloat(String(e.battery_avg_voltage))
    : undefined

  // 배터리 상태 종합 평가
  const batteryLevel = (): Level => {
    const drop = analysis.batteryDrop ?? 0
    const minVolt = e.battery_min_voltage
      ? parseFloat(String(e.battery_min_voltage))
      : 0
    const avgCurr = e.battery_avg_current
      ? parseFloat(String(e.battery_avg_current))
      : 0
    const maxCurr = e.battery_peak_current
      ? parseFloat(String(e.battery_peak_current))
      : 0

    // 위험 조건 체크
    if (drop > 40 || minVolt < 16.5 || maxCurr > 85) return "danger"
    if (avgVoltage && avgVoltage >= 35 && minVolt < 33) return "danger"
    if (avgVoltage && avgVoltage < 35 && minVolt < 16.5) return "danger"

    // 경고 조건 체크
    if (drop > 25 || minVolt < 18 || avgCurr > 30 || maxCurr > 65)
      return "warning"
    if (avgVoltage && avgVoltage >= 35 && minVolt < 36) return "warning"
    if (avgVoltage && avgVoltage < 35 && minVolt < 18) return "warning"

    return "safe"
  }

  const batteryMessage = (): string => {
    const drop = analysis.batteryDrop ?? 0
    const minVolt = e.battery_min_voltage
      ? parseFloat(String(e.battery_min_voltage))
      : 0

    if (drop > 40 || minVolt < 16.5) return "배터리 위험 상태"
    if (drop > 25 || minVolt < 18) return "배터리 주의 필요"
    return "배터리 정상"
  }

  const statuses: SystemStatus[] = [
    // ---------------- 배터리 ----------------
    {
      name: "배터리",
      icon: <Battery className="h-6 w-6 text-amber-500 drop-shadow" />,
      level: batteryLevel(),
      message: batteryMessage(),
      metrics: [
        {
          label: "평균 전압",
          value: formatNumber(e.battery_avg_voltage),
          unit: "V",
          desc: "전압 평균",
        },
        {
          label: "최저 전압",
          value: formatNumber(e.battery_min_voltage),
          unit: "V",
          desc: "최저 전압",
        },
        {
          label: "평균 전류",
          value: formatNumber(e.battery_avg_current),
          unit: "A",
          desc: "전류 평균",
        },
        {
          label: "최대 전류",
          value: formatNumber(e.battery_peak_current),
          unit: "A",
          desc: "전류 피크",
        },
      ].map((m) => ({ ...m, ...evalMetric(m.label, m.value, avgVoltage) })),
    },

    // ---------------- ESC ----------------
    {
      name: "ESC / 추진계",
      icon: <Thermometer className="h-6 w-6 text-red-500 drop-shadow" />,
      level:
        (e.esc_max_output ?? 0) >= 1900 || (e.esc_output_std ?? 0) >= 120
          ? "danger"
          : (e.esc_max_output ?? 0) >= 1750 || (e.esc_output_std ?? 0) >= 60
            ? "warning"
            : "safe",
      message:
        (e.esc_max_output ?? 0) >= 1900 || (e.esc_output_std ?? 0) >= 120
          ? "추진계 고부하/불안정 (위험)"
          : (e.esc_max_output ?? 0) >= 1750 || (e.esc_output_std ?? 0) >= 60
            ? "추진계 부하/변동 증가"
            : "정상 작동",
      metrics: [
        {
          label: "평균 ESC 출력",
          value: formatNumber(e.esc_avg_output),
          unit: "μs",
          desc: "평균 PWM",
        },
        {
          label: "최대 ESC 출력",
          value: formatNumber(e.esc_max_output),
          unit: "μs",
          desc: "최대 PWM",
        },
        {
          label: "출력 변동성",
          value: formatNumber(e.esc_output_std),
          unit: "μs",
          desc: "변동성 (표준편차)",
        },
      ].map((m) => ({ ...m, ...evalMetric(m.label, m.value) })),
    },

    // ---------------- FCC ----------------
    {
      name: "FCC / 비행 제어",
      icon: <Cpu className="h-6 w-6 text-orange-500 drop-shadow" />,
      level:
        (e.fcc_roll_std ?? 0) > 0.1 ||
        (e.fcc_pitch_std ?? 0) > 0.1 ||
        (e.max_attitude_deg ?? 0) > 60
          ? "danger"
          : (e.fcc_roll_std ?? 0) > 0.05 ||
              (e.fcc_pitch_std ?? 0) > 0.05 ||
              (e.max_attitude_deg ?? 0) > 45
            ? "warning"
            : "safe",
      message:
        (e.fcc_roll_std ?? 0) > 0.1 ||
        (e.fcc_pitch_std ?? 0) > 0.1 ||
        (e.max_attitude_deg ?? 0) > 60
          ? "기체 불안정 (위험)"
          : (e.fcc_roll_std ?? 0) > 0.05 ||
              (e.fcc_pitch_std ?? 0) > 0.05 ||
              (e.max_attitude_deg ?? 0) > 45
            ? "약간 흔들림"
            : "매우 안정적",
      metrics: [
        {
          label: "Roll 안정성",
          value: formatNumber(e.fcc_roll_std),
          unit: "rad",
          desc: "좌우 흔들림 (표준편차)",
        },
        {
          label: "Pitch 안정성",
          value: formatNumber(e.fcc_pitch_std),
          unit: "rad",
          desc: "앞뒤 흔들림 (표준편차)",
        },
        {
          label: "최대 기울기",
          value: formatNumber(e.max_attitude_deg),
          unit: "°",
          desc: "최대 기울기",
        },
      ].map((m) => ({ ...m, ...evalMetric(m.label, m.value) })),
    },

    // ---------------- GNSS ----------------
    {
      name: "GNSS / GPS",
      icon: <Satellite className="h-6 w-6 text-blue-500 drop-shadow" />,
      level: (() => {
        const sat = e.gnss_avg_sat ?? 0
        const hdop = e.gnss_hdop ?? 0
        const altStd = e.gnss_alt_std ?? 0
        const lossCount = e.gnss_signal_loss_count ?? 0

        // 위험: 핵심 지표가 매우 나쁜 경우
        if (sat < 4 || hdop >= 8.0 || lossCount >= 20) {
          return "danger"
        }

        // 경고: 위성 수와 HDOP가 모두 나쁘거나, HDOP가 매우 높은 경우만
        // 위성 수가 8개 이상이고 HDOP가 3.0 미만이면 안정적인 신호로 간주
        if (sat >= 8 && hdop < 3.0) {
          return "safe" // 위성 수가 많고 HDOP가 좋으면 무조건 양호
        }

        // 경고 조건: 여러 지표가 동시에 나쁜 경우만
        if (
          (sat < 6 && hdop >= 5.0) || // 위성 수 적고 HDOP 매우 높음
          hdop >= 5.0 || // HDOP가 매우 높음
          (sat < 8 && altStd >= 5.0 && hdop >= 3.0) || // 여러 지표 동시 경고
          lossCount >= 15 // 신호 손실이 많이 발생
        ) {
          return "warning"
        }

        return "safe"
      })(),
      message: (() => {
        const sat = e.gnss_avg_sat ?? 0
        const hdop = e.gnss_hdop ?? 0
        const altStd = e.gnss_alt_std ?? 0
        const lossCount = e.gnss_signal_loss_count ?? 0

        if (sat < 4 || hdop >= 8.0 || lossCount >= 20) {
          return "GPS 신호 매우 약함 (위험)"
        }

        if (sat >= 8 && hdop < 3.0) {
          return "GPS 신호 양호"
        }

        if (
          (sat < 6 && hdop >= 5.0) ||
          hdop >= 5.0 ||
          (sat < 8 && altStd >= 5.0 && hdop >= 3.0) ||
          lossCount >= 15
        ) {
          return "GPS 신호 약함"
        }

        return "GPS 신호 양호"
      })(),
      metrics: [
        {
          label: "평균 위성 수",
          value: formatNumber(e.gnss_avg_sat),
          unit: "개",
          desc: "위성 수",
        },
        {
          label: "HDOP",
          value: formatNumber(e.gnss_hdop),
          desc: "수평 정확도 지표",
          unit: "",
        },
        {
          label: "고도 표준편차",
          value: formatNumber(e.gnss_alt_std),
          unit: "m",
          desc: "고도 변동성",
        },
        {
          label: "신호 손실 이벤트",
          value: formatNumber(e.gnss_signal_loss_count),
          unit: "회",
          desc: "GPS 신호 손실 횟수",
        },
      ].map((m) => ({ ...m, ...evalMetric(m.label, m.value) })),
    },

    // ---------------- 지도 ----------------
    {
      name: "비행 경로 지도",
      icon: <Map className="h-6 w-6 text-emerald-500 drop-shadow" />,
      level: (e.path && e.path.length > 0) ? "safe" : "warning",
      message: (e.path && e.path.length > 0)
        ? `${e.path.length}개 GPS 포인트 기록됨`
        : "GPS 경로 데이터 없음",
      metrics: [],
    },
  ]

  return (
    <Card className="rounded-3xl border border-white/20 bg-white/30 p-6 shadow-2xl backdrop-blur-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-3 text-2xl font-bold text-gray-900 drop-shadow-sm">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
          상태 기반 정비 (CBM) 분석
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-10">
        {/* CATEGORY BUTTONS */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {statuses.map((sys, i) => (
            <button
              key={i}
              onClick={() =>
                setOpenSections((prev) => {
                  const arr = [...prev]
                  arr[i] = !arr[i]
                  return arr
                })
              }
              className={`flex items-center gap-3 rounded-2xl border p-4 ${levelColor[sys.level]} shadow-md backdrop-blur-lg transition hover:scale-[1.03] hover:shadow-xl active:scale-[0.98]`}
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

        {/* DETAILS */}
        {statuses.map((sys, i) => (
          <div
            key={i}
            ref={(el) => (sectionRefs.current[i] = el)}
            className={`transition-all duration-500 ${
              openSections[i]
                ? "max-h-[2000px] opacity-100"
                : "max-h-0 opacity-0"
            } overflow-hidden`}
          >
            <div className="mt-4 rounded-2xl border border-white/20 bg-white/30 p-6 shadow-xl backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3 border-b border-white/30 pb-3">
                <div className={`rounded-full p-2 ${levelColor[sys.level]}`}>
                  {sys.icon}
                </div>
                <div>
                  <div className="text-xl font-bold text-gray-900">
                    {sys.name}
                  </div>
                  <div className="text-sm text-gray-700/70">{sys.message}</div>
                </div>
              </div>

              {/* 지도 섹션 특별 처리 */}
              {sys.name === "비행 경로 지도" && e.path && e.path.length > 0 ? (
                <div className="h-[400px] w-full overflow-hidden rounded-lg border border-gray-300 shadow-sm">
                  <NaverMap flightPath={e.path} />
                </div>
              ) : sys.name === "비행 경로 지도" ? (
                <div className="rounded-lg border border-gray-300 bg-gray-50 p-8 text-center text-gray-500">
                  GPS 경로 데이터가 없습니다
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {sys.metrics.map((m, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border p-5 shadow transition hover:scale-[1.02] hover:shadow-xl ${metricLevelColor[m.level ?? "safe"]}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">
                          {m.label}
                        </div>
                        {metricLevelIcon[m.level ?? "safe"]}
                      </div>

                      <div className="mt-1 flex items-end gap-1 text-2xl font-bold text-gray-900">
                        {m.value}
                        {m.unit && (
                          <span className="text-sm text-gray-600">{m.unit}</span>
                        )}
                      </div>

                      <div className="mt-2 text-xs text-gray-700/70">
                        {m.desc} — {m.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
