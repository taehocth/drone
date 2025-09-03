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
  Play,
  ClipboardList,
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
    title: "드론 시뮬레이션",
    url: "/simulation",
    icon: Play,
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
