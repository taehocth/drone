import feedparser
from fastapi import APIRouter
from datetime import datetime
import re
from urllib.parse import urlparse, parse_qs

router = APIRouter()

# 뉴스 캐시 (메모리 캐시)
news_cache = {
    "data": [],
    "last_update": None,
    "update_interval_hours": 12,  # 12시간마다 업데이트
}


@router.get("/drone-news")
def get_drone_news():
    """
    드론 관련 뉴스를 가져옵니다.
    캐시된 데이터가 있고 업데이트 간격이 지나지 않았으면 캐시를 반환합니다.
    """
    current_time = datetime.now()

    # 캐시가 유효하면 그대로 반환
    if (
        news_cache["data"]
        and news_cache["last_update"]
        and (current_time - news_cache["last_update"]).total_seconds()
        < news_cache["update_interval_hours"] * 3600
    ):
        return {
            "articles": news_cache["data"],
            "cached": True,
            "last_update": news_cache["last_update"].isoformat(),
        }

    try:
        # 최근 7일 이내 '드론' 관련 뉴스
        rss_url = "https://news.google.com/rss/search?q=드론+when:7d&hl=ko&gl=KR&ceid=KR:ko"
        feed = feedparser.parse(rss_url)

        articles = []
        for entry in feed.entries[:10]:
            # ✅ 제목 인코딩 문제 해결
            title = entry.title
            try:
                if "ï" in title or "ë" in title or "ì" in title:
                    title = title.encode("latin1").decode("utf-8", "ignore")
            except Exception:
                pass

            # 기본 링크
            link = entry.link

            # Google 뉴스 중간링크 → 실제 뉴스 링크 정제
            if hasattr(entry, "id") and entry.id.startswith("http") and "news.google.com" not in entry.id:
                link = entry.id
            elif hasattr(entry, "links") and entry.links:
                for link_item in entry.links:
                    href = link_item.get("href", "")
                    if href and "news.google.com" not in href and href.startswith("http"):
                        link = href
                        break
            if "news.google.com" in link and hasattr(entry, "summary"):
                url_pattern = r"https?://[^\s<>\"']+"
                urls = re.findall(url_pattern, entry.summary)
                for url in urls:
                    if "news.google.com" not in url:
                        link = url
                        break
            if "news.google.com" in link:
                try:
                    parsed = urlparse(link)
                    params = parse_qs(parsed.query)
                    if "url" in params:
                        link = params["url"][0]
                except Exception:
                    pass

            articles.append({"title": title.strip(), "link": link})

        # 캐시 업데이트
        news_cache["data"] = articles
        news_cache["last_update"] = current_time

        return {
            "articles": articles,
            "cached": False,
            "last_update": current_time.isoformat(),
        }

    except Exception as e:
        # 에러 시 캐시 반환
        if news_cache["data"]:
            return {
                "articles": news_cache["data"],
                "cached": True,
                "error": str(e),
                "last_update": news_cache["last_update"].isoformat(),
            }
        return {"articles": [], "cached": False, "error": str(e)}
