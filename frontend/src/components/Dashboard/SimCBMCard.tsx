import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  AlertTriangle,
  CheckCircle,
  Battery,
  Activity,
  Brain,
  Wifi,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

/* =============================================================
 * SimCBMCard — 시뮬레이션 전용 CNN-LSTM 이상탐지 카드
 * -------------------------------------------------------------
 * RealtimeCBMStatusCard 와 동일한 모양. WebSocket 대신
 * '수집 중(0→20) → 추론 활성 → Power/Roll/Pitch/Yaw 전부 정상'을
 * 자체 생성하여 표시한다. 실제 운영 카드는 건드리지 않는다.
 * ============================================================= */

interface SimCBMCardProps {
  droneId?: string
}

const AI_GROUPS = ["Power", "Roll", "Pitch", "Yaw"] as const

const GROUP_ICON: Record<string, JSX.Element> = {
  Power: <Battery className="h-4 w-4 text-amber-500" />,
  Roll: <Activity className="h-4 w-4 text-blue-500" />,
  Pitch: <Activity className="h-4 w-4 text-indigo-500" />,
  Yaw: <Activity className="h-4 w-4 text-violet-500" />,
}

export function SimCBMCard({ droneId = "drone-002" }: SimCBMCardProps) {
  const [windowSize, setWindowSize] = useState(0)
  const [aiExpanded, setAiExpanded] = useState(true)

  // 윈도우 채우기: 0 → 20 (약 2초), 이후 추론 활성 유지
  useEffect(() => {
    const id = setInterval(() => {
      setWindowSize((w) => (w >= 20 ? 20 : w + 1))
    }, 100)
    return () => clearInterval(id)
  }, [])

  const aiActive = windowSize >= 20
  const levelLabel = !aiActive ? "수집 중" : "정상"
  const levelTone = !aiActive
    ? "bg-slate-50/60 border-slate-200/60 text-slate-500"
    : "bg-emerald-50/60 border-emerald-200/70 text-emerald-700"

  return (
    <Card className="rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] ring-1 ring-white/70 backdrop-blur-xl">
      <CardHeader className="border-b border-slate-200/60">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          상태 기반 정비 (CBM)
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* 규칙 기반 (시뮬: 전부 정상) */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            규칙 기반 지표
          </p>
          {[
            { s: "Battery", m: "정상 (67%)" },
            { s: "ESC", m: "정상 (8.0 m/s)" },
            { s: "FCC", m: "정상 (50 m)" },
            { s: "GNSS", m: "정상 (위성 31)" },
          ].map((r) => (
            <div
              key={r.s}
              className="flex items-center justify-between rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 text-emerald-700"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">{r.s}</span>
              </div>
              <span className="text-xs">{r.m}</span>
            </div>
          ))}
        </div>

        {/* AI 이상 탐지 */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setAiExpanded((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-indigo-500" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                AI 이상 탐지 (CNN-LSTM)
              </p>
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            {aiExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {aiExpanded && (
            <div className="space-y-2">
              {/* 모델 상태 줄 */}
              <div
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${levelTone}`}
              >
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  <span className="font-medium">{droneId} 모델</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200/60">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${aiActive ? "bg-emerald-500" : "bg-amber-400"}`}
                        style={{ width: `${(windowSize / 20) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums">
                      {windowSize}/20
                    </span>
                  </div>
                  <span className="font-semibold">{levelLabel}</span>
                </div>
              </div>

              {/* 수집 중 */}
              {!aiActive && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
                  <Activity className="h-4 w-4 shrink-0 animate-pulse" />
                  데이터 수집 중입니다 (20개 채워지면 탐지 시작)
                </div>
              )}

              {/* 추론 활성: 4그룹 전부 정상 */}
              {aiActive &&
                AI_GROUPS.map((g) => (
                  <div
                    key={g}
                    className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {GROUP_ICON[g]}
                        <span className="font-semibold text-emerald-700">
                          {g}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <CheckCircle className="h-3 w-3" />
                        정상
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}