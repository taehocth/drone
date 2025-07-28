import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreVertical, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"

import type { ItemPublic, UserPublic } from "../../client"
import EditUserDialog from "../Admin/EditUserDialog"
import EditItemDialog from "../Items/EditItemDialog"
import DeleteAlert from "./DeleteAlert"

interface RowActionsMenuProps {
  type: string
  value: ItemPublic | UserPublic
  disabled?: boolean
}

const RowActionsMenu = ({ type, value, disabled }: RowActionsMenuProps) => {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {type === "User" ? "사용자" : "아이템"} 수정
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {type === "User" ? "사용자" : "아이템"} 삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {type === "User" ? (
        <EditUserDialog
          user={value as UserPublic}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : (
        <EditItemDialog
          item={value as ItemPublic}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      <DeleteAlert
        type={type}
        id={value.id}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}

export default RowActionsMenu
