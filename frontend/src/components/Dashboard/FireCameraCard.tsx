import { useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import {
  Flame,
  Video,
  VideoOff,
  Radio,
  Battery,
  Satellite,
  Navigation,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react"

/* =============================================================
 * FireCameraCard — 화점탐지 기체 실시간 영상 + AI 탐지 상태
 * -------------------------------------------------------------
 *  영상 : 지상 PC MediaMTX(HLS) → Tailscale Funnel(HTTPS) → hls.js
 *         탐지 박스는 Jetson 이 영상에 직접 그려서 보낸다 (오버레이 어긋남 없음)
 *  데이터: Jetson UDP JSON → fire_agent.py → 백엔드 /api/v1/fire/ws
 *  신뢰성 표시: LIVE 배지(영상 재생 + 데이터 수신 동시), Jetson 시각, 데이터 지연,
 *              수신 Hz·손실률, 탐지 구간 로그
 *  영상 전용 모드: 기체 데이터(fire_agent)가 연동되지 않으면 영상만으로 LIVE 를 판단하고,
 *               데이터 칸은 "미연동" 으로 조용히 표시한다 (탐지 결과는 영상 속 박스로 확인).
 *  필요 패키지: npm install hls.js
 * ============================================================= */

interface FireDetection {
  source: "fire" | "yolo"
  on: boolean
  conf: number
  lat?: number | null
  lon?: number | null
}
interface FireEvent {
  id: number
  source: string
  start_ms: number
  end_ms: number | null
  duration_s: number
  conf_max: number
  lat?: number | null
  lon?: number | null
  pos_kind: "detect" | "vehicle"
  active: boolean
}
interface FireSnapshot {
  vehicle_id: string | null
  stream_url: string
  agent_online: boolean
  agent_age_s: number | null
  agent: { hz?: number; loss?: number | null; age_s?: number | null; src?: string } | null
  data_online: boolean
  msg: any | null
  detection: FireDetection | null
  events: FireEvent[]
  server_unix_ms: number
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1"

const PHASE_LABEL: Record<string, string> = {
  search: "탐색",
  approach: "접근",
  landing: "착륙",
  landed: "착륙 완료",
}

const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "-"

function wsUrl(path: string) {
  const protocol = API_BASE_URL.startsWith("https") ? "wss" : "ws"
  const host = API_BASE_URL.replace(/^https?:\/\//, "").replace(/\/api\/v1\/?$/, "")
  return `${protocol}://${host}/api/v1${path}`
}

interface FireCameraCardProps {
  /** 영상 주소를 직접 지정 (없으면 백엔드 FIRE_STREAM_URL 사용) */
  streamUrl?: string
  /** 탐지 대상 이름 — 화점 모델 연결 전에는 Jetson 의 YOLO(스테이션) 결과가 표시됨 */
  detectLabel?: string
  title?: string
}

export function FireCameraCard({ streamUrl, detectLabel = "화점", title = "화점탐지 실시간 영상" }: FireCameraCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [snap, setSnap] = useState<FireSnapshot | null>(null)
  const [wsOk, setWsOk] = useState(false)
  const [videoState, setVideoState] = useState<"idle" | "loading" | "playing" | "error">("idle")
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(Date.now())

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)

  // ── 데이터 WS ─────────────────────────────────────────
  useEffect(() => {
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let closed = false
    const connect = () => {
      ws = new WebSocket(wsUrl("/fire/ws"))
      ws.onopen = () => setWsOk(true)
      ws.onmessage = (e) => {
        try {
          setSnap(JSON.parse(e.data))
        } catch {
          /* ignore */
        }
      }
      ws.onclose = () => {
        setWsOk(false)
        if (!closed) timer = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws?.close()
    }
    connect()
    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      ws?.close()
    }
  }, [])

  // 1초 시계 (지연·경과 표시용)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // ── 영상 (HLS) ────────────────────────────────────────
  const src = streamUrl || snap?.stream_url || ""
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src || collapsed) return
    setVideoState("loading")
    let retry: ReturnType<typeof setTimeout> | null = null

    const onPlaying = () => setVideoState("playing")
    const onWaiting = () => setVideoState((s) => (s === "playing" ? "loading" : s))
    video.addEventListener("playing", onPlaying)
    video.addEventListener("waiting", onWaiting)

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, maxLiveSyncPlaybackRate: 1.2 })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setVideoState("error")
          hls.destroy()
          hlsRef.current = null
          retry = setTimeout(() => setReloadKey((k) => k + 1), 3000) // 3 s 후 재연결
        }
      })
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src // Safari 네이티브 HLS
      video.play().catch(() => {})
    } else {
      setVideoState("error")
    }

    return () => {
      if (retry) clearTimeout(retry)
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("waiting", onWaiting)
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [src, reloadKey, collapsed])

  // ── 표시 값 ───────────────────────────────────────────
  const msg = snap?.msg ?? null
  const det = snap?.detection ?? null
  const veh = msg?.vehicle ?? {}
  const bat = msg?.battery ?? {}
  const gnss = msg?.gnss ?? {}
  const jetsonMs: number | null = typeof msg?.t_ms === "number" ? msg.t_ms : null
  const dataDelayS = jetsonMs ? (now - jetsonMs) / 1000 : null
  const dataFresh = !!snap?.agent_online && !!snap?.data_online
  // 데이터 연동 여부: 중계 프로그램(fire_agent)이 한 번도 붙지 않았으면 영상 전용 모드
  const dataLinked = !!snap?.agent_online || !!snap?.agent
  const videoOnly = !dataLinked
  const live = videoState === "playing" && (videoOnly || dataFresh)
  const detecting = !!det?.on
  const isFireSource = det?.source === "fire"
  const labelNow = isFireSource ? detectLabel : `${detectLabel}(대체: YOLO)`

  const linkText = !wsOk
    ? "서버 연결 중"
    : videoOnly
      ? "영상 전용 모드 · 기체 데이터 미연동"
      : !snap?.agent_online
        ? "지상 중계 프로그램 연결 안 됨"
        : !snap?.data_online
          ? "기체 데이터 끊김"
          : "수신 정상"

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
      {/* 헤더 */}
      <div
        className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-4 transition-colors hover:bg-slate-100/60"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-orange-500 to-red-500 p-2 shadow-sm">
            <Flame className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">
              Jetson AI 처리 영상 · 탐지 표시는 기체에서 영상에 직접 그림 · {snap?.vehicle_id ?? "기체 미연결"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
              live ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-red-500" : "bg-slate-400"}`} />
            {live ? "LIVE" : "OFFLINE"}
          </span>
          {detecting && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700">
              <Flame className="h-3 w-3" /> {labelNow} 탐지
            </span>
          )}
          {collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {!collapsed && (
        <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
          {/* ── 영상 ── */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900" style={{ aspectRatio: "16 / 9" }}>
            <video ref={videoRef} className="h-full w-full object-contain" muted playsInline autoPlay />

            {/* 영상 위 정보 (싱크가 필요 없는 것만) */}
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
              <span className="rounded-md bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white">
                {jetsonMs ? `EO · Jetson 시각 ${fmtTime(jetsonMs)}` : "EO · AI 처리 영상"}
              </span>
              {dataDelayS !== null && dataFresh && (
                <span className="rounded-md bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white/80">
                  데이터 지연 {dataDelayS.toFixed(1)} s
                </span>
              )}
            </div>
            <div className="pointer-events-none absolute right-3 top-3">
              {dataFresh ? (
                detecting ? (
                  <span className="flex items-center gap-1 rounded-md bg-orange-600/90 px-2 py-1 text-xs font-bold text-white">
                    <Flame className="h-3.5 w-3.5" /> {labelNow} · {(det!.conf * 100).toFixed(0)}%
                  </span>
                ) : (
                  <span className="rounded-md bg-black/55 px-2 py-1 text-xs text-white/90">탐지 대기</span>
                )
              ) : null}
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-0.5 text-[11px] text-white">
              <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-red-500" : "bg-slate-400"}`} />
              {live ? "LIVE" : videoState === "loading" ? "영상 연결 중" : "영상 없음"}
            </div>

            {/* 영상 없을 때 안내 */}
            {videoState !== "playing" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-slate-300">
                {videoState === "loading" ? <Video className="h-8 w-8 animate-pulse" /> : <VideoOff className="h-8 w-8" />}
                <p className="text-sm font-semibold">
                  {!src ? "영상 주소가 설정되지 않았습니다" : videoState === "loading" ? "영상 연결 중..." : "영상을 받을 수 없습니다"}
                </p>
                <p className="max-w-xs text-[11px] text-slate-400">
                  {!src
                    ? "백엔드 FIRE_STREAM_URL 을 설정하세요"
                    : "중계 PC의 MediaMTX·Funnel 실행 여부와 기체 영상 송출을 확인하세요"}
                </p>
                {src && videoState === "error" && (
                  <button
                    type="button"
                    onClick={() => setReloadKey((k) => k + 1)}
                    className="pointer-events-auto mt-1 flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                  >
                    <RefreshCw className="h-3 w-3" /> 다시 연결
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── 우측: 상태 + 이벤트 ── */}
          <div className="flex min-w-0 flex-col gap-3">
            {/* 수신 상태 */}
            <div className={`rounded-xl border px-3 py-2 text-xs ${
              dataFresh
                ? "border-emerald-200/70 bg-emerald-50/60 text-emerald-700"
                : videoOnly
                  ? "border-slate-200/70 bg-slate-50/60 text-slate-500"
                  : "border-amber-200/70 bg-amber-50/60 text-amber-700"
            }`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Radio className="h-3.5 w-3.5" /> {linkText}
                </span>
                {snap?.agent && dataFresh && (
                  <span className="tabular-nums">
                    {snap.agent.hz ?? 0} Hz · 손실 {snap.agent.loss != null ? `${(snap.agent.loss * 100).toFixed(1)}%` : "-"}
                  </span>
                )}
              </div>
            </div>

            {/* AI 탐지 상태 */}
            <div className={`rounded-xl border px-3 py-2.5 ${detecting ? "border-orange-300 bg-orange-50" : "border-slate-200/70 bg-slate-50/60"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">AI 탐지</p>
              <div className="mt-1 flex items-center justify-between">
                <span className={`flex items-center gap-1.5 text-sm font-bold ${detecting ? "text-orange-700" : "text-slate-600"}`}>
                  <Flame className="h-4 w-4" />
                  {videoOnly ? "영상 속 박스로 표시" : !dataFresh ? "데이터 없음" : detecting ? `${labelNow} 탐지 중` : "탐지 대기"}
                </span>
                {dataFresh && detecting && (
                  <span className="rounded-md bg-orange-600 px-2 py-0.5 text-xs font-bold text-white">
                    신뢰도 {(det!.conf * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              {videoOnly && (
                <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  기체 AI 가 탐지한 위치에 박스와 라벨을 영상에 직접 그려 보냅니다.
                  신뢰도 수치·탐지 기록은 기체 데이터 연동 후 표시됩니다.
                </p>
              )}
              {!isFireSource && dataFresh && (
                <p className="mt-1 text-[10px] text-slate-400">
                  화점 모델 결과(detect.fire)가 아직 없어 기체 YOLO 결과를 표시합니다.
                </p>
              )}
            </div>

            {/* 기체 정보 (데이터 연동 시) */}
            {!videoOnly && (<>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/60 px-2.5 py-1.5">
                <Navigation className="h-3.5 w-3.5 text-sky-500" />
                <span className="text-slate-500">고도</span>
                <span className="ml-auto font-semibold tabular-nums">{veh.alt_rel != null ? `${Number(veh.alt_rel).toFixed(1)} m` : "-"}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/60 px-2.5 py-1.5">
                <Battery className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-slate-500">전압</span>
                <span className="ml-auto font-semibold tabular-nums">{bat.voltage_v != null ? `${Number(bat.voltage_v).toFixed(2)} V` : "-"}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/60 px-2.5 py-1.5">
                <Satellite className="h-3.5 w-3.5 text-teal-500" />
                <span className="text-slate-500">GNSS</span>
                <span className="ml-auto font-semibold tabular-nums">
                  {gnss.fix != null ? `${gnss.fix === 6 ? "RTK" : gnss.fix === 5 ? "Float" : gnss.fix >= 3 ? "3D" : "No fix"} · ${gnss.sats ?? "-"}` : "-"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/60 px-2.5 py-1.5">
                <Clock className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-slate-500">단계</span>
                <span className="ml-auto font-semibold">{msg?.phase ? PHASE_LABEL[msg.phase] ?? msg.phase : "-"}</span>
              </div>
            </div>

            {/* 탐지 이벤트 로그 */}
            <div className="min-h-0 flex-1 rounded-xl border border-slate-200/60">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">탐지 기록</span>
                <span className="text-[10px] text-slate-400">{snap?.events.length ?? 0}건</span>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto p-2">
                {(snap?.events ?? []).length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-slate-400">탐지 기록이 없습니다</p>
                ) : (
                  snap!.events.map((ev) => (
                    <div
                      key={ev.id}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${ev.active ? "bg-orange-50 text-orange-800" : "bg-slate-50 text-slate-600"}`}
                    >
                      <Flame className={`h-3.5 w-3.5 shrink-0 ${ev.active ? "animate-pulse text-orange-600" : "text-slate-400"}`} />
                      <span className="font-mono tabular-nums">{fmtTime(ev.start_ms)}</span>
                      <span className="font-semibold">{(ev.conf_max * 100).toFixed(0)}%</span>
                      <span className="text-slate-400">{ev.active ? "진행 중" : `${ev.duration_s}s`}</span>
                      {ev.lat != null && ev.lon != null && (
                        <span className="ml-auto truncate font-mono text-[10px] text-slate-400" title={ev.pos_kind === "detect" ? "탐지 위치 추정" : "탐지 시점 기체 위치"}>
                          {Number(ev.lat).toFixed(5)}, {Number(ev.lon).toFixed(5)}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}