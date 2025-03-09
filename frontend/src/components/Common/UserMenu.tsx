import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { User, FileUser, LogOut } from "lucide-react"

import { Link } from "@tanstack/react-router"

import useAuth from "../../hooks/useAuth"
import { Typography } from "./Typography"

const UserMenu = () => {
  const { logout } = useAuth()

  const handleLogout = async () => {
    logout()
  }

  return (
    <>
      <div className="fixed right-2 top-2 m-2 hidden rounded-full bg-stone-200 px-1.5 py-0.5 md:block">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger>
            <User className="mt-1 size-6" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="m-2 w-40">
            <DropdownMenuLabel>사용자 메뉴</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link to="/settings">
                <div className="flex items-center">
                  <FileUser />
                  <Typography variant="p" className="mt-0! ml-2">
                    내 정보
                  </Typography>
                </div>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <div className="text-destructive flex items-center">
                <LogOut className="stroke-destructive" />
                <Typography variant="p" className="mt-0! ml-2">
                  로그아웃
                </Typography>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}

export default UserMenu
