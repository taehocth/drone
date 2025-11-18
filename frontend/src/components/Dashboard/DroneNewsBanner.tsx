import { useEffect, useState, useRef } from "react"
import { ArrowUp, ArrowDown } from "lucide-react"

interface NewsItem {
  title: string
  url: string
}

export function DroneNewsBanner() {
  const [newsList, setNewsList] = useState<NewsItem[]>([])
  const [index, setIndex] = useState(0)
  const intervalRef = useRef<number | null>(null)

  // ✅ ① FastAPI 백엔드에서 드론 뉴스 가져오기 (자동 최신화)
  const fetchNews = async () => {
    try {
      // 👉 백엔드에서 feedparser로 파싱한 최신 드론 뉴스 (7일 이내)
      const res = await fetch("http://localhost:8000/api/v1/news/drone-news")
      const data = await res.json()

      if (data.articles && data.articles.length > 0) {
        setNewsList(
          data.articles.map((a: any) => ({
            title: a.title,
            url: a.link,
          })),
        )
      } else {
        setNewsList([{ title: "⚠️ 드론 뉴스를 불러올 수 없습니다.", url: "#" }])
      }
    } catch (err) {
      console.error("🚨 뉴스 불러오기 실패:", err)
      setNewsList([
        { title: "⚠️ 네트워크 오류로 뉴스를 불러올 수 없습니다.", url: "#" },
      ])
    }
  }

  useEffect(() => {
    fetchNews()
  }, [])

  // ✅ ② 5초마다 자동으로 뉴스 변경
  useEffect(() => {
    if (newsList.length > 0) {
      intervalRef.current = window.setInterval(() => {
        setIndex((prev) => (prev + 1) % newsList.length)
      }, 5000)
      return () => {
        if (intervalRef.current !== null) clearInterval(intervalRef.current)
      }
    }
  }, [newsList])

  const prev = () => {
    setIndex((prevIdx) => (prevIdx === 0 ? newsList.length - 1 : prevIdx - 1))
  }

  const next = () => {
    setIndex((prevIdx) => (prevIdx + 1) % newsList.length)
  }

  if (newsList.length === 0) return null
  const current = newsList[index]

  // ✅ ③ UI
  return (
    <div className="relative flex w-full items-center justify-between rounded-md bg-gradient-to-r from-blue-50 to-indigo-50 p-2 shadow-sm dark:from-gray-800 dark:to-gray-900">
      <button
        onClick={prev}
        className="p-1 text-gray-600 transition hover:text-blue-600"
        aria-label="이전 뉴스"
      >
        <ArrowUp className="h-4 w-4" />
      </button>

      <a
        href={current.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 truncate text-center text-sm font-medium text-gray-800 hover:underline dark:text-gray-200"
      >
        📰 {current.title}
      </a>

      <button
        onClick={next}
        className="p-1 text-gray-600 transition hover:text-blue-600"
        aria-label="다음 뉴스"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  )
}
