import { useState } from "react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Upload,
  Brain,
  FileChartColumn,
  Loader2,
  Sparkles,
  Send,
  MessageSquare,
  GraduationCap,
  User,
  Users,
} from "lucide-react"
import Papa from "papaparse"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { NaverMap } from "@/components/Map/NaverMap"

type ExplanationLevel = "beginner" | "normal" | "expert"

interface ParsedLog {
  time: number
  altitude: number
  speed: number
  battery: number
}

export interface AnalysisResult {
  totalTimeMinutes: number
  maxAltitude: number
  avgSpeed: number
  batteryDrop: number
  rapidDescentDetected: boolean
  esc_temp_max?: number

  extra?: {
    // Battery
    battery_avg_voltage?: number
    battery_peak_current?: number
    battery_min_voltage?: number
    battery_voltage_ripple?: number
    battery_avg_current?: number
    battery_temp?: number

    // ESC
    esc_avg_output?: number
    esc_max_output?: number
    esc_output_std?: number
    esc_imbalance_index?: number
    esc_avg_rpm?: number

    // ⭐ 여기 추가해야 함
    esc_rpm_avg?: number[] // ESC RPM 배열
    esc_temp_max?: number[] // ESC 온도 배열

    // FCC
    fcc_roll_std?: number
    fcc_pitch_std?: number
    fcc_yaw_std?: number
    vibration_accel?: number
    imu_clips?: number
    max_attitude_deg?: number

    // GNSS
    gnss_avg_sat?: number
    gnss_hdop?: number
    gnss_fix_type?: number
    gnss_alt_std?: number
    gnss_signal_loss_count?: number

    // Flight Summary
    max_ground_speed?: number
    max_altitude?: number
    max_climb_rate?: number
    max_descent_rate?: number
    landing_impact?: number

    path?: {
      lat: number
      lng: number
      alt?: number
      time?: number
      }[]
  }
}
type FlightReviewAnalyzerCardProps = {
  onAnalysisChange?: (result: AnalysisResult | null) => void
}

