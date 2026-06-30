import { useEffect, useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { UserPublic } from "@/client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  // SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu"
import { Typography } from "@/components/Common/Typography"

import {
  ChevronUp,
  Home,
  Inbox,
  LogOut,
  PlusCircle,
  Settings,
  User2,
  ClipboardList,
  FileText,
} from "lucide-react"
import Logo from "/assets/images/company-logo.svg"

import useAuth from "@/hooks/useAuth"

// TODO: 따로 config 파일로 뺄 예정
const items = [
  {
    title: "대시보드",
    url: "/",
    icon: Home,
  },
  {
    title: "비행 로그 분석",
    url: "/flight-log",
    icon: FileText,
  },
  {
    title: "비행 체크리스트",
    url: "/checklist",
    icon: ClipboardList,
  },
  {
    title: "기체 추가",
    url: "/items",
    icon: PlusCircle,
  },
  {
    title: "설정",
    url: "/settings",
    icon: Settings,
  },
]

const superuserItems = [{ title: "사용자 관리", url: "/admin", icon: Inbox }]

/* 사이드바 하단 빈 공간을 채우는 차분한 시계 + 은은한 브랜드 요소 */
function SidebarClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const date = now.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  })

  return (
    <div className="mx-2 mt-2 flex flex-col items-center">
      {/* 은은한 드론 라인 비주얼 (옅은 배경) */}
      <div className="relative flex w-full flex-col items-center overflow-hidden rounded-2xl border border-slate-200/50 bg-gradient-to-b from-slate-50/80 to-white px-3 py-5 dark:border-slate-700/40 dark:from-slate-800/30 dark:to-slate-900/20">
        {/* 배경 장식 원 (아주 옅게) */}
        <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-indigo-100/40 blur-xl dark:bg-indigo-900/20" />
        <div className="pointer-events-none absolute -bottom-5 -left-5 h-14 w-14 rounded-full bg-sky-100/40 blur-xl dark:bg-sky-900/20" />

        {/* 실시간 시계 */}
        <div className="relative z-10 flex flex-col items-center">
          <span className="font-mono text-2xl font-semibold tracking-tight text-slate-700 tabular-nums dark:text-slate-200">
            {time}
          </span>
          <span className="mt-0.5 text-[11px] text-slate-400">{date}</span>
        </div>

        {/* 가는 구분선 */}
        <div className="relative z-10 my-3 h-px w-10 bg-slate-200/70 dark:bg-slate-700/60" />

        {/* 미니멀 드론 라인 아이콘 + 한 줄 */}
        <div className="relative z-10 flex flex-col items-center gap-1.5">
          <svg
            viewBox="0 0 48 48"
            className="h-6 w-6 text-indigo-400/70 dark:text-indigo-500/60"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* 드론 본체 */}
            <rect x="20" y="20" width="8" height="8" rx="2" />
            {/* 4개 암 */}
            <line x1="20" y1="20" x2="12" y2="12" />
            <line x1="28" y1="20" x2="36" y2="12" />
            <line x1="20" y1="28" x2="12" y2="36" />
            <line x1="28" y1="28" x2="36" y2="36" />
            {/* 4개 로터 */}
            <circle cx="10" cy="10" r="3" />
            <circle cx="38" cy="10" r="3" />
            <circle cx="10" cy="38" r="3" />
            <circle cx="38" cy="38" r="3" />
          </svg>
          <span className="text-center text-[10px] font-medium leading-tight text-slate-400">
            해상 배송 관제 시스템
          </span>
        </div>
      </div>
    </div>
  )
}

export function AppSidebar() {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])

  const router = useRouterState()

  const { logout } = useAuth()

  const handleLogout = async () => {
    logout()
  }

  const filteredItems = currentUser?.is_superuser
    ? [...items, ...superuserItems]
    : items

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/">
          <img src={Logo} alt="Logo" className="p-2" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {/* <SidebarGroupLabel>Application</SidebarGroupLabel> */}
          <SidebarGroupContent>
            {/* 메뉴 항목 간격(gap-1)과 높이(py-5)를 키워 세로 공백을 자연스럽게 흡수 */}
            <SidebarMenu className="gap-1">
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    // isActive={item.url === window.location.pathname}
                    isActive={item.url === router.location.pathname}
                    className="py-5"
                  >
                    <Link to={item.url}>
                      <item.icon />
                      <span className="text-base">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 빈 공간을 채우는 시계 + 브랜드 비주얼 (mt-auto 로 하단부에 배치) */}
        <div className="mt-auto">
          <SidebarClock />
        </div>
      </SidebarContent>

      <SidebarFooter>
        {/* 하단 공백을 자연스럽게 마감하는 얇은 브랜드 라인 */}
        <div className="mb-1 border-t border-slate-200/60 px-2 pt-2 dark:border-slate-700/60">
          <p className="text-center text-[10px] font-medium tracking-wide text-slate-400">
            HANUL DRONE · 해상 배송 관제
          </p>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <User2 />
                  <Typography variant="bold">
                    {currentUser?.email && currentUser.email.split("@")[0]}
                  </Typography>
                  <ChevronUp className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                // Based on SIDEBAR_WIDTH 12rem
                className="w-48 px-4"
              >
                <DropdownMenuItem>
                  <span>내 정보</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <div className="flex cursor-pointer items-center gap-1 text-rose-400">
                    <LogOut className="size-4" />
                    <Typography className="[&:not(:first-child)]:mt-0">
                      로그아웃
                    </Typography>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}