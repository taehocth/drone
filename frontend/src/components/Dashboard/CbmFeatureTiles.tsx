import type { JSX } from "react"
import { Battery, Activity, Fan, Waves, CheckCircle } from "lucide-react"

/* =============================================================
 * CbmFeatureTiles — CNN-LSTM 14피처 계통별 타일 (공용)
 * -------------------------------------------------------------
 * RealtimeCBMStatusCard(실시간 WS 데이터)와 SimCBMCard(시뮬 합성 데이터)가
 * 같은 레이아웃을 쓰도록 표시 로직을 여기로 모았다.
 * 피처 구성이 바뀌면 FEATURE_SECTIONS 한 곳만 수정한다.
 * ============================================================= */

export interface AiAlert {
  system: string
  level: "warning" | "danger"
  source?: string
  method: string // "fail_count" | "cusum" | "severe"
  feature: string
  msg: string
  position?: string
  err?: number
  threshold?: number
  cusum?: number
  severity_ratio?: number
}

export type FeatureErrors = Record<string, { err: number; threshold: number }>

export interface FeatureTile {
  feature: string
  label: string
  sub?: string
}

export interface FeatureSection {
  name: string
  label: string
  cols: 1 | 2 | 3
  tiles: FeatureTile[]
}

// 14피처 = 전원 2 + 자세 6 + 모터 편차 4 + 진동 2 (collector.AI_FEATURE_COLS 순서와 대응)
export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    name: "Power",
    label: "전원",
    cols: 2,
    tiles: [
      { feature: "current", label: "전류" },
      { feature: "volt", label: "전압", sub: "규칙 감시" },
    ],
  },
  {
    name: "Attitude",
    label: "자세 (명령 · 상태)",
    cols: 3,
    tiles: [
      { feature: "att_cmd_roll", label: "Roll", sub: "명령" },
      { feature: "att_cmd_pitch", label: "Pitch", sub: "명령" },
      { feature: "att_cmd_yaw", label: "Yaw", sub: "명령" },
      { feature: "att_state_roll", label: "Roll", sub: "상태" },
      { feature: "att_state_pitch", label: "Pitch", sub: "상태" },
      { feature: "att_state_yaw", label: "Yaw", sub: "상태" },
    ],
  },
  {
    name: "Motor",
    label: "모터 출력 편차",
    cols: 2,
    tiles: [
      { feature: "pwm_dev1", label: "모터 1", sub: "전방 우측" },
      { feature: "pwm_dev2", label: "모터 2", sub: "후방 좌측" },
      { feature: "pwm_dev3", label: "모터 3", sub: "전방 좌측" },
      { feature: "pwm_dev4", label: "모터 4", sub: "후방 우측" },
    ],
  },
  {
    name: "Vibration",
    label: "진동",
    cols: 2,
    tiles: [
      { feature: "accel_vib_metric", label: "가속도 진동" },
      { feature: "gyro_vib_metric", label: "자이로 진동" },
    ],
  },
]

export const ALL_FEATURES: string[] = FEATURE_SECTIONS.flatMap((s) => s.tiles.map((t) => t.feature))

// AI 탐지에서 제외된 피처 (규칙 기반이 담당)
export const AI_DISABLED_FEATURES = new Set<string>(["volt"])

export function methodLabel(method: string): string {
  switch (method) {
    case "severe":
      return "즉시 확정"
    case "cusum":
      return "누적 이탈"
    case "fail_count":
      return "연속 초과"
    default:
      return method
  }
}

const SECTION_ICON: Record<string, JSX.Element> = {
  Power: <Battery className="h-4 w-4 text-amber-500" />,
  Attitude: <Activity className="h-4 w-4 text-blue-500" />,
  Motor: <Fan className="h-4 w-4 text-red-500" />,
  Vibration: <Waves className="h-4 w-4 text-orange-500" />,
}

export type Level = "safe" | "warning" | "danger"

/** 알람 목록 → 피처별 대표 알람 (danger 우선) */
export function indexAlertsByFeature(alerts: AiAlert[]): Record<string, AiAlert> {
  return alerts.reduce<Record<string, AiAlert>>((acc, a) => {
    if (typeof a.feature !== "string") return acc
    const prev = acc[a.feature]
    if (!prev || (prev.level !== "danger" && a.level === "danger")) acc[a.feature] = a
    return acc
  }, {})
}