export function FlightReviewAnalyzerCard({
  onAnalysisChange,
}: FlightReviewAnalyzerCardProps = {}) {
  const [data, setData] = useState<ParsedLog[]>([])
  const [summary, setSummary] = useState<string>("")
  const [aiSummary, setAiSummary] = useState<string>("")
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [fileName, setFileName] = useState<string>("")
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  )

  // 대화형 AI 기능
  const [explanationLevel, setExplanationLevel] =
    useState<ExplanationLevel>("normal")
  const [question, setQuestion] = useState<string>("")
  const [isAskingQuestion, setIsAskingQuestion] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: "user" | "ai"; content: string }>
  >([])
  const [showAiDialog, setShowAiDialog] = useState(false)
  const [pendingAiRequest, setPendingAiRequest] =
    useState<AnalysisResult | null>(null)

  // 📁 파일 업로드 핸들러
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSummary("")
    setAiSummary("")
    setIsLoadingAI(false)
    setQuestion("")
    setConversationHistory([])
    setAnalysisResult(null)
    setShowAiDialog(false)
    setPendingAiRequest(null)
    onAnalysisChange?.(null)

    if (file.name.endsWith(".ulg")) {
      await parseUlgFile(file)
    } else if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
      parseCsvFile(file)
    } else {
      setSummary(
        "지원하지 않는 파일 형식입니다. CSV 또는 ULG 파일을 업로드해주세요.",
      )
    }
  }

  // 📊 CSV 파싱
  const parseCsvFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result: Papa.ParseResult<any>) => {
        if (!result.data || result.data.length === 0) {
          setSummary("CSV 파일이 비어 있거나 잘못된 형식입니다.")
          onAnalysisChange?.(null)
          return
        }
        const parsed: ParsedLog[] = result.data.map((row: any) => ({
          time: parseFloat(row.TimeUS) / 1_000_000 || 0,
          altitude: parseFloat(row.Alt || row.altitude || 0),
          speed: parseFloat(row.GroundSpeed || row.speed || 0),
          battery: parseFloat(row.Battery || row.battery || 0),
        }))
        setData(parsed)
        generateSummary(parsed)
      },
      error: (err) => {
        console.error(err)
        setSummary("CSV 파일을 읽는 중 오류가 발생했습니다.")
        onAnalysisChange?.(null)
      },
    })
  }

  // 🧩 ULG 파일 파싱 (백엔드 연동)
  const parseUlgFile = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append("file", file)

      // 환경 변수 또는 기본값 사용 (개발 환경: localhost:8000, 프로덕션: api.localhost)
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"
      const apiUrl = apiBaseUrl.endsWith("/api/v1") 
        ? `${apiBaseUrl}/logs/analyze`
        : `${apiBaseUrl}/api/v1/logs/analyze`
      
      const res = await fetch(apiUrl, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        setSummary(`ULG 파일 업로드 실패 (${res.status} ${res.statusText})`)
        onAnalysisChange?.(null)
        return
      }

      const result = await res.json().catch(() => ({}))
      if (!result || !result.data) {
        setSummary(result.error || "ULG 파일 처리 실패 (서버 응답 오류)")
        onAnalysisChange?.(null)
        return
      }

      const parsed = Array.isArray(result.data)
        ? result.data.map((row: any) => ({
            time: row.time || 0,
            altitude: row.altitude || 0,
            speed: row.speed || 0,
            battery: row.battery ?? 0,
          }))
        : []

      if (parsed.length === 0) {
        setSummary("ULG 파일에서 데이터를 추출하지 못했습니다.")
        onAnalysisChange?.(null)
        return
      }

      setData(parsed)
      // ✅ 백엔드 summary 함께 전달
      generateSummary(parsed, result.summary ?? {})
    } catch (err) {
      console.error(err)
      setSummary("ULG 파일 처리 실패 (서버 연결 오류)")
      onAnalysisChange?.(null)
    }
  }

  // 🤖 로그 자동 분석
  const generateSummary = (data: ParsedLog[], extraSummary: any = {}) => {
    if (!data || data.length === 0) {
      setSummary("로그 데이터가 비어 있습니다.")
      onAnalysisChange?.(null)
      return
    }

    const totalTime = (data[data.length - 1].time - data[0].time) / 60
    const maxAlt = Math.max(...data.map((d) => d.altitude))
    const avgSpeed =
      data.reduce((sum, d) => sum + d.speed, 0) / data.length || 0

    // ⚙️ 비행 중(상승~하강) 구간만 추출하여 배터리 계산
    const startIdx = Math.floor(data.length * 0.05)
    const endIdx = Math.floor(data.length * 0.95)
    const activeData = data.slice(startIdx, endIdx)

    const startAvg =
      activeData
        .slice(0, Math.min(100, activeData.length))
        .reduce((sum, d) => sum + d.battery, 0) /
      Math.min(100, activeData.length)

    const endAvg =
      activeData
        .slice(-Math.min(100, activeData.length))
        .reduce((sum, d) => sum + d.battery, 0) /
      Math.min(100, activeData.length)

    const batteryDrop = startAvg - endAvg

    let summaryText = `총 비행 시간은 약 ${totalTime.toFixed(
      1,
    )}분이며, 최고 고도는 ${maxAlt.toFixed(
      1,
    )}m, 평균 속도는 ${avgSpeed.toFixed(1)}m/s였습니다.`

    if (batteryDrop > 3)
      summaryText += ` 배터리 소모율이 ${batteryDrop.toFixed(1)}%로 확인되었습니다.`
    if (maxAlt > 120)
      summaryText += ` 비행 고도가 120m 이상으로, 비가시권(BVLOS) 가능성이 있습니다.`

    const rapidDesc = data.some(
      (d, i, arr) => i > 0 && arr[i - 1].altitude - d.altitude > 40,
    )
    if (rapidDesc) summaryText += ` 급하강 구간이 감지되었습니다.`

    setSummary(summaryText)
    setAiSummary("") // AI 요약 초기화
    const result: AnalysisResult = {
      totalTimeMinutes: totalTime,
      maxAltitude: maxAlt,
      avgSpeed,
      batteryDrop,
      rapidDescentDetected: rapidDesc,
      extra: extraSummary, // ✅ 여기에 올바르게 저장
    }
    setAnalysisResult(result)
    onAnalysisChange?.(result)

    // AI 사용 여부 다이얼로그 표시
    setPendingAiRequest(result)
    setShowAiDialog(true)
  }

  // 🧠 AI 요약 요청 함수
  const requestAiSummary = async (result: AnalysisResult) => {
    setIsLoadingAI(true)
    setAiSummary("") // 초기화
    setConversationHistory([]) // 대화 히스토리 초기화

    try {
      // 환경 변수 또는 기본값 사용 (개발 환경: localhost:8000, 프로덕션: api.localhost)
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"
      const apiUrl = apiBaseUrl.endsWith("/api/v1") 
        ? `${apiBaseUrl}/gemini/cbm/ai-summary`
        : `${apiBaseUrl}/api/v1/gemini/cbm/ai-summary`
      
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: result, level: explanationLevel }),
      })

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const data = await res.json()
      console.log("🧠 AI 응답 전체:", data)
      const aiText =
        data?.summary || data?.detail || "AI 해석을 가져오지 못했습니다."
      console.log("🧠 AI 요약 텍스트:", aiText)
      setAiSummary(aiText)
      // 대화 히스토리에 초기 응답 추가
      setConversationHistory([
        {
          role: "ai",
          content: aiText,
        },
      ])
    } catch (err: any) {
      console.error("AI 요약 실패:", err)
      setAiSummary(`⚠️ AI 해석 실패: ${err.message}`)
    } finally {
      setIsLoadingAI(false)
    }
  }

  // AI 다이얼로그에서 "사용" 버튼 클릭 시
  const handleUseAi = () => {
    setShowAiDialog(false)
    if (pendingAiRequest) {
      requestAiSummary(pendingAiRequest)
    }
    setPendingAiRequest(null)
  }

  // AI 다이얼로그에서 "사용 안 함" 버튼 클릭 시
  const handleSkipAi = () => {
    setShowAiDialog(false)
    setPendingAiRequest(null)
  }

  // 💬 추가 질문 요청
  const askQuestion = async () => {
    if (!question.trim() || !analysisResult) return

    const userQuestion = question.trim()
    setIsAskingQuestion(true)
    setQuestion("") // 입력 필드 초기화

    // 대화 히스토리에 사용자 질문 추가
    const updatedHistory = [
      ...conversationHistory,
      { role: "user" as const, content: userQuestion },
    ]
    setConversationHistory(updatedHistory)

    try {
      // 환경 변수 또는 기본값 사용 (개발 환경: localhost:8000, 프로덕션: api.localhost)
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"
      const apiUrl = apiBaseUrl.endsWith("/api/v1") 
        ? `${apiBaseUrl}/gemini/cbm/ask-question`
        : `${apiBaseUrl}/api/v1/gemini/cbm/ask-question`
      
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisData: analysisResult,
          question: userQuestion,
          level: explanationLevel,
          history: conversationHistory,
        }),
      })

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const data = await res.json()
      const answer =
        data?.answer || data?.summary || "답변을 가져오지 못했습니다."

      // 대화 히스토리에 AI 답변 추가
      setConversationHistory([
        ...updatedHistory,
        { role: "ai", content: answer },
      ])
    } catch (err: any) {
      console.error("질문 실패:", err)
      setConversationHistory([
        ...updatedHistory,
        { role: "ai", content: `⚠️ 질문 처리 실패: ${err.message}` },
      ])
    } finally {
      setIsAskingQuestion(false)
    }
  }

  // 📚 설명 레벨 변경 시 재요청
  const handleLevelChange = (level: ExplanationLevel) => {
    if (level === explanationLevel || !analysisResult) return
    setExplanationLevel(level)
    // 레벨 변경 시 자동으로 재요청
    if (analysisResult) {
      setIsLoadingAI(true)
      // 환경 변수 또는 기본값 사용 (개발 환경: localhost:8000, 프로덕션: api.localhost)
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"
      const apiUrl = apiBaseUrl.endsWith("/api/v1") 
        ? `${apiBaseUrl}/gemini/cbm/ai-summary`
        : `${apiBaseUrl}/api/v1/gemini/cbm/ai-summary`
      
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: analysisResult, level }),
      })
        .then((res) => res.json())
        .then((data) => {
          const aiText =
            data?.summary || data?.detail || "AI 해석을 가져오지 못했습니다."
          setAiSummary(aiText)
          setConversationHistory([{ role: "ai", content: aiText }])
        })
        .catch((err) => {
          console.error("레벨 변경 후 재요청 실패:", err)
        })
        .finally(() => {
          setIsLoadingAI(false)
        })
    }
  }

  return (
    <Card className="transition-all hover:shadow-lg">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-800/20">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-indigo-500 p-2">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle>PX4 비행 로그 분석기</CardTitle>
            <CardDescription>
              CSV 및 ULG 로그 업로드 기반 자동 분석 (Flight Review 스타일)
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gray-300 p-4 hover:bg-gray-50 dark:hover:bg-gray-800">
          <Upload className="h-5 w-5 text-gray-500" />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {fileName ? `${fileName} 업로드 완료` : "CSV 또는 ULG 로그 업로드"}
          </span>
          <input
            type="file"
            accept=".csv,.txt,.ulg"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {/* 기본 분석 결과 */}
        {summary && (
          <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-blue-800 dark:from-blue-950/30 dark:to-indigo-950/30">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-500 p-2">
                <FileChartColumn className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                  📊 기본 분석 결과
                </h3>
                <p className="text-base leading-relaxed text-gray-700 dark:text-gray-300">
                  {summary}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* AI 해석 섹션 */}
        {(isLoadingAI || aiSummary || conversationHistory.length > 0) && (
          <div className="rounded-lg border-2 border-purple-200 bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 p-5 shadow-md dark:border-purple-800 dark:from-purple-950/40 dark:via-pink-950/20 dark:to-indigo-950/40">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-2.5 shadow-lg">
                {isLoadingAI || isAskingQuestion ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Sparkles className="h-5 w-5 text-white" />
                )}
              </div>
              <div className="flex-1 space-y-4">
                {/* 헤더 및 설명 레벨 선택 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      🧠 AI 해석
                    </h3>
                    {(isLoadingAI || isAskingQuestion) && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {isLoadingAI ? "분석 중..." : "답변 중..."}
                      </span>
                    )}
                  </div>

                  {/* 설명 레벨 선택 버튼 */}
                  {!isLoadingAI && analysisResult && (
                    <div className="flex gap-1 rounded-lg bg-white/50 p-1 dark:bg-gray-800/50">
                      <Button
                        variant={
                          explanationLevel === "beginner" ? "default" : "ghost"
                        }
                        size="sm"
                        onClick={() => handleLevelChange("beginner")}
                        className="h-8 text-xs"
                        title="초보자용 설명"
                      >
                        <GraduationCap className="mr-1 h-3 w-3" />
                        초보자
                      </Button>
                      <Button
                        variant={
                          explanationLevel === "normal" ? "default" : "ghost"
                        }
                        size="sm"
                        onClick={() => handleLevelChange("normal")}
                        className="h-8 text-xs"
                        title="일반 설명"
                      >
                        <Users className="mr-1 h-3 w-3" />
                        일반
                      </Button>
                      <Button
                        variant={
                          explanationLevel === "expert" ? "default" : "ghost"
                        }
                        size="sm"
                        onClick={() => handleLevelChange("expert")}
                        className="h-8 text-xs"
                        title="전문가용 설명"
                      >
                        <User className="mr-1 h-3 w-3" />
                        전문가
                      </Button>
                    </div>
                  )}
                </div>

                {/* 로딩 상태 */}
                {isLoadingAI ? (
                  <div className="space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-purple-200 dark:bg-purple-800"></div>
                    <div className="h-4 w-full animate-pulse rounded bg-purple-200 dark:bg-purple-800"></div>
                    <div className="h-4 w-5/6 animate-pulse rounded bg-purple-200 dark:bg-purple-800"></div>
                  </div>
                ) : (
                  <>
                    {/* 대화 히스토리 표시 */}
                    <div className="space-y-3">
                      {conversationHistory.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg p-3 ${
                            msg.role === "user"
                              ? "ml-8 bg-blue-100 dark:bg-blue-900/30"
                              : "mr-8 bg-white/80 dark:bg-gray-800/80"
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            {msg.role === "user" ? (
                              <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            )}
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                              {msg.role === "user" ? "질문" : "AI 답변"}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                            {msg.content}
                          </p>
                        </div>
                      ))}

                      {/* 초기 AI 요약 (대화 히스토리가 없을 때) */}
                      {conversationHistory.length === 0 && aiSummary && (
                        <div className="rounded-lg bg-white/80 p-3 dark:bg-gray-800/80">
                          <div className="mb-1 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                              AI 해석
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                            {aiSummary}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 질문 입력 섹션 */}
                    {analysisResult && (
                      <div className="space-y-2 border-t border-purple-200 pt-4 dark:border-purple-800">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            추가 질문하기
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <Textarea
                            placeholder="예: 배터리 상태가 정상인가요? ESC 온도가 높은 이유는?"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => {
                              if (
                                e.key === "Enter" &&
                                (e.metaKey || e.ctrlKey)
                              ) {
                                askQuestion()
                              }
                            }}
                            className="min-h-[80px] resize-none text-sm"
                            disabled={isAskingQuestion}
                          />
                          <Button
                            onClick={askQuestion}
                            disabled={!question.trim() || isAskingQuestion}
                            className="self-end"
                            size="sm"
                          >
                            {isAskingQuestion ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          💡 Ctrl/Cmd + Enter로 빠르게 전송할 수 있습니다
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 비행 경로 지도 */}
        {analysisResult?.extra?.path && analysisResult.extra.path.length > 0 && (
          <div className="rounded-lg border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-5 shadow-md dark:border-green-800 dark:from-green-950/40 dark:to-emerald-950/40">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-full bg-gradient-to-br from-green-500 to-emerald-500 p-2.5 shadow-lg">
                <FileChartColumn className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                🗺️ 비행 경로
              </h3>
            </div>
            <div className="h-[400px] w-full overflow-hidden rounded-lg border border-gray-300 shadow-sm">
              <NaverMap flightPath={analysisResult.extra.path} />
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              💡 총 {analysisResult.extra.path.length}개의 GPS 포인트가 기록되었습니다.
            </p>
          </div>
        )}

        {/* AI 사용 여부 확인 다이얼로그 */}
        <AlertDialog
          open={showAiDialog}
          onOpenChange={(open) => {
            if (!open) {
              // 다이얼로그가 닫힐 때 (X 버튼, ESC, 외부 클릭 등)
              handleSkipAi()
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-2">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <AlertDialogTitle>AI 분석 기능 사용</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="pt-2">
                <p className="mb-2">
                  로그 분석이 완료되었습니다. AI 해석 기능을 사용하시겠습니까?
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  💡 AI 기능은 API 사용량이 소모됩니다. 필요할 때만 사용하는
                  것을 권장합니다.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleSkipAi}>
                사용 안 함
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleUseAi}>
                AI 분석 사용
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
