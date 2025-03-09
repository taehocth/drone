import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import UserMenu from "../components/Common/UserMenu"
import useAuth, { isLoggedIn } from "../hooks/useAuth"
import { LoadingSpinner } from "@/components/Common/LoadingSpinner"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/Common/AppSidebar"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
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
          <main className="flex-1 max-w-full px-4">
            <Outlet />
          </main>
        )}
        <UserMenu />
      </SidebarProvider>
    </>
  )
}
