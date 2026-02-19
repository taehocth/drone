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
  MessageSquare,
  Loader2,
  Sparkles,
  Send,
  Trash2,
} from "lucide-react"

interface Message {
  role: "user" | "ai"
  content: string
  timestamp: Date
}

export function GeminiChatCard() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // 메시지 전송
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage = inputMessage.trim()
    setInputMessage("")

    // 사용자 메시지 추가
    const newUserMessage: Message = {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, newUserMessage])

    setIsLoading(true)

    try {
      // API 호출
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"
      const apiUrl = apiBaseUrl.endsWith("/api/v1")
        ? `${apiBaseUrl}/gemini/chat`
        : `${apiBaseUrl}/api/v1/gemini/chat`

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      })

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const data = await res.json()
      const aiResponse = data?.response || "응답을 가져오지 못했습니다."

      // AI 응답 추가
      const newAiMessage: Message = {
        role: "ai",
        content: aiResponse,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, newAiMessage])
    } catch (err: any) {
      console.error("AI 채팅 실패:", err)

      // 에러 메시지 추가
      const errorMessage: Message = {
        role: "ai",
        content: `⚠️ 메시지 전송 실패: ${err.message}`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // 대화 초기화
  const clearChat = () => {
    setMessages([])
    setInputMessage("")
  }

  // Enter 키 핸들러
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <Card className="transition-all hover:shadow-lg">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-800/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-2">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Gemini AI 채팅</CardTitle>
              <CardDescription>
                AI 어시스턴트와 자유롭게 대화하세요
              </CardDescription>
            </div>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              className="text-gray-500 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* 채팅 메시지 영역 */}
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
          {messages.length === 0 ? (
            <div className="py-12 text-center">
              <Sparkles className="mx-auto mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI와 대화를 시작해보세요
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                드론 관련 질문이나 일반적인 질문을 해보세요
              </p>
            </div>
          ) : (
            <div className="max-h-[400px] space-y-3 overflow-y-auto">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg p-3 ${
                    msg.role === "user"
                      ? "ml-8 bg-blue-500 text-white"
                      : "mr-8 bg-white dark:bg-gray-800"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    {msg.role === "user" ? (
                      <MessageSquare className="h-4 w-4" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-purple-500" />
                    )}
                    <span className="text-xs font-semibold">
                      {msg.role === "user" ? "나" : "AI"}
                    </span>
                    <span className="ml-auto text-xs opacity-60">
                      {msg.timestamp.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              ))}

              {/* 로딩 인디케이터 */}
              {isLoading && (
                <div className="mr-8 rounded-lg bg-white p-3 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      AI가 생각 중...
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 입력 영역 */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Textarea
              placeholder="메시지를 입력하세요... (Ctrl/Cmd + Enter로 전송)"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[80px] resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="self-end bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              size="sm"
            >
              {isLoading ? (
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
      </CardContent>
    </Card>
  )
}
