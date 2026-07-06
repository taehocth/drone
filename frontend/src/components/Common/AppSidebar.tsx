import { Link, useRouterState } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { UserPublic } from "@/client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
          {/* 옅은 섹션 라벨로 구조감 부여 */}
          <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            메뉴
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {filteredItems.map((item) => {
                const isActive = item.url === router.location.pathname
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={[
                        // 공통: 둥근 모서리, 넉넉한 높이, 부드러운 전환
                        "group/menu relative h-11 rounded-xl px-3 transition-all duration-200",
                        // 호버: 살짝 배경 + 오른쪽으로 미세 이동
                        "hover:translate-x-0.5 hover:bg-slate-100/80 dark:hover:bg-slate-800/50",
                        // 선택 상태: 인디고 톤 강조
                        isActive
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                          : "text-slate-600 dark:text-slate-300",
                      ].join(" ")}
                    >
                      <Link to={item.url}>
                        {/* 선택 시 왼쪽 강조 바 */}
                        <span
                          className={[
                            "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-indigo-500 transition-all duration-200",
                            isActive
                              ? "opacity-100"
                              : "opacity-0 group-hover/menu:opacity-40",
                          ].join(" ")}
                        />
                        {/* 아이콘을 둥근 박스에 담아 정돈 */}
                        <span
                          className={[
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors [&>svg]:h-4 [&>svg]:w-4",
                            isActive
                              ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300"
                              : "bg-slate-100/70 text-slate-500 group-hover/menu:bg-white dark:bg-slate-800/60 dark:text-slate-400",
                          ].join(" ")}
                        >
                          <item.icon />
                        </span>
                        <span
                          className={[
                            "text-[15px] transition-colors",
                            isActive ? "font-semibold" : "font-medium",
                          ].join(" ")}
                        >
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
                <SidebarMenuButton className="h-11 rounded-xl transition-colors hover:bg-slate-100/80 dark:hover:bg-slate-800/50">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100/70 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400 [&>svg]:h-4 [&>svg]:w-4">
                    <User2 />
                  </span>
                  <Typography variant="bold">
                    {currentUser?.email && currentUser.email.split("@")[0]}
                  </Typography>
                  <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />
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