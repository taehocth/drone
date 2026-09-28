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

// ── 타일 상태어 체계 ──────────────────────────────────
//   정상: 건전도 ≥ WARN_HEALTH   주의: 건전도 < WARN_HEALTH (임계 근접, 판정 전)   경보: 판정 로직 확정
//   주의 기준 30% — 정상 비행의 기동 구간에서 주의가 자주 뜨지 않도록 보수적으로 둔다.
export const WARN_HEALTH = 30

export type TileState = "normal" | "caution" | "alarm"

/** 피처별 경보 시 조치 문구 (사고 조사 보고서 재발 방지 권고 기반) */
export const FEATURE_ACTION: Record<string, string> = {
  current: "전원 계통 점검",
  att_cmd_roll: "제어 이상 — 수동 전환 대기", att_cmd_pitch: "제어 이상 — 수동 전환 대기", att_cmd_yaw: "제어 이상 — 수동 전환 대기",
  att_state_roll: "자세 불안정 — 착륙 검토", att_state_pitch: "자세 불안정 — 착륙 검토", att_state_yaw: "자세 불안정 — 착륙 검토",
  pwm_dev1: "즉시 착륙 후 전방 우측 암·모터 점검",
  pwm_dev2: "즉시 착륙 후 후방 좌측 암·모터 점검",
  pwm_dev3: "즉시 착륙 후 전방 좌측 암·모터 점검",
  pwm_dev4: "즉시 착륙 후 후방 우측 암·모터 점검",
  accel_vib_metric: "프롭·결합부 점검",
  gyro_vib_metric: "프롭·결합부 점검",
}

/** 타일 라벨 (사람이 읽는 이름) */
export const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  FEATURE_SECTIONS.flatMap((s) => s.tiles.map((t) => [t.feature, t.sub ? `${t.label} (${t.sub})` : t.label])),
)

/** 건전도(0~100) 계산 — 100 = 예측 정확, 0 = 오차가 경보 임계 도달 */
export function healthOf(fe?: { err: number; threshold: number }): number | null {
  if (!fe || fe.threshold <= 0) return null
  return Math.max(0, Math.round((1 - fe.err / fe.threshold) * 100))
}

/** 타일 상태: 알람 있으면 경보, 건전도가 기준 미만이면 주의, 그 외 정상 */
export function tileStateOf(alert: AiAlert | undefined, health: number | null): TileState {
  if (alert) return "alarm"
  if (health !== null && health < WARN_HEALTH) return "caution"
  return "normal"
}

/**
 * 카드 상단 한 줄 요약(조치어).
 *  - 경보가 있으면 가장 심각한 것 1건: "모터 4 (후방 우측) 경보 — 즉시 착륙 후 …"
 *  - 주의만 있으면: "모터 4 (후방 우측) 주의 — 추이 관찰"
 *  - 없으면: "모든 항목 정상"
 */
export function summarize(alerts: AiAlert[], featureErrors: FeatureErrors, missing?: Set<string>): { level: Level; text: string } {
  const byFeature = indexAlertsByFeature(alerts)
  const danger = Object.values(byFeature).find((a) => a.level === "danger")
  const warn = Object.values(byFeature).find((a) => a.level === "warning")
  const top = danger ?? warn
  if (top) {
    const name = FEATURE_LABEL[top.feature] ?? top.feature
    const action = FEATURE_ACTION[top.feature] ?? "점검 필요"
    return { level: top.level, text: `${name} 경보 — ${action}` }
  }
  let worst: { f: string; h: number } | null = null
  for (const f of ALL_FEATURES) {
    if (AI_DISABLED_FEATURES.has(f) || missing?.has(f)) continue
    const h = healthOf(featureErrors[f])
    if (h !== null && h < WARN_HEALTH && (!worst || h < worst.h)) worst = { f, h }
  }
  if (worst) return { level: "warning", text: `${FEATURE_LABEL[worst.f] ?? worst.f} 주의 — 추이 관찰` }
  return { level: "safe", text: "모든 항목 정상" }
}

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
        정상 · 주의(경보 기준 근접, 추이 관찰) · 경보(판정 확정, 조치 필요)
      </p>

      {FEATURE_SECTIONS.map((sec) => {
        let lv = sectionLevel(sec, alertByFeature)
        if (lv === "safe") {
          const anyCaution = sec.tiles.some((t) => {
            if (AI_DISABLED_FEATURES.has(t.feature) || missingFeatures?.has(t.feature)) return false
            const h = healthOf(featureErrors[t.feature])
            return h !== null && h < WARN_HEALTH
          })
          if (anyCaution) lv = "warning"
        }
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
                const health = healthOf(fe)
                const st: TileState = missing || disabled ? "normal" : tileStateOf(a, health)
                const barColor =
                  st === "alarm" ? (a?.level === "danger" ? "bg-rose-500" : "bg-amber-500")
                  : st === "caution" ? "bg-amber-400"
                  : "bg-emerald-500"
                const tileTone =
                  disabled || missing
                    ? "border-slate-200/60 bg-slate-50/60 text-slate-400"
                    : st === "alarm"
                      ? a?.level === "danger"
                        ? "border-rose-300 bg-rose-50 text-rose-800"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                      : st === "caution"
                        ? "border-amber-200 bg-amber-50/60 text-amber-800"
                        : "border-slate-200/60 bg-white/70 text-slate-700"

                return (
                  <div
                    key={t.feature}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] ${tileTone}`}
                    title={fe && health !== null ? `건전도 ${health}% — 예측 오차 ${fe.err} / 경보 임계 ${fe.threshold}` : undefined}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold">
                        {t.label}
                        {t.sub && <span className="ml-1 text-[10px] font-normal opacity-70">{t.sub}</span>}
                      </span>
                      {!disabled && !missing && (
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                            st === "alarm"
                              ? a?.method === "severe"
                                ? "bg-rose-600 text-white"
                                : a?.level === "danger"
                                  ? "bg-rose-200 text-rose-800"
                                  : "bg-amber-200 text-amber-800"
                              : st === "caution"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {st === "alarm" ? `경보 · ${methodLabel(a?.method ?? "")}` : st === "caution" ? "주의" : "정상"}
                        </span>
                      )}
                    </div>
                    {disabled ? (
                      <div className="mt-1 text-[10px]">AI 제외 · 규칙 감시</div>
                    ) : missing ? (
                      <div className="mt-1 text-[10px]">수신 없음</div>
                    ) : (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${health ?? 0}%` }}
                        />
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