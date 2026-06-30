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
  ShieldCheck,
  Cpu,
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
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    // isActive={item.url === window.location.pathname}
                    isActive={item.url === router.location.pathname}
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

        {/* ── 메뉴와 푸터 사이 빈 공간 채우기: 시스템 상태 요약 ── */}
        {/* mt-auto 로 아래로 밀어 메뉴 직후가 아닌 하단부에 배치 */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <div className="mx-2 space-y-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-white p-3.5 shadow-sm dark:border-slate-700/60 dark:from-slate-800/40 dark:to-slate-900/40">
              {/* 헤더 */}
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </span>
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    시스템 상태
                  </p>
                  <p className="text-[10px] text-slate-400">관제 시스템 정상</p>
                </div>
              </div>

              {/* 상태 항목들 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    텔레메트리
                  </span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    수신 중
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <Cpu className="h-3 w-3" />
                    AI 이상탐지
                  </span>
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">
                    CNN-LSTM
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    관제 기체
                  </span>
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    4대 운용
                  </span>
                </div>
              </div>

              {/* 브랜드 표기 */}
              <div className="border-t border-slate-200/60 pt-2.5 dark:border-slate-700/60">
                <p className="text-center text-[10px] font-medium tracking-wide text-slate-400">
                  HANUL DRONE · 해상 배송 관제
                </p>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
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