import { ColumnDef } from "@tanstack/react-table"
import { ItemPublic } from "@/client"

export const itemColumns: ColumnDef<ItemPublic>[] = [
  {
    accessorKey: "id",
    header: "Id",
  },
  {
    accessorKey: "title",
    header: "Title",
  },
  {
    accessorKey: "description",
    header: "Description",
  },
]
