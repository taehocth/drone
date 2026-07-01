import { useState } from "react"

import { LogCBMStatusCard } from "@/components/Dashboard/LogCBMStatusCard"
import {
  AnalysisResult,
  FlightReviewAnalyzerCard,
} from "@/components/Dashboard/FlightReviewAnalyzerCard"
import { Activity, TrendingUp } from "lucide-react"

export function FlightLogDashboard() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  )

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              비행 로그 분석
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              드론 비행 로그 분석 및 상태 기반 정비 시스템
            </p>
          </div>
        </div>
      </div>

      {/* ✅ CBM 상태 기반 정비 섹션 */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-500 p-2">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            AI 기체 상태 진단
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              업로드한 PX4 로그 데이터를 기반으로 주요 시스템 상태를 평가합니다.
            </p>
          </div>
        </div>
        <LogCBMStatusCard analysis={analysisResult} />
      </div>

      {/* 🧠 PX4 비행 로그 분석 섹션 */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-indigo-600 p-2">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              PX4 비행 로그 분석
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              CSV / ULG 로그 파일 업로드 기반 자동 분석 리포트 (Flight Review
              스타일)
            </p>
          </div>
        </div>

        {/* ✅ 통합된 PX4 로그 분석기 */}
        <div className="rounded-xl border bg-white shadow-sm transition-all duration-300 hover:shadow-md dark:bg-gray-900">
          <FlightReviewAnalyzerCard onAnalysisChange={setAnalysisResult} />
        </div>
      </div>
    </div>
  )
}
