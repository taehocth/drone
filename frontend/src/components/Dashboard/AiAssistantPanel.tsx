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
  const [answer, setAnswer] = useState<string | null>(null)
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

  const askGemini = async () => {
    const q = question.trim()
    if (!q || asking) return
    setAsking(true)
    setAnswer(null)
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
      setAnswer(data?.response || "응답을 가져오지 못했습니다.")
    } catch (err: any) {
      setAnswer(`⚠️ 응답 실패: ${err?.message ?? "알 수 없는 오류"}`)
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

          {/* ② 이상 감지 대응 가이드 */}
          {tab === "guide" && (
            <div>
              <div className="mb-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-sm font-bold text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  Power — 전압 변동 주의 (CUSUM)
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  14:43 · 비행 중 전압 예측 오차가 누적 기준을 초과했습니다.
                </p>
              </div>

              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-indigo-500">
                AI 대응 가이드
              </p>
              <div className="space-y-2.5">
                {[
                  {
                    t: "현 고도 유지",
                    d: " 후 배터리 잔량과 전압을 즉시 확인하세요. 급격한 기동을 피합니다.",
                  },
                  {
                    t: "전압 21.0V 미만",
                    d: "으로 떨어지면 자동 귀환(RTL)을 준비하세요.",
                  },
                  {
                    t: "30초간 추세 관찰",
                    d: " — 유사 사례(2026-05-28)에서는 일시적 부하 변동으로 자동 회복됨.",
                  },
                ].map((s, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <p className="text-sm font-medium leading-relaxed text-slate-700">
                      <b className="font-bold text-slate-900">{s.t}</b>
                      {s.d}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-1.5 border-t border-dashed border-slate-200 pt-2.5 text-sm text-slate-400">
                <BookOpen className="h-3.5 w-3.5" />
                참조 · 운용 매뉴얼 §4.2 전력계통 / 과거 유사 사례 3건 매칭
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
            {/* 답변 표시 */}
            {(answer || asking) && (
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                {asking ? (
                  <span className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI가 비행 데이터를 분석해 답변 중...
                  </span>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {answer}
                  </p>
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