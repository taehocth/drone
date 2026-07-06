import { useState } from "react"
import type { DroneData } from "./DroneSimulation"
import {
  Sparkles,
  FileText,
  LifeBuoy,
  Compass,
  MessageCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Send,
  BookOpen,
  Clock,
  Loader2,
} from "lucide-react"

interface AiAssistantPanelProps {
  droneConnected: boolean
  droneData: DroneData | null
  droneLabel: string | null
}

type TabKey = "report" | "guide" | "preflight"

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: "preflight", label: "임무 적합성", icon: <Compass className="h-4 w-4" /> },
  { key: "guide", label: "이상 대응 가이드", icon: <LifeBuoy className="h-4 w-4" /> },
  { key: "report", label: "비행 후 리포트", icon: <FileText className="h-4 w-4" /> },
]

export function AiAssistantPanel({
  droneConnected,
  droneData,
  droneLabel,
}: AiAssistantPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<TabKey>("preflight")

  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "ai"; text: string }>
  >([])
  const [asking, setAsking] = useState(false)

  const label = droneLabel ?? "DM4_2"
  const battery = droneData?.battery ?? 67
  const altitude = droneData?.altitude ?? 52
  const speed = droneData?.speed ?? 9.8
  const satellites = droneData?.gpsSatellites ?? 31

  // ── 임무 적합성 실시간 판정 (배터리·GPS 반영) ──────────────
  const batteryStatus: "ok" | "warn" | "danger" =
    battery <= 25 ? "danger" : battery <= 40 ? "warn" : "ok"
  const gpsStatus: "ok" | "warn" | "danger" =
    satellites < 10 ? "danger" : satellites < 20 ? "warn" : "ok"
  // 전체 판정 = 가장 나쁜 항목 기준
  const preflightVerdict: "go" | "caution" | "no-go" =
    batteryStatus === "danger" || gpsStatus === "danger"
      ? "no-go"
      : batteryStatus === "warn" || gpsStatus === "warn"
        ? "caution"
        : "go"
  const verdictConfig = {
    go: {
      title: "임무 수행 적합",
      sub: "주요 점검 항목 통과",
      border: "border-emerald-200/60",
      bg: "bg-emerald-50/70",
      iconBg: "from-emerald-500 to-teal-500",
      text: "text-emerald-700",
      icon: <CheckCircle2 className="h-6 w-6" />,
    },
    caution: {
      title: "조건부 수행 — 주의",
      sub: "일부 항목 점검 후 수행하세요",
      border: "border-amber-200/60",
      bg: "bg-amber-50/70",
      iconBg: "from-amber-500 to-yellow-400",
      text: "text-amber-700",
      icon: <AlertTriangle className="h-6 w-6" />,
    },
    "no-go": {
      title: "임무 수행 부적합",
      sub: "위험 항목을 해결하기 전 비행 불가",
      border: "border-red-200/60",
      bg: "bg-red-50/70",
      iconBg: "from-red-500 to-rose-500",
      text: "text-red-700",
      icon: <AlertTriangle className="h-6 w-6" />,
    },
  }[preflightVerdict]
  const preflightAdvice =
    preflightVerdict === "no-go"
      ? batteryStatus === "danger"
        ? "배터리가 위험 수준(≤25%)입니다. 즉시 충전 또는 교체 전에는 이륙하지 마세요."
        : "GPS 위성 수가 부족합니다. 신호가 회복될 때까지 비행을 보류하세요."
      : preflightVerdict === "caution"
        ? "이륙은 가능하나 여유가 적습니다. 임무 반경을 줄이거나 여유 배터리를 확보하세요."
        : "적합 판정이나, 후반 구간 바람으로 배터리 소모가 늘 수 있습니다. 여유 배터리를 확보하세요."

  // ── 이상 대응 가이드 (배터리·GPS 상태에 따라 통째로 전환) ──────
  type GuideStep = { t: string; d: string; time?: string; caution?: string }
  interface ResponseGuide {
    severity: "danger" | "warn" | "ok"
    alertTitle: string
    alertDesc: string
    steps: GuideStep[]
    ref: string
  }
  const responseGuide: ResponseGuide = (() => {
    // 우선순위: 배터리 위험 > GPS 위험 > 배터리 주의 > GPS 주의 > 정상
    if (batteryStatus === "danger") {
      return {
        severity: "danger",
        alertTitle: `배터리 위험 — 현재 ${battery.toFixed(0)}% (임계 25% 이하)`,
        alertDesc:
          "해상 복귀 거리를 고려하면 남은 전력으로 안전 착륙이 어려울 수 있습니다. 즉시 대응이 필요합니다.",
        steps: [
          {
            t: "즉시 RTL(자동 귀환) 전환",
            d: " — 진행 중인 배송 임무를 중단하고 비행 모드를 RTL로 바꾸세요. 가장 가까운 복귀 지점으로 자동 이동합니다.",
            time: "즉시 (0초)",
            caution: "수동 조종 중이었다면 급기동·급상승을 피하세요. 전력 소모가 급증합니다.",
          },
          {
            t: "복귀 경로상 착륙 지점 확보",
            d: " — RTL 거리가 남은 전력보다 멀다고 판단되면, 가장 가까운 해상 플랫폼·선박·육지로 비상 착륙을 준비하세요.",
            time: "10~20초 내 판단",
            caution: "인구 밀집·항로 위를 피하고, 낙하 시 인명 피해가 없는 지점을 고르세요.",
          },
          {
            t: "착륙 후 전원·배터리 분리",
            d: " — 착륙 완료 즉시 모터를 정지(Disarm)하고 배터리를 분리하세요. 과방전은 화재·셀 손상 위험이 있습니다.",
            time: "착륙 직후",
            caution: "배터리가 부풀거나 뜨거우면 만지지 말고 안전 거리에서 냉각시키세요.",
          },
        ],
        ref: "참조 · 운용 매뉴얼 §5.1 저전력 비상 절차 / 과거 저배터리 회수 사례 7건",
      }
    }
    if (gpsStatus === "danger") {
      return {
        severity: "danger",
        alertTitle: `GPS 신호 위험 — 현재 위성 ${satellites}개 (최소 10개 미만)`,
        alertDesc:
          "위치 추정 정확도가 급격히 떨어져 자동 항법이 불안정합니다. 해상에서는 표류·충돌 위험이 큽니다.",
        steps: [
          {
            t: "즉시 호버링(고도 유지)",
            d: " — 전진 비행을 멈추고 현재 위치에서 고도를 유지하세요. GPS 없이 이동하면 위치 오차가 누적됩니다.",
            time: "즉시 (0초)",
            caution: "바람이 강하면 호버링 중에도 표류합니다. 자세(Attitude) 모드로 수동 유지 준비.",
          },
          {
            t: "30초간 신호 회복 대기",
            d: " — 위성 수가 다시 15개 이상으로 회복되는지 관찰하세요. 일시적 음영일 수 있습니다.",
            time: "약 30초",
            caution: "회복 안 되면 다음 단계로. 무한정 대기하면 배터리만 소모됩니다.",
          },
          {
            t: "수동 모드 전환 후 육안 복귀",
            d: " — 회복이 안 되면 자세 모드로 전환하고, 육안 또는 마지막 알려진 위치 기준으로 수동 복귀하세요.",
            time: "회복 실패 시",
            caution: "GCS 화면의 마지막 유효 좌표와 기수 방향(Heading)을 기준으로 조종하세요.",
          },
        ],
        ref: "참조 · 운용 매뉴얼 §4.4 항법 상실 절차 / 해상 GPS 음영 사례 5건",
      }
    }
    if (batteryStatus === "warn") {
      return {
        severity: "warn",
        alertTitle: `배터리 주의 — 현재 ${battery.toFixed(0)}% (귀환 준비 권장)`,
        alertDesc:
          "아직 위험 수준은 아니지만, 해상 복귀 거리를 고려해 지금부터 귀환을 준비하는 것이 안전합니다.",
        steps: [
          {
            t: "현재 임무 단계 마무리",
            d: " — 진행 중인 배송을 마치되, 새 임무는 시작하지 마세요.",
            time: "1~2분 내",
          },
          {
            t: "귀환 경로·시간 계산",
            d: " — 복귀 거리와 남은 전력을 비교해, 위험 임계(25%) 도달 전 복귀가 가능한지 확인하세요.",
            time: "지금 판단",
            caution: "맞바람 구간이 있으면 소모가 빨라집니다. 여유를 크게 두세요.",
          },
          {
            t: "25% 도달 전 수동 복귀 시작",
            d: " — 자동 RTL 임계값에 도달하기 전에 먼저 복귀를 시작하는 것이 안전 마진을 확보합니다.",
            time: "임계 도달 전",
          },
        ],
        ref: "참조 · 운용 매뉴얼 §5.1 저전력 비상 절차",
      }
    }
    // 정상
    return {
      severity: "ok",
      alertTitle: "현재 특이 이상 없음 — 정상 운항",
      alertDesc:
        "배터리·GPS 등 주요 지표가 안전 범위입니다. 예방적 모니터링을 유지하세요.",
      steps: [
        {
          t: "30초 주기 지표 확인",
          d: " — 배터리·GPS·통신 상태를 주기적으로 점검하세요.",
        },
        {
          t: "기상 변화 주시",
          d: " — 해상 돌풍·풍속 변화가 배터리 소모에 영향을 줍니다.",
        },
        {
          t: "귀환 여유 전력 유지",
          d: " — 복귀에 필요한 전력을 항상 확보한 상태로 운항하세요.",
        },
      ],
      ref: "참조 · 운용 매뉴얼 §3 정상 운항 모니터링",
    }
  })()

  const guideAlertTone =
    responseGuide.severity === "danger"
      ? "border-red-200/70 bg-red-50/70 text-red-700"
      : responseGuide.severity === "warn"
        ? "border-amber-200/70 bg-amber-50/70 text-amber-700"
        : "border-emerald-200/70 bg-emerald-50/70 text-emerald-700"
  const guideStepBadge =
    responseGuide.severity === "danger"
      ? "bg-red-500"
      : responseGuide.severity === "warn"
        ? "bg-amber-500"
        : "bg-emerald-500"

  const askGemini = async () => {
    const q = question.trim()
    if (!q || asking) return
    setAsking(true)
    // 사용자 질문을 즉시 대화에 추가하고 입력창 비우기
    setMessages((prev) => [...prev, { role: "user", text: q }])
    setQuestion("")
    try {
      const ctx = droneConnected
        ? `현재 기체 ${label} 비행 중 — 고도 ${altitude.toFixed(0)}m, 속도 ${speed.toFixed(1)}m/s, 배터리 ${battery.toFixed(0)}%.`
        : `현재 기체 ${label}는 연결되어 있지 않습니다.`
      const prompt =
        `당신은 해상 드론 배송 관제 시스템의 AI 운용 어시스턴트입니다. ` +
        `다음 비행 상태를 참고하여 운용자의 질문에 한국어로 간결하고 실무적으로 답하세요.\n` +
        `[비행 상태] ${ctx}\n[질문] ${q}`

      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"
      const apiUrl = apiBaseUrl.endsWith("/api/v1")
        ? `${apiBaseUrl}/gemini/chat`
        : `${apiBaseUrl}/api/v1/gemini/chat`

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history: [] }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: data?.response || "응답을 가져오지 못했습니다." },
      ])
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `⚠️ 응답 실패: ${err?.message ?? "알 수 없는 오류"}` },
      ])
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-indigo-200/60 bg-white shadow-sm">
      {/* 헤더 — AI 정체성(인디고/바이올렛) */}
      <div
        className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/60 px-5 py-4 transition-colors hover:from-indigo-50 hover:to-violet-50"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 p-2 shadow-sm">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">
              AI 운용 어시스턴트
            </p>
            <p className="text-sm text-slate-500">
              Cloud LLM 연동 — 리포트·대응 가이드·임무 조언 자동 생성
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/70 bg-white px-2.5 py-0.5 text-sm font-semibold text-indigo-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
            </span>
            LLM 연동
          </span>
          <span className="text-slate-400">
            {collapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </span>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4">
          {/* 탭 */}
          <div className="mb-4 flex gap-1.5 rounded-xl bg-slate-100/70 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  tab === t.key
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* ① 비행 후 자동 리포트 */}
          {tab === "report" && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  비행 종료 후 자동 생성됨
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  <Clock className="h-3.5 w-3.5" />
                  14:52 생성
                </span>
              </div>

              <p className="mb-3 text-base font-medium leading-relaxed text-slate-700">
                <b className="font-bold text-slate-900">{label}</b> 비행이
                정상 종료되었습니다 (30분 12초). 주요 지표는 정상 범위였으며,
                <b className="font-semibold text-amber-700"> 배터리 소모율에서 경미한 주의 항목 1건</b>이 확인되었습니다.
              </p>

              {/* 요약 지표 */}
              <div className="mb-4 grid grid-cols-4 gap-2">
                {[
                  { l: "비행 시간", v: "30:12", u: "" },
                  { l: "최대 고도", v: altitude.toFixed(0), u: "m" },
                  { l: "평균 속도", v: speed.toFixed(1), u: "m/s" },
                  { l: "배터리 소모", v: "48", u: "%" },
                ].map((k) => (
                  <div
                    key={k.l}
                    className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-2.5"
                  >
                    <p className="text-xs text-slate-400">{k.l}</p>
                    <p className="mt-0.5 text-xl font-bold text-slate-800">
                      {k.v}
                      {k.u && (
                        <span className="ml-0.5 text-xs font-medium text-slate-400">
                          {k.u}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>

              {/* ── 구간별 상세 분석 (시간대별 타임라인) ── */}
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-indigo-500">
                구간별 상세 분석
              </p>
              <div className="mb-4 space-y-2">
                {[
                  {
                    phase: "이륙 · 상승",
                    time: "00:00 – 03:20",
                    ok: true,
                    detail:
                      "이륙 후 목표 고도 50m까지 안정적으로 상승. 상승률 2.4m/s, 자세 흔들림 없음.",
                  },
                  {
                    phase: "순항 (배송지 이동)",
                    time: "03:20 – 14:10",
                    ok: true,
                    detail:
                      "평균 속도 9.8m/s로 순항. GPS 위성 27~29개 안정 유지, 항로 이탈 없음.",
                  },
                  {
                    phase: "배송 · 호버링",
                    time: "14:10 – 18:40",
                    ok: true,
                    detail:
                      "배송지 상공 호버링 4분 30초. 페이로드 투하 정상, 위치 유지 오차 ±0.8m 이내.",
                  },
                  {
                    phase: "귀환",
                    time: "18:40 – 30:12",
                    ok: false,
                    detail:
                      "귀환 후반 10분간 배터리 소모율 평소 대비 약 8% 상승. 북서풍 맞바람 영향으로 추정.",
                  },
                ].map((seg, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border px-3 py-2.5 ${
                      seg.ok
                        ? "border-slate-200/70 bg-slate-50/50"
                        : "border-amber-200/70 bg-amber-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {seg.ok ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      )}
                      <span className="text-sm font-bold text-slate-800">
                        {seg.phase}
                      </span>
                      <span className="ml-auto text-xs font-medium tabular-nums text-slate-400">
                        {seg.time}
                      </span>
                    </div>
                    <p className="mt-1 pl-6 text-sm font-medium leading-relaxed text-slate-600">
                      {seg.detail}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mb-1.5 text-sm font-semibold uppercase tracking-wider text-indigo-500">
                AI 분석 요약
              </p>
              <div className="space-y-1.5">
                {[
                  {
                    ok: true,
                    t: "자세 제어(Roll·Pitch·Yaw) 전 구간 안정 — 명령 대비 실제 편차 평균 0.03 rad 이내.",
                  },
                  {
                    ok: true,
                    t: "GPS 수신 양호 — 위성 평균 28개, 신호 단절 구간 없음.",
                  },
                  {
                    ok: true,
                    t: "모터 4개 출력 균형 정상 — 개별 PWM 편차 3% 이내, 특정 모터 과부하 징후 없음.",
                  },
                  {
                    ok: false,
                    t: "후반 10분 배터리 소모율이 평소 대비 약 8% 높음 — 바람 영향 가능성. 다음 비행 시 여유 배터리 권장.",
                  },
                ].map((row, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {row.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span className="text-sm font-medium leading-relaxed text-slate-700">
                      {row.t}
                    </span>
                  </div>
                ))}
              </div>

              {/* ── 다음 비행 전 점검 필요 항목 (안전 체크리스트) ── */}
              <p className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wider text-amber-600">
                다음 비행 전 점검 필요
              </p>
              <div className="space-y-1.5">
                {[
                  {
                    level: "권장",
                    t: "배터리 셀 밸런스 및 내부 저항 점검 — 후반 소모율 상승 원인 확인",
                  },
                  {
                    level: "권장",
                    t: "프로펠러 육안 점검 — 크랙·이물질·체결 상태 확인",
                  },
                  {
                    level: "참고",
                    t: "해상 풍향·풍속 예보 확인 후 귀환 여유 배터리 10% 추가 확보",
                  },
                ].map((c, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-xl bg-slate-50/60 px-3 py-2"
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        c.level === "권장"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {c.level}
                    </span>
                    <span className="text-sm font-medium leading-relaxed text-slate-700">
                      {c.t}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
                <p className="text-sm font-semibold text-indigo-700">
                  정비 권고
                </p>
                <p className="mt-0.5 text-sm font-medium leading-relaxed text-slate-700">
                  즉시 조치 필요 항목 없음. 누적 비행 시간 기준 다음 정기
                  점검까지 <b className="font-bold text-indigo-700">4.2시간</b>{" "}
                  남았습니다. <b className="font-semibold text-slate-900">프로펠러 육안 점검을 권장</b>합니다.
                </p>
              </div>

              <div className="mt-2 flex items-center gap-1.5 border-t border-dashed border-slate-200 pt-2.5 text-sm text-slate-400">
                <BookOpen className="h-3.5 w-3.5" />
                근거 · 비행 로그 1,812건 · 과거 동일 기종 비행 24건 대비 분석
              </div>
            </div>
          )}

          {/* ② 이상 감지 대응 가이드 (배터리·GPS 상태 실시간 반영) */}
          {tab === "guide" && (
            <div>
              <div className={`mb-3 rounded-xl border px-3 py-2.5 ${guideAlertTone}`}>
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  {responseGuide.severity === "ok" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {responseGuide.alertTitle}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {responseGuide.alertDesc}
                </p>
              </div>

              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-indigo-500">
                AI 대응 가이드
              </p>
              <div className="space-y-2.5">
                {responseGuide.steps.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-200/70 bg-slate-50/50 px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${guideStepBadge}`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-relaxed text-slate-700">
                          <b className="font-bold text-slate-900">{s.t}</b>
                          {s.d}
                        </p>
                        {(s.time || s.caution) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {s.time && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                                <Clock className="h-3 w-3" />
                                {s.time}
                              </span>
                            )}
                            {s.caution && (
                              <span className="inline-flex items-start gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                {s.caution}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-1.5 border-t border-dashed border-slate-200 pt-2.5 text-sm text-slate-400">
                <BookOpen className="h-3.5 w-3.5" />
                {responseGuide.ref}
              </div>
            </div>
          )}

          {/* ③ 임무 전 적합성 조언 */}
          {tab === "preflight" && (
            <div>
              {/* 판정 배너 (배터리·GPS 상태 실시간 반영) */}
              <div
                className={`mb-3 flex items-center gap-3 rounded-2xl border ${verdictConfig.border} ${verdictConfig.bg} px-4 py-3`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${verdictConfig.iconBg} text-white shadow-sm`}
                >
                  {verdictConfig.icon}
                </div>
                <div>
                  <p className={`text-lg font-bold ${verdictConfig.text}`}>
                    {verdictConfig.title}
                  </p>
                  <p className="text-sm font-semibold text-slate-600">
                    {verdictConfig.sub}
                  </p>
                </div>
              </div>

              {/* 체크 항목 (실시간) */}
              <div className="space-y-2">
                {[
                  {
                    status: batteryStatus,
                    l: "배터리",
                    v:
                      batteryStatus === "danger"
                        ? `${battery.toFixed(0)}% — 위험, 즉시 충전`
                        : batteryStatus === "warn"
                          ? `${battery.toFixed(0)}% — 여유 부족`
                          : `충전 ${battery > 90 ? "100" : battery.toFixed(0)}% · 셀 균형 정상`,
                  },
                  {
                    status: "ok" as const,
                    l: "기체 상태",
                    v: "직전 비행 이상 없음",
                  },
                  {
                    status: gpsStatus,
                    l: "GPS / 통신",
                    v:
                      gpsStatus === "danger"
                        ? `위성 ${satellites} — 신호 부족`
                        : gpsStatus === "warn"
                          ? `위성 ${satellites} — 주의`
                          : `위성 ${satellites} · LTE 양호`,
                  },
                  {
                    status: "warn" as const,
                    l: "기상",
                    v: "북서풍 6 m/s — 주의",
                  },
                ].map((c) => (
                  <div
                    key={c.l}
                    className="flex items-center gap-2.5 rounded-xl bg-slate-50/70 px-3 py-2"
                  >
                    {c.status === "ok" ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    ) : c.status === "warn" ? (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                    )}
                    <span className="text-sm font-semibold text-slate-800">
                      {c.l}
                    </span>
                    <span
                      className={`ml-auto text-sm font-semibold ${
                        c.status === "danger"
                          ? "text-red-600"
                          : c.status === "warn"
                            ? "text-amber-600"
                            : "text-slate-600"
                      }`}
                    >
                      {c.v}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className={`mt-3 rounded-xl border px-3 py-2.5 ${
                  preflightVerdict === "no-go"
                    ? "border-red-200/70 bg-red-50/60"
                    : preflightVerdict === "caution"
                      ? "border-amber-200/70 bg-amber-50/60"
                      : "border-indigo-100 bg-indigo-50/50"
                }`}
              >
                <p className="text-sm font-medium leading-relaxed text-slate-700">
                  <b
                    className={`font-bold ${
                      preflightVerdict === "no-go"
                        ? "text-red-700"
                        : preflightVerdict === "caution"
                          ? "text-amber-700"
                          : "text-indigo-700"
                    }`}
                  >
                    💬 AI 조언:
                  </b>{" "}
                  {preflightAdvice}
                </p>
              </div>
            </div>
          )}

          {/* 운용자 질문 — Gemini 실연동 (현재 비행 데이터를 맥락으로 전달) */}
          <div className="mt-4">
            {/* 대화 기록 — 내 질문(오른쪽)·AI 답변(왼쪽) */}
            {(messages.length > 0 || asking) && (
              <div className="mb-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-500 px-3 py-2 text-sm font-medium leading-relaxed text-white">
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex items-start gap-2">
                      <Sparkles className="mt-1.5 h-4 w-4 shrink-0 text-indigo-500" />
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm leading-relaxed text-slate-700">
                        {m.text}
                      </div>
                    </div>
                  ),
                )}
                {asking && (
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-1.5 h-4 w-4 shrink-0 text-indigo-500" />
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      AI가 비행 데이터를 분석해 답변 중...
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 입력창 */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
              <MessageCircle className="h-4 w-4 shrink-0 text-indigo-400" />
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") askGemini()
                }}
                placeholder='질문하기 — 예: "이번 비행에서 가장 주의할 점은?"'
                disabled={asking}
                className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={askGemini}
                disabled={asking || !question.trim()}
                className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
              >
                {asking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                전송
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}