/** 계통 상태 = 소속 타일 중 최악 */
export function sectionLevel(sec: FeatureSection, alertByFeature: Record<string, AiAlert>): Level {
  let lv: Level = "safe"
  for (const t of sec.tiles) {
    const a = alertByFeature[t.feature]
    if (a?.level === "danger") return "danger"
    if (a?.level === "warning") lv = "warning"
  }
  return lv
}

/** 전체 상태 = 모든 알람 중 최악 */
export function overallLevel(alerts: AiAlert[]): Level {
  if (alerts.some((a) => a.level === "danger")) return "danger"
  if (alerts.some((a) => a.level === "warning")) return "warning"
  return "safe"
}

interface CbmFeatureTilesProps {
  alerts: AiAlert[]
  featureErrors: FeatureErrors
  /** 텔레메트리 미수신 등으로 값이 없는 피처 → 회색 "수신 없음" */
  missingFeatures?: Set<string>
}

export function CbmFeatureTiles({ alerts, featureErrors, missingFeatures }: CbmFeatureTilesProps) {
  const alertByFeature = indexAlertsByFeature(alerts)

  return (
    <>
      <p className="px-1 text-[10px] text-slate-400">
        건전도 = 경보 임계까지의 여유 (100% 정상 · 0% 도달이 지속되면 경보)
      </p>

      {FEATURE_SECTIONS.map((sec) => {
        const lv = sectionLevel(sec, alertByFeature)
        const tone =
          lv === "danger"
            ? "border-rose-200/70 bg-rose-50/40"
            : lv === "warning"
              ? "border-amber-200/70 bg-amber-50/40"
              : "border-emerald-200/70 bg-emerald-50/30"
        const labelColor =
          lv === "danger" ? "text-rose-700" : lv === "warning" ? "text-amber-700" : "text-emerald-700"
        const gridCols = sec.cols === 3 ? "grid-cols-3" : sec.cols === 2 ? "grid-cols-2" : "grid-cols-1"

        return (
          <div key={sec.name} className={`rounded-xl border px-3 py-2 ${tone}`}>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {SECTION_ICON[sec.name]}
                <span className={`text-xs font-semibold ${labelColor}`}>{sec.label}</span>
              </div>
              {lv === "safe" && (
                <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle className="h-3 w-3" />
                  정상
                </span>
              )}
            </div>

            <div className={`grid ${gridCols} gap-1.5`}>
              {sec.tiles.map((t) => {
                const a = alertByFeature[t.feature]
                const fe = featureErrors[t.feature]
                const disabled = AI_DISABLED_FEATURES.has(t.feature)
                const missing = !disabled && (missingFeatures?.has(t.feature) ?? false)
                // 건전도(Health) = 100 − 오차/임계 비율. 100% = 예측이 정확히 맞음, 0% = 오차가 경보 임계 도달
                const ratio = fe && fe.threshold > 0 ? fe.err / fe.threshold : 0
                const health = Math.max(0, Math.round((1 - ratio) * 100))
                const barColor = a
                  ? a.level === "danger"
                    ? "bg-rose-500"
                    : "bg-amber-500"
                  : health < 20
                    ? "bg-rose-400"
                    : health < 50
                      ? "bg-amber-400"
                      : "bg-emerald-500"
                const tileTone =
                  disabled || missing
                    ? "border-slate-200/60 bg-slate-50/60 text-slate-400"
                    : a
                      ? a.level === "danger"
                        ? "border-rose-300 bg-rose-50 text-rose-800"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-slate-200/60 bg-white/70 text-slate-700"

                return (
                  <div
                    key={t.feature}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] ${tileTone}`}
                    title={fe ? `건전도 ${health}% — 예측 오차 ${fe.err} / 경보 임계 ${fe.threshold}` : undefined}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold">
                        {t.label}
                        {t.sub && <span className="ml-1 text-[10px] font-normal opacity-70">{t.sub}</span>}
                      </span>
                      {a && !missing && (
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                            a.method === "severe"
                              ? "bg-rose-600 text-white"
                              : a.level === "danger"
                                ? "bg-rose-200 text-rose-800"
                                : "bg-amber-200 text-amber-800"
                          }`}
                        >
                          {methodLabel(a.method)}
                        </span>
                      )}
                    </div>
                    {disabled ? (
                      <div className="mt-1 text-[10px]">AI 제외 · 규칙 감시</div>
                    ) : missing ? (
                      <div className="mt-1 text-[10px]">수신 없음</div>
                    ) : (
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${fe ? health : 0}%` }}
                          />
                        </div>
                        <span className="w-9 text-right text-[10px] tabular-nums opacity-80">
                          {fe ? `${health}%` : "–"}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}