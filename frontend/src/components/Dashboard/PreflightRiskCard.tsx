/**
 * PreflightRiskCard.tsx  (자동 입력 버전)
 *
 * 비행 전 복합 위험 점수 판정 카드 — 5×5 위험 매트릭스 기반 계층형 판정
 *
 * ★ 자동/수동 분리
 *   자동 (기상 API)   : 지속풍속, 기온, 돌풍 킬러, 강수 킬러
 *   자동 (기체 텔레메트리) : GPS 위성 수, GPS 킬러, 배터리 잔량(→ 여유율·배터리 킬러)
 *   반자동            : 배터리 여유율 = (잔량 − 예상 소요) ÷ 예상 소요  — 예상 소요는 수동
 *   수동              : 배터리 온도·사이클 수·통신 RSSI·인구밀도·장애물·공역·자가진단
 *   자동 필드는 "수동 조정" 토글로 덮어쓸 수 있고, 기체 미연결/기상 미수신 시 수동으로 내려간다.
 *
 * 연결 (UavDashboard):
 *   <PreflightRiskCard
 *     connected={connected}
 *     droneData={{ battery, gpsSatellites, gpsFixType }}
 *     weather={{ windSpeed, windGust, temperature, precipitation }}   // 기상 패널 상태 그대로
 *   />
 */

import { useEffect, useMemo, useState } from "react"
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  AlertOctagon,
  Radio,
  CloudSun,
  Lock,
  Unlock,
} from "lucide-react"

// =====================================================
// 입력 데이터 인터페이스
// =====================================================
export interface PreflightWeather {
  windSpeed?: number | null     // 지속풍속 m/s
  windGust?: number | null      // 순간풍속(돌풍) m/s
  temperature?: number | null   // 기온 °C
  precipitation?: number | null // 강수량 mm/h (0 이면 없음)
}
export interface PreflightDroneData {
  battery?: number | null        // 잔량 %
  gpsSatellites?: number | null
  gpsFixType?: number | null
}
interface PreflightRiskCardProps {
  connected?: boolean
  droneData?: PreflightDroneData
  weather?: PreflightWeather
}

// =====================================================
// 등급 변환 룩업
// =====================================================
const gradeWind = (v: number) => (v < 3 ? 1 : v < 5 ? 2 : v < 7 ? 3 : v < 9 ? 4 : 5)
const gradeTemp = (v: number) => {
  if (v >= 15 && v <= 25) return 1
  if ((v >= 5 && v < 15) || (v > 25 && v <= 32)) return 2
  if ((v >= 0 && v < 5) || (v > 32 && v <= 37)) return 3
  if ((v >= -10 && v < 0) || (v > 37 && v <= 40)) return 4
  return 5
}
const gradeBattMargin = (v: number) => (v >= 60 ? 1 : v >= 45 ? 2 : v >= 35 ? 3 : v >= 25 ? 4 : 5)
const gradeBattTemp = (v: number) => {
  if (v >= 15 && v <= 35) return 1
  if ((v >= 10 && v < 15) || (v > 35 && v <= 40)) return 2
  if ((v >= 5 && v < 10) || (v > 40 && v <= 45)) return 3
  if ((v >= 0 && v < 5) || (v > 45 && v <= 50)) return 4
  return 5
}
const gradeBattCycle = (v: number) => (v < 50 ? 1 : v < 100 ? 2 : v < 200 ? 3 : v < 300 ? 4 : 5)
const gradeGps = (v: number) => (v >= 30 ? 1 : v >= 25 ? 2 : v >= 20 ? 3 : v >= 10 ? 4 : 5)
const gradeRssi = (v: number) => (v >= -70 ? 1 : v >= -80 ? 2 : v >= -90 ? 3 : v >= -100 ? 4 : 5)

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

const W = { env: 5, weather: 4, vehicle: 4, nav: 3 } as const
const W_SUM = W.env + W.weather + W.vehicle + W.nav

// 킬러 임계 (자동 감지용)
const KILL_GUST = 12      // m/s
const KILL_PRECIP = 0     // mm/h 초과 시
const KILL_BATT_MARGIN = 20 // %
const KILL_GPS = 10       // 위성

const KILLERS = [
  { id: "gust", short: "돌풍", label: "돌풍 — 순간풍속 12 m/s 초과", auto: "weather" },
  { id: "precip", short: "강수", label: "강수 — 뇌우·우박·비·강설", auto: "weather" },
  { id: "battery", short: "배터리", label: "배터리 — 여유 20% 미만 또는 셀 편차 0.1V 초과", auto: "drone" },
  { id: "gps", short: "GPS", label: "GPS — 가시 위성 10개 미만", auto: "drone" },
  { id: "airspace", short: "공역", label: "공역 — 금지/제한구역 침범, 관제권 미승인", auto: null },
  { id: "preflight", short: "자가진단", label: "기체 — 자가진단(모터·IMU·나침반) 실패", auto: null },
] as const
type KillerId = (typeof KILLERS)[number]["id"]

const GRADE_TEXT = ["", "text-emerald-600", "text-lime-600", "text-amber-600", "text-orange-600", "text-red-600"]

const num = (s: string, fb: number) => {
  const v = parseFloat(s)
  return Number.isFinite(v) ? v : fb
}
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

// =====================================================
// 자동/수동 숫자 입력 행
// =====================================================
type Source = "weather" | "drone" | "manual"

function SourceBadge({ source, locked }: { source: Source; locked: boolean }) {
  if (source === "manual")
    return <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold text-slate-500">수동</span>
  const label = source === "weather" ? "자동 · 기상" : "자동 · 기체"
  const tone = locked ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold ${tone}`}>
      {source === "weather" ? <CloudSun className="h-2.5 w-2.5" /> : <Radio className="h-2.5 w-2.5" />}
      {locked ? label : "수동 조정 중"}
    </span>
  )
}

function NumRow({
  label, unit, value, onChange, grade, source = "manual", autoValue, overridden, onToggleOverride,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  grade: number
  source?: Source
  autoValue?: number | null
  overridden?: boolean
  onToggleOverride?: () => void
}) {
  const hasAuto = source !== "manual" && isNum(autoValue)
  const locked = hasAuto && !overridden
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="flex w-28 shrink-0 flex-col text-xs text-slate-500">
        <span>{label}</span>
        <SourceBadge source={hasAuto ? source : "manual"} locked={locked} />
      </span>
      <span className="flex flex-1 items-center justify-end gap-1.5">
        <input
          type="number"
          value={value}
          disabled={locked}
          onChange={(e) => onChange(e.target.value)}
          className={`w-20 rounded-xl border px-2 py-1 text-right text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-100 ${
            locked ? "border-sky-100 bg-sky-50/60 text-slate-700" : "border-slate-200 bg-white text-slate-700 focus:border-sky-300"
          }`}
        />
        <span className="w-8 text-[10px] text-slate-400">{unit}</span>
        {hasAuto && onToggleOverride && (
          <button type="button" onClick={onToggleOverride} title={locked ? "수동으로 조정" : "자동값으로 복귀"} className="text-slate-400 hover:text-slate-600">
            {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          </button>
        )}
        <span className={`w-10 text-right text-[11px] font-bold ${GRADE_TEXT[grade]}`}>{grade}등급</span>
      </span>
    </div>
  )
}

// =====================================================
// 메인 카드
// =====================================================
export function PreflightRiskCard({ connected = false, droneData, weather }: PreflightRiskCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  // 자동 소스 값 (없으면 null)
  const autoWind = isNum(weather?.windSpeed) ? weather!.windSpeed! : null
  const autoGust = isNum(weather?.windGust) ? weather!.windGust! : null
  const autoTemp = isNum(weather?.temperature) ? weather!.temperature! : null
  const autoPrecip = isNum(weather?.precipitation) ? weather!.precipitation! : null
  const autoBatt = connected && isNum(droneData?.battery) ? droneData!.battery! : null
  const autoSat = connected && isNum(droneData?.gpsSatellites) ? droneData!.gpsSatellites! : null

  // 수동 킬러 (자동 킬러는 계산으로 결정)
  const [manualKillers, setManualKillers] = useState<Record<"airspace" | "preflight", boolean>>({ airspace: false, preflight: false })

  // 측정값 상태 + 자동 필드 덮어쓰기 토글
  const [wind, setWind] = useState("2.0")
  const [temp, setTemp] = useState("20")
  const [battRemain, setBattRemain] = useState("90")   // 잔량 % (자동)
  const [battRequired, setBattRequired] = useState("40") // 예상 소요 % (수동)
  const [battTemp, setBattTemp] = useState("25")
  const [battCycle, setBattCycle] = useState("30")
  const [gpsSat, setGpsSat] = useState("30")
  const [rssi, setRssi] = useState("-65")
  const [popGrade, setPopGrade] = useState(2)
  const [obsGrade, setObsGrade] = useState(1)
  const [ovr, setOvr] = useState({ wind: false, temp: false, batt: false, gps: false })

  // 자동값이 들어오면 (덮어쓰기 안 한 필드만) 동기화
  useEffect(() => { if (autoWind !== null && !ovr.wind) setWind(autoWind.toFixed(1)) }, [autoWind, ovr.wind])
  useEffect(() => { if (autoTemp !== null && !ovr.temp) setTemp(autoTemp.toFixed(0)) }, [autoTemp, ovr.temp])
  useEffect(() => { if (autoBatt !== null && !ovr.batt) setBattRemain(autoBatt.toFixed(0)) }, [autoBatt, ovr.batt])
  useEffect(() => { if (autoSat !== null && !ovr.gps) setGpsSat(String(autoSat)) }, [autoSat, ovr.gps])

  const r = useMemo(() => {
    const remain = num(battRemain, 0)
    const required = Math.max(1, num(battRequired, 40))
    const margin = ((remain - required) / required) * 100

    const g = {
      wind: gradeWind(num(wind, 0)),
      temp: gradeTemp(num(temp, 20)),
      battM: gradeBattMargin(margin),
      battT: gradeBattTemp(num(battTemp, 25)),
      battC: gradeBattCycle(num(battCycle, 0)),
      gps: gradeGps(num(gpsSat, 30)),
      rssi: gradeRssi(num(rssi, -65)),
    }
    const catWeather = Math.max(g.wind, g.temp)
    const catVehicle = Math.max(g.battM, g.battT, g.battC)
    const catNav = Math.max(g.gps, g.rssi)
    const catEnv = Math.max(popGrade, obsGrade)

    const weighted = ((catWeather * W.weather + catVehicle * W.vehicle + catNav * W.nav + catEnv * W.env) / W_SUM) * 5
    const worst = Math.max(catWeather, catVehicle, catNav, catEnv)
    const worstScore = worst * 4
    const finalScore = Math.max(weighted, worstScore)

    // 자동 킬러 판정
    const autoKillers: Record<KillerId, boolean> = {
      gust: autoGust !== null && autoGust > KILL_GUST,
      precip: autoPrecip !== null && autoPrecip > KILL_PRECIP,
      battery: margin < KILL_BATT_MARGIN,
      gps: num(gpsSat, 30) < KILL_GPS,
      airspace: manualKillers.airspace,
      preflight: manualKillers.preflight,
    }
    const killerHit = KILLERS.filter((k) => autoKillers[k.id])
    const verdict: "go" | "conditional" | "nogo" =
      killerHit.length > 0 ? "nogo" : finalScore < 10 ? "go" : finalScore < 15 ? "conditional" : "nogo"

    return {
      g, margin, autoKillers,
      cats: [
        { name: "환경", grade: catEnv, weight: W.env },
        { name: "기상", grade: catWeather, weight: W.weather },
        { name: "기체 상태", grade: catVehicle, weight: W.vehicle },
        { name: "항법·통신", grade: catNav, weight: W.nav },
      ],
      weighted, worstScore, finalScore, killerHit, verdict,
    }
  }, [wind, temp, battRemain, battRequired, battTemp, battCycle, gpsSat, rssi, popGrade, obsGrade, manualKillers, autoGust, autoPrecip])

  const verdictConfig = {
    go: { label: "비행 가능", sublabel: "정상 비행 실시", icon: <ShieldCheck className="h-8 w-8" />, bg: "from-emerald-500 to-teal-400", border: "border-emerald-200/60", bg2: "bg-emerald-50/80", text: "text-emerald-700" },
    conditional: { label: "조건부 비행", sublabel: "완화 조치(우회 경로·고도 조정·페이로드 감량) 적용 후 재평가", icon: <ShieldAlert className="h-8 w-8" />, bg: "from-amber-500 to-yellow-400", border: "border-amber-200/60", bg2: "bg-amber-50/80", text: "text-amber-700" },
    nogo: { label: "비행 금지", sublabel: "비행 취소 또는 연기", icon: <ShieldX className="h-8 w-8 animate-pulse" />, bg: "from-red-500 to-rose-500", border: "border-red-200/60", bg2: "bg-red-50/80", text: "text-red-700" },
  }[r.verdict]

  const resetAll = () => {
    setManualKillers({ airspace: false, preflight: false })
    setOvr({ wind: false, temp: false, batt: false, gps: false })
    setWind(autoWind !== null ? autoWind.toFixed(1) : "2.0")
    setTemp(autoTemp !== null ? autoTemp.toFixed(0) : "20")
    setBattRemain(autoBatt !== null ? autoBatt.toFixed(0) : "90")
    setBattRequired("40")
    setBattTemp("25")
    setBattCycle("30")
    setGpsSat(autoSat !== null ? String(autoSat) : "30")
    setRssi("-65")
    setPopGrade(2)
    setObsGrade(1)
  }

  const autoCount = [autoWind, autoTemp, autoBatt, autoSat].filter((v) => v !== null).length

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
      {/* 헤더 */}
      <div className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 transition-colors hover:bg-slate-100/60" onClick={() => setCollapsed((v) => !v)}>
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 p-1.5 shadow-sm">
            <ClipboardCheck className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">비행 전 복합 위험 점수</p>
            <p className="text-xs text-slate-500">
              5×5 위험 매트릭스 · {autoCount > 0 ? `자동 입력 ${autoCount}/4` : "수동 입력"}
              {!connected && " · 기체 미연결"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${verdictConfig.bg2} ${verdictConfig.text}`}>
            {verdictConfig.label}
            {r.killerHit.length === 0 && <span className="font-semibold opacity-70">{r.finalScore.toFixed(1)}점</span>}
          </span>
          <span className="text-slate-400">{collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-4 p-4">
          {/* 판정 히어로 */}
          <div className={`rounded-2xl border ${verdictConfig.border} ${verdictConfig.bg2}`}>
            <div className="flex items-center gap-4 px-5 py-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${verdictConfig.bg} text-white shadow-lg`}>{verdictConfig.icon}</div>
              <div className="min-w-0 flex-1">
                <h3 className={`text-lg font-bold ${verdictConfig.text}`}>{verdictConfig.label}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{verdictConfig.sublabel}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-3xl font-bold leading-none ${verdictConfig.text}`}>{r.killerHit.length > 0 ? "—" : r.finalScore.toFixed(1)}</p>
                <p className="mt-1 text-[10px] text-slate-400">최종 점수 (5~25)</p>
              </div>
            </div>
            {r.killerHit.length > 0 && (
              <div className="flex items-start gap-2 border-t border-red-200/60 px-5 py-2.5">
                <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                <p className="text-[11px] font-medium text-red-700">
                  절대 금지 조건 해당: {r.killerHit.map((k) => k.short).join(", ")} — 점수와 무관하게 비행 금지
                </p>
              </div>
            )}
          </div>

          {/* 0단계: 킬러 — 자동 감지 4 + 수동 2 */}
          <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3.5">
            <p className="mb-2 text-xs font-semibold text-slate-600">
              0단계 · 절대 금지 조건 <span className="font-normal text-slate-400">(돌풍·강수·배터리·GPS 자동 감지 / 공역·자가진단 체크)</span>
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {KILLERS.map((k) => {
                const isAuto = k.auto !== null
                const checked = r.autoKillers[k.id]
                // 자동 킬러의 데이터 유무
                const hasData =
                  k.id === "gust" ? autoGust !== null
                  : k.id === "precip" ? autoPrecip !== null
                  : k.id === "battery" ? true
                  : k.id === "gps" ? true
                  : true
                return (
                  <label key={k.id} className={`flex items-start gap-2 rounded-lg px-1.5 py-1 text-[11px] transition ${isAuto ? "cursor-default" : "cursor-pointer hover:bg-slate-100/70"} ${checked ? "text-red-700" : "text-slate-600"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isAuto}
                      onChange={(e) => { if (!isAuto) setManualKillers({ ...manualKillers, [k.id]: e.target.checked }) }}
                      className="mt-0.5 accent-red-500"
                    />
                    <span className="flex-1">
                      {k.label}
                      {isAuto && (
                        <span className={`ml-1 rounded px-1 py-0.5 text-[9px] font-semibold ${hasData ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-400"}`}>
                          {hasData ? (checked ? "자동 감지됨" : "자동 감시 중") : "데이터 없음"}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* 1단계: 측정값 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/60 p-3.5">
              <p className="mb-1 text-xs font-semibold text-slate-600">기상 <span className="text-[10px] font-normal text-slate-400">가중치 4</span></p>
              <NumRow label="지속풍속" unit="m/s" value={wind} onChange={setWind} grade={r.g.wind}
                source="weather" autoValue={autoWind} overridden={ovr.wind} onToggleOverride={() => setOvr({ ...ovr, wind: !ovr.wind })} />
              <NumRow label="기온" unit="°C" value={temp} onChange={setTemp} grade={r.g.temp}
                source="weather" autoValue={autoTemp} overridden={ovr.temp} onToggleOverride={() => setOvr({ ...ovr, temp: !ovr.temp })} />
              {autoGust !== null && (
                <p className="mt-1 text-[10px] text-slate-400">돌풍 {autoGust.toFixed(1)} m/s (킬러 기준 {KILL_GUST}) · 강수 {autoPrecip !== null ? `${autoPrecip.toFixed(1)} mm/h` : "–"}</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/60 p-3.5">
              <p className="mb-1 text-xs font-semibold text-slate-600">기체 상태 <span className="text-[10px] font-normal text-slate-400">가중치 4</span></p>
              <NumRow label="배터리 잔량" unit="%" value={battRemain} onChange={setBattRemain} grade={r.g.battM}
                source="drone" autoValue={autoBatt} overridden={ovr.batt} onToggleOverride={() => setOvr({ ...ovr, batt: !ovr.batt })} />
              <NumRow label="예상 소요" unit="%" value={battRequired} onChange={setBattRequired} grade={r.g.battM} />
              <p className="mb-1 text-[10px] text-slate-400">여유율 = (잔량 − 소요) ÷ 소요 = <b className={GRADE_TEXT[r.g.battM]}>{r.margin.toFixed(0)}%</b></p>
              <NumRow label="배터리 온도" unit="°C" value={battTemp} onChange={setBattTemp} grade={r.g.battT} />
              <NumRow label="사이클 수" unit="회" value={battCycle} onChange={setBattCycle} grade={r.g.battC} />
            </div>

            <div className="rounded-2xl border border-slate-200/60 p-3.5">
              <p className="mb-1 text-xs font-semibold text-slate-600">항법·통신 <span className="text-[10px] font-normal text-slate-400">가중치 3</span></p>
              <NumRow label="GPS 위성 수" unit="개" value={gpsSat} onChange={setGpsSat} grade={r.g.gps}
                source="drone" autoValue={autoSat} overridden={ovr.gps} onToggleOverride={() => setOvr({ ...ovr, gps: !ovr.gps })} />
              <NumRow label="통신 RSSI" unit="dBm" value={rssi} onChange={setRssi} grade={r.g.rssi} />
            </div>

            <div className="rounded-2xl border border-slate-200/60 p-3.5">
              <p className="mb-1 text-xs font-semibold text-slate-600">환경 <span className="text-[10px] font-normal text-slate-400">가중치 5 · 수동</span></p>
              <label className="block py-1">
                <span className="text-xs text-slate-500">경로상 인구밀도</span>
                <select value={popGrade} onChange={(e) => setPopGrade(Number(e.target.value))} className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100">
                  {POP_OPTIONS.map((o) => <option key={o.grade} value={o.grade}>{o.label}</option>)}
                </select>
              </label>
              <label className="block py-1">
                <span className="text-xs text-slate-500">장애물 및 지형</span>
                <select value={obsGrade} onChange={(e) => setObsGrade(Number(e.target.value))} className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100">
                  {OBS_OPTIONS.map((o) => <option key={o.grade} value={o.grade}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {/* 하단 */}
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setShowDetail((v) => !v)} className="flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-slate-600">
              {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} 계산 상세 {showDetail ? "접기" : "보기"}
            </button>
            <button type="button" onClick={resetAll} className="flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-slate-600">
              <RotateCcw className="h-3 w-3" /> 초기화 (자동값 복귀)
            </button>
          </div>

          {showDetail && (
            <div className="space-y-2 rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3.5 text-[11px] text-slate-600">
              <table className="w-full text-left">
                <thead><tr className="text-slate-400"><th className="pb-1 font-medium">카테고리</th><th className="pb-1 text-center font-medium">대표 등급</th><th className="pb-1 text-center font-medium">가중치</th><th className="pb-1 text-right font-medium">기여도</th></tr></thead>
                <tbody>
                  {r.cats.map((c) => (
                    <tr key={c.name} className="border-t border-slate-200/60">
                      <td className="py-1">{c.name}</td>
                      <td className={`py-1 text-center font-bold ${GRADE_TEXT[c.grade]}`}>{c.grade}</td>
                      <td className="py-1 text-center">{c.weight}</td>
                      <td className="py-1 text-right">{c.grade * c.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-0.5 border-t border-slate-200/60 pt-1.5">
                <p>가중평균 = Σ(등급×가중치) ÷ {W_SUM} × 5 = <b>{r.weighted.toFixed(1)}점</b></p>
                <p>최악값 규칙 = 최악 카테고리 등급 × 4 = <b>{r.worstScore}점</b></p>
                <p>최종 점수 = max(가중평균, 최악값) = <b>{r.finalScore.toFixed(1)}점</b><span className="text-slate-400"> · 5~9 가능 / 10~14 조건부 / 15+ 금지</span></p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}