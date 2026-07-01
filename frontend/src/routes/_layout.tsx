import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import UserMenu from "../components/Common/UserMenu"
import useAuth, { isLoggedIn } from "../hooks/useAuth"
import { LoadingSpinner } from "@/components/Common/LoadingSpinner"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/Common/AppSidebar"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  // 🔓 로그인 비활성화: 더 이상 /login 으로 리다이렉트 하지 않음
  // beforeLoad: async () => {
  //   if (!isLoggedIn()) {
  //     throw redirect({
  //       to: "/login",
  //     })
  //   }
  // },
})

function Layout() {
  const { isLoading } = useAuth()

  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarTrigger />
        {isLoading ? (
          <div className="flex justify-center items-center h-screen w-full">
            <LoadingSpinner />
          </div>
        ) : (
          // min-w-0 : flex 자식이 콘텐츠 때문에 줄어들지 않는 문제 방지
          // w-full  : 사이드바를 제외한 남은 폭을 전부 사용
          <main className="min-w-0 flex-1 w-full px-4">
            <Outlet />
          </main>
        )}
        <UserMenu />
      </SidebarProvider>
    </>
  )
}