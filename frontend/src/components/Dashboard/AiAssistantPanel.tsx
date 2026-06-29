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
} from "lucide-react"

/* =============================================================
 * AI 운용 어시스턴트 (Cloud LLM 연동) — UavDashboard 삽입용
 * -------------------------------------------------------------
 * ⚠ 스크린샷/발표용 패널입니다. 실제 LLM API 연동 자리는 주석으로 표시.
 *   기능 방향성과 UX 직관성을 보여주는 것이 목적.
 *
 * 세 기능:
 *   ① 비행 후 자동 리포트   — 로그 요약 → 표준 정비/상태 리포트
 *   ② 이상 감지 대응 가이드 — 매뉴얼·과거 사례 기반 조치 문장
 *   ③ 임무 전 적합성 조언   — 기체 상태·과거 데이터 기반 판단
 *   + 운용자 질문 (상황 맞춤형 답변, 우하단 AI 상담과 연계)
 *
 * 사용:
 *   import { AiAssistantPanel } from "./AiAssistantPanel"
 *   <AiAssistantPanel droneConnected={...} droneData={...} droneLabel="DM4_2" />
 * ============================================================= */

interface AiAssistantPanelProps {
  droneConnected: boolean
  droneData: DroneData | null
  droneLabel: string | null
}

type TabKey = "report" | "guide" | "preflight"

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: "report", label: "비행 후 리포트", icon: <FileText className="h-4 w-4" /> },
  { key: "guide", label: "이상 대응 가이드", icon: <LifeBuoy className="h-4 w-4" /> },
  { key: "preflight", label: "임무 적합성", icon: <Compass className="h-4 w-4" /> },
]

export function AiAssistantPanel({
  droneConnected,
  droneData,
  droneLabel,
}: AiAssistantPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<TabKey>("report")

  const label = droneLabel ?? "DM4_2"
  // 실제 값이 있으면 사용, 없으면 시연용 기본값 (스크린샷에서 빈 화면 방지)
  const battery = droneData?.battery ?? 67
  const altitude = droneData?.altitude ?? 52
  const speed = droneData?.speed ?? 9.8

  return (
    <div className="overflow-hidden rounded-3xl border border-indigo-200/60 bg-white shadow-sm">
      {/* 헤더 — AI 정체성(인디고/바이올렛) */}
      <div
        className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/60 px-5 py-4 transition-colors hover:from-indigo-50 hover:to-violet-50"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 p-2 shadow-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">
              AI 운용 어시스턴트
            </p>
            <p className="text-xs text-slate-500">
              Cloud LLM 연동 — 리포트·대응 가이드·임무 조언 자동 생성
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/70 bg-white px-2.5 py-0.5 text-xs font-semibold text-indigo-600">
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
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
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
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  비행 종료 후 자동 생성됨
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <Clock className="h-3 w-3" />
                  14:52 생성
                </span>
              </div>

              <p className="mb-3 text-sm leading-relaxed text-slate-600">
                <b className="font-semibold text-slate-800">{label}</b> 비행이
                정상 종료되었습니다 (30분 12초). 주요 지표는 정상 범위였으며,
                배터리 소모율에서 경미한 주의 항목 1건이 확인되었습니다.
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
                    <p className="text-[10px] text-slate-400">{k.l}</p>
                    <p className="mt-0.5 text-base font-bold text-slate-800">
                      {k.v}
                      {k.u && (
                        <span className="ml-0.5 text-[10px] font-medium text-slate-400">
                          {k.u}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-500">
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
                    ok: false,
                    t: "후반 10분 배터리 소모율이 평소 대비 약 8% 높음 — 바람 영향 가능성. 다음 비행 시 여유 배터리 권장.",
                  },
                ].map((row, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {row.ok ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="text-xs leading-relaxed text-slate-600">
                      {row.t}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-indigo-700">
                  정비 권고
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  즉시 조치 필요 항목 없음. 누적 비행 시간 기준 다음 정기
                  점검까지 <b>4.2시간</b> 남았습니다. 프로펠러 육안 점검을
                  권장합니다.
                </p>
              </div>

              {/* 실제 연동 자리:
                  POST /api/v1/ai/report  { log_summary }  →  LLM 생성 리포트 텍스트 */}
            </div>
          )}

          {/* ② 이상 감지 대응 가이드 */}
          {tab === "guide" && (
            <div>
              <div className="mb-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Power — 전압 변동 주의 (CUSUM)
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  14:43 · 비행 중 전압 예측 오차가 누적 기준을 초과했습니다.
                </p>
              </div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-500">
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
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <p className="text-xs leading-relaxed text-slate-600">
                      <b className="font-semibold text-slate-800">{s.t}</b>
                      {s.d}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-1.5 border-t border-dashed border-slate-200 pt-2.5 text-[11px] text-slate-400">
                <BookOpen className="h-3 w-3" />
                참조 · 운용 매뉴얼 §4.2 전력계통 / 과거 유사 사례 3건 매칭
              </div>

              {/* 실제 연동 자리:
                  이상 감지(systems alert) 발생 시
                  POST /api/v1/ai/guide  { alert, manual_refs, past_cases }  →  대응 문장 */}
            </div>
          )}

          {/* ③ 임무 전 적합성 조언 */}
          {tab === "preflight" && (
            <div>
              {/* 판정 배너 */}
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-200/60 bg-emerald-50/70 px-4 py-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-base font-bold text-emerald-700">
                    임무 수행 적합
                  </p>
                  <p className="text-xs text-slate-500">
                    주요 점검 항목 통과 · 조건부 권고 1건
                  </p>
                </div>
              </div>

              {/* 체크 항목 */}
              <div className="space-y-2">
                {[
                  { ok: true, l: "배터리", v: `충전 ${battery > 90 ? "100" : battery.toFixed(0)}% · 셀 균형 정상` },
                  { ok: true, l: "기체 상태", v: "직전 비행 이상 없음" },
                  { ok: true, l: "GPS / 통신", v: "위성 31 · LTE 양호" },
                  { ok: false, l: "기상", v: "북서풍 6 m/s — 주의" },
                ].map((c) => (
                  <div
                    key={c.l}
                    className="flex items-center gap-2.5 rounded-xl bg-slate-50/70 px-3 py-2"
                  >
                    {c.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span className="text-xs font-medium text-slate-700">
                      {c.l}
                    </span>
                    <span className="ml-auto text-xs text-slate-500">
                      {c.v}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-slate-600">
                  <b className="font-semibold text-indigo-700">💬 AI 조언:</b>{" "}
                  적합 판정이나, 후반 구간 바람으로 배터리 소모가 늘 수 있습니다.
                  임무 반경을 10% 줄이거나 여유 배터리를 확보하세요.
                </p>
              </div>

              {/* 실제 연동 자리:
                  임무 시작 전
                  POST /api/v1/ai/preflight  { drone_status, history, weather }  →  적합 여부 + 조언 */}
            </div>
          )}

          {/* 운용자 질문 (입력 데모) — 우하단 'AI 상담'과 연계됨 */}
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
            <MessageCircle className="h-4 w-4 shrink-0 text-indigo-400" />
            <span className="flex-1 truncate text-xs text-slate-400">
              질문하기 — 예: "이번 비행에서 가장 주의할 점은?"
            </span>
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-600"
            >
              <Send className="h-3 w-3" />
              전송
            </button>
          </div>
        </div>
      )}
    </div>
  )
}