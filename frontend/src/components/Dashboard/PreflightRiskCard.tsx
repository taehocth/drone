/**
 * PreflightRiskCard.tsx
 *
 * 비행 전 복합 위험 점수 판정 카드 — "드론배송 복합위험점수" 설계 문서 구현
 * (5×5 위험 매트릭스 기반 계층형 비행 가능/조건부/금지 판정 모델)
 *
 * 판정 절차 (문서 5단계):
 *   1단계  측정값 입력 (현재 수동 입력 — 추후 텔레메트리/기상 API 자동 연동)
 *   2단계  킬러 항목(절대 금지 조건) 검사 → 해당 시 점수 무관 즉시 금지
 *   3단계  항목별 1~5등급 변환 (구간 룩업)
 *   4단계  카테고리 대표등급(내부 최댓값) → max(가중평균×5, 최악등급×4)
 *   5단계  3구역 판정: 5~9 가능 / 10~14 조건부 / 15+ 금지
 *
 * 배치: UavDashboard 좌측 컬럼, FlightFeasibilityWidget 아래
 *   import { PreflightRiskCard } from "@/components/Dashboard/PreflightRiskCard"
 *   <PreflightRiskCard />
 */

import { useMemo, useState } from "react"
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  AlertOctagon,
} from "lucide-react"

// =====================================================
// ★ 등급 변환 룩업 (설계 문서 5장 등급표)
// =====================================================

/** 기상 — 지속풍속 (m/s) */
const gradeWind = (v: number) =>
  v < 3 ? 1 : v < 5 ? 2 : v < 7 ? 3 : v < 9 ? 4 : 5

/** 기상 — 기온 (°C) */
const gradeTemp = (v: number) => {
  if (v >= 15 && v <= 25) return 1
  if ((v >= 5 && v < 15) || (v > 25 && v <= 32)) return 2
  if ((v >= 0 && v < 5) || (v > 32 && v <= 37)) return 3
  if ((v >= -10 && v < 0) || (v > 37 && v <= 40)) return 4
  return 5
}

/** 기체 — 배터리 여유율 (%) = (잔량−소요)÷소요 */
const gradeBattMargin = (v: number) =>
  v >= 60 ? 1 : v >= 45 ? 2 : v >= 35 ? 3 : v >= 25 ? 4 : 5

/** 기체 — 배터리 온도 (°C) */
const gradeBattTemp = (v: number) => {
  if (v >= 15 && v <= 35) return 1
  if ((v >= 10 && v < 15) || (v > 35 && v <= 40)) return 2
  if ((v >= 5 && v < 10) || (v > 40 && v <= 45)) return 3
  if ((v >= 0 && v < 5) || (v > 45 && v <= 50)) return 4
  return 5
}

/** 기체 — 배터리 사이클 수 */
const gradeBattCycle = (v: number) =>
  v < 50 ? 1 : v < 100 ? 2 : v < 200 ? 3 : v < 300 ? 4 : 5

/** 항법 — GPS 가시 위성 수 */
const gradeGps = (v: number) =>
  v >= 30 ? 1 : v >= 25 ? 2 : v >= 20 ? 3 : v >= 10 ? 4 : 5

/** 통신 — 링크 RSSI (dBm) */
const gradeRssi = (v: number) =>
  v >= -70 ? 1 : v >= -80 ? 2 : v >= -90 ? 3 : v >= -100 ? 4 : 5

// 환경 — 정성 항목 (드롭다운)
const POP_OPTIONS = [
  { grade: 1, label: "1등급 · 비거주 개활지" },
  { grade: 2, label: "2등급 · 농촌, 산업단지 외곽" },
  { grade: 3, label: "3등급 · 교외 주거지" },
  { grade: 4, label: "4등급 · 도심 일반" },
  { grade: 5, label: "5등급 · 인파 밀집(행사장·학교·역)" },
]
const OBS_OPTIONS = [
  { grade: 1, label: "1등급 · 개활지, 장애물 없음" },
  { grade: 2, label: "2등급 · 저층 건물 산재" },
  { grade: 3, label: "3등급 · 중층 건물, 전선 존재" },
  { grade: 4, label: "4등급 · 고층 밀집, 협곡 지형" },
  { grade: 5, label: "5등급 · 초고층, GPS 음영 구간" },
]

// 카테고리 가중치 (문서 6.2 — 심각도 계수)
const W = { env: 5, weather: 4, vehicle: 4, nav: 3 } as const
const W_SUM = W.env + W.weather + W.vehicle + W.nav // 16

// 킬러 항목 (문서 4장 — 절대 금지 조건)
const KILLERS = [
  { id: "gust", short: "돌풍", label: "돌풍 — 순간풍속 12 m/s 초과" },
  { id: "precip", short: "강수", label: "강수 — 뇌우·우박·비·강설" },
  {
    id: "battery",
    short: "배터리",
    label: "배터리 — 여유 20% 미만 또는 셀 편차 0.1V 초과",
  },
  { id: "gps", short: "GPS", label: "GPS — 가시 위성 10개 미만" },
  {
    id: "airspace",
    short: "공역",
    label: "공역 — 금지/제한구역 침범, 관제권 미승인",
  },
  {
    id: "preflight",
    short: "자가진단",
    label: "기체 — 자가진단(모터·IMU·나침반) 실패",
  },
] as const
type KillerId = (typeof KILLERS)[number]["id"]

// 등급별 텍스트 색 (입력 필드 옆 표시)
const GRADE_TEXT = [
  "",
  "text-emerald-600",
  "text-lime-600",
  "text-amber-600",
  "text-orange-600",
  "text-red-600",
]

// =====================================================
// 숫자 입력 행
// =====================================================
function NumRow({
  label,
  unit,
  value,
  onChange,
  grade,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  grade: number
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="w-24 shrink-0 text-xs text-slate-500">{label}</span>
      <span className="flex flex-1 items-center justify-end gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-1 text-right text-xs font-medium text-slate-700 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
        <span className="w-8 text-[10px] text-slate-400">{unit}</span>
        <span
          className={`w-10 text-right text-[11px] font-bold ${GRADE_TEXT[grade]}`}
        >
          {grade}등급
        </span>
      </span>
    </label>
  )
}

// =====================================================
// 메인 카드
// =====================================================
export function PreflightRiskCard() {
  const [collapsed, setCollapsed] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  // 0단계 — 킬러 항목
  const [killers, setKillers] = useState<Record<KillerId, boolean>>({
    gust: false,
    precip: false,
    battery: false,
    gps: false,
    airspace: false,
    preflight: false,
  })

  // 1단계 — 측정값 (수동 입력)
  const [wind, setWind] = useState("2.0")
  const [temp, setTemp] = useState("20")
  const [battMargin, setBattMargin] = useState("60")
  const [battTemp, setBattTemp] = useState("25")
  const [battCycle, setBattCycle] = useState("30")
  const [gpsSat, setGpsSat] = useState("30")
  const [rssi, setRssi] = useState("-65")
  const [popGrade, setPopGrade] = useState(2)
  const [obsGrade, setObsGrade] = useState(1)

  const num = (s: string, fb: number) => {
    const v = parseFloat(s)
    return Number.isFinite(v) ? v : fb
  }

  // 3~5단계 — 등급 → 복합 점수 → 판정 (입력 즉시 재계산)
  const r = useMemo(() => {
    const g = {
      wind: gradeWind(num(wind, 0)),
      temp: gradeTemp(num(temp, 20)),
      battM: gradeBattMargin(num(battMargin, 60)),
      battT: gradeBattTemp(num(battTemp, 25)),
      battC: gradeBattCycle(num(battCycle, 0)),
      gps: gradeGps(num(gpsSat, 30)),
      rssi: gradeRssi(num(rssi, -65)),
    }
    // 카테고리 대표등급 = 내부 최댓값 (상관관계 제거, 문서 6.1)
    const catWeather = Math.max(g.wind, g.temp)
    const catVehicle = Math.max(g.battM, g.battT, g.battC)
    const catNav = Math.max(g.gps, g.rssi)
    const catEnv = Math.max(popGrade, obsGrade)

    const weighted =
      ((catWeather * W.weather +
        catVehicle * W.vehicle +
        catNav * W.nav +
        catEnv * W.env) /
        W_SUM) *
      5
    const worst = Math.max(catWeather, catVehicle, catNav, catEnv)
    const worstScore = worst * 4
    const finalScore = Math.max(weighted, worstScore)

    const killerHit = KILLERS.filter((k) => killers[k.id])
    const verdict: "go" | "conditional" | "nogo" =
      killerHit.length > 0
        ? "nogo"
        : finalScore < 10
          ? "go"
          : finalScore < 15
            ? "conditional"
            : "nogo"

    return {
      g,
      cats: [
        { name: "환경", grade: catEnv, weight: W.env },
        { name: "기상", grade: catWeather, weight: W.weather },
        { name: "기체 상태", grade: catVehicle, weight: W.vehicle },
        { name: "항법·통신", grade: catNav, weight: W.nav },
      ],
      weighted,
      worstScore,
      finalScore,
      killerHit,
      verdict,
    }
  }, [
    killers,
    wind,
    temp,
    battMargin,
    battTemp,
    battCycle,
    gpsSat,
    rssi,
    popGrade,
    obsGrade,
  ])

  // 판정별 스타일 — FlightFeasibilityWidget 톤과 통일
  const verdictConfig = {
    go: {
      label: "비행 가능",
      sublabel: "정상 비행 실시",
      icon: <ShieldCheck className="h-8 w-8" />,
      bg: "from-emerald-500 to-teal-400",
      border: "border-emerald-200/60",
      bg2: "bg-emerald-50/80",
      text: "text-emerald-700",
    },
    conditional: {
      label: "조건부 비행",
      sublabel: "완화 조치(우회 경로·고도 조정·페이로드 감량) 적용 후 재평가",
      icon: <ShieldAlert className="h-8 w-8" />,
      bg: "from-amber-500 to-yellow-400",
      border: "border-amber-200/60",
      bg2: "bg-amber-50/80",
      text: "text-amber-700",
    },
    nogo: {
      label: "비행 금지",
      sublabel: "비행 취소 또는 연기",
      icon: <ShieldX className="h-8 w-8 animate-pulse" />,
      bg: "from-red-500 to-rose-500",
      border: "border-red-200/60",
      bg2: "bg-red-50/80",
      text: "text-red-700",
    },
  }[r.verdict]

  const resetAll = () => {
    setKillers({
      gust: false,
      precip: false,
      battery: false,
      gps: false,
      airspace: false,
      preflight: false,
    })
    setWind("2.0")
    setTemp("20")
    setBattMargin("60")
    setBattTemp("25")
    setBattCycle("30")
    setGpsSat("30")
    setRssi("-65")
    setPopGrade(2)
    setObsGrade(1)
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
      {/* ── 헤더 (다른 패널과 동일 패턴: 접기 토글) ── */}
      <div
        className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 transition-colors hover:bg-slate-100/60"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 p-1.5 shadow-sm">
            <ClipboardCheck className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              비행 전 복합 위험 점수
            </p>
            <p className="text-xs text-slate-500">
              5×5 위험 매트릭스 기반 계층형 판정 · 수동 입력
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 접힌 상태에서도 판정 요약이 보이도록 */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${verdictConfig.bg2} ${verdictConfig.text}`}
          >
            {verdictConfig.label}
            {r.killerHit.length === 0 && (
              <span className="font-semibold opacity-70">
                {r.finalScore.toFixed(1)}점
              </span>
            )}
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
        <div className="space-y-4 p-4">
          {/* ── 판정 히어로 (FlightFeasibilityWidget 톤) ── */}
          <div
            className={`rounded-2xl border ${verdictConfig.border} ${verdictConfig.bg2}`}
          >
            <div className="flex items-center gap-4 px-5 py-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${verdictConfig.bg} text-white shadow-lg`}
              >
                {verdictConfig.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className={`text-lg font-bold ${verdictConfig.text}`}>
                  {verdictConfig.label}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {verdictConfig.sublabel}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`text-3xl font-bold leading-none ${verdictConfig.text}`}
                >
                  {r.killerHit.length > 0 ? "—" : r.finalScore.toFixed(1)}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  최종 점수 (5~25)
                </p>
              </div>
            </div>
            {r.killerHit.length > 0 && (
              <div className="flex items-start gap-2 border-t border-red-200/60 px-5 py-2.5">
                <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                <p className="text-[11px] font-medium text-red-700">
                  절대 금지 조건 해당:{" "}
                  {r.killerHit.map((k) => k.short).join(", ")} — 점수와 무관하게
                  비행 금지
                </p>
              </div>
            )}
          </div>

          {/* ── 0단계: 킬러 항목 ── */}
          <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3.5">
            <p className="mb-2 text-xs font-semibold text-slate-600">
              0단계 · 절대 금지 조건{" "}
              <span className="font-normal text-slate-400">
                (해당 항목 체크)
              </span>
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {KILLERS.map((k) => (
                <label
                  key={k.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-[11px] text-slate-600 transition hover:bg-slate-100/70"
                >
                  <input
                    type="checkbox"
                    checked={killers[k.id]}
                    onChange={(e) =>
                      setKillers({ ...killers, [k.id]: e.target.checked })
                    }
                    className="mt-0.5 accent-red-500"
                  />
                  <span>{k.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── 1단계: 측정값 입력 (카테고리 4개) ── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/60 p-3.5">
              <p className="mb-1 text-xs font-semibold text-slate-600">
                기상{" "}
                <span className="text-[10px] font-normal text-slate-400">
                  가중치 4
                </span>
              </p>
              <NumRow
                label="지속풍속"
                unit="m/s"
                value={wind}
                onChange={setWind}
                grade={r.g.wind}
              />
              <NumRow
                label="기온"
                unit="°C"
                value={temp}
                onChange={setTemp}
                grade={r.g.temp}
              />
            </div>

            <div className="rounded-2xl border border-slate-200/60 p-3.5">
              <p className="mb-1 text-xs font-semibold text-slate-600">
                기체 상태{" "}
                <span className="text-[10px] font-normal text-slate-400">
                  가중치 4
                </span>
              </p>
              <NumRow
                label="배터리 여유율"
                unit="%"
                value={battMargin}
                onChange={setBattMargin}
                grade={r.g.battM}
              />
              <NumRow
                label="배터리 온도"
                unit="°C"
                value={battTemp}
                onChange={setBattTemp}
                grade={r.g.battT}
              />
              <NumRow
                label="사이클 수"
                unit="회"
                value={battCycle}
                onChange={setBattCycle}
                grade={r.g.battC}
              />
            </div>

            <div className="rounded-2xl border border-slate-200/60 p-3.5">
              <p className="mb-1 text-xs font-semibold text-slate-600">
                항법·통신{" "}
                <span className="text-[10px] font-normal text-slate-400">
                  가중치 3
                </span>
              </p>
              <NumRow
                label="GPS 위성 수"
                unit="개"
                value={gpsSat}
                onChange={setGpsSat}
                grade={r.g.gps}
              />
              <NumRow
                label="통신 RSSI"
                unit="dBm"
                value={rssi}
                onChange={setRssi}
                grade={r.g.rssi}
              />
            </div>

            <div className="rounded-2xl border border-slate-200/60 p-3.5">
              <p className="mb-1 text-xs font-semibold text-slate-600">
                환경{" "}
                <span className="text-[10px] font-normal text-slate-400">
                  가중치 5
                </span>
              </p>
              <label className="block py-1">
                <span className="text-xs text-slate-500">경로상 인구밀도</span>
                <select
                  value={popGrade}
                  onChange={(e) => setPopGrade(Number(e.target.value))}
                  className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                >
                  {POP_OPTIONS.map((o) => (
                    <option key={o.grade} value={o.grade}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block py-1">
                <span className="text-xs text-slate-500">장애물 및 지형</span>
                <select
                  value={obsGrade}
                  onChange={(e) => setObsGrade(Number(e.target.value))}
                  className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                >
                  {OBS_OPTIONS.map((o) => (
                    <option key={o.grade} value={o.grade}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* ── 하단: 계산 상세 토글 + 초기화 ── */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-slate-600"
            >
              {showDetail ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              계산 상세 {showDetail ? "접기" : "보기"}
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-slate-600"
            >
              <RotateCcw className="h-3 w-3" /> 초기화
            </button>
          </div>

          {showDetail && (
            <div className="space-y-2 rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3.5 text-[11px] text-slate-600">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-1 font-medium">카테고리</th>
                    <th className="pb-1 text-center font-medium">대표 등급</th>
                    <th className="pb-1 text-center font-medium">가중치</th>
                    <th className="pb-1 text-right font-medium">기여도</th>
                  </tr>
                </thead>
                <tbody>
                  {r.cats.map((c) => (
                    <tr key={c.name} className="border-t border-slate-200/60">
                      <td className="py-1">{c.name}</td>
                      <td
                        className={`py-1 text-center font-bold ${GRADE_TEXT[c.grade]}`}
                      >
                        {c.grade}
                      </td>
                      <td className="py-1 text-center">{c.weight}</td>
                      <td className="py-1 text-right">{c.grade * c.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-0.5 border-t border-slate-200/60 pt-1.5">
                <p>
                  가중평균 = Σ(등급×가중치) ÷ {W_SUM} × 5 ={" "}
                  <b>{r.weighted.toFixed(1)}점</b>
                </p>
                <p>
                  최악값 규칙 = 최악 카테고리 등급 × 4 = <b>{r.worstScore}점</b>
                </p>
                <p>
                  최종 점수 = max(가중평균, 최악값) ={" "}
                  <b>{r.finalScore.toFixed(1)}점</b>
                  <span className="text-slate-400">
                    {" "}
                    · 5~9 가능 / 10~14 조건부 / 15+ 금지
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
