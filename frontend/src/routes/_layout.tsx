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
          // min-w-0 flex-1 : 사이드바를 뺀 남은 폭을 전부 사용
          <main className="min-w-0 flex-1 px-4">
            <Outlet />
          </main>
        )}
        {/* UserMenu 는 flex 흐름에서 빼서 우측 상단에 떠 있게 함
            (그러지 않으면 오른쪽에 가로 공간을 차지해 본문 폭이 줄어듦) */}
        <div className="fixed right-4 top-3 z-50">
          <UserMenu />
        </div>
      </SidebarProvider>
    </>
  )
}