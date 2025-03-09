import { ColumnDef } from "@tanstack/react-table"
import { UserPublic } from "@/client"

export const userColumns: ColumnDef<UserPublic>[] = [
  {
    accessorKey: "id",
    header: "Id",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "full_name",
    header: "Full Name",
  },
  {
    accessorKey: "is_superuser",
    header: "관리자 계정",
  },
]
