import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"

import { Skeleton } from "@/components/ui/skeleton"
import { ItemsService } from "../client"
import Navbar from "@/components/Common/Navbar"
import AddItemDialog from "@/components/Items/AddItemDialog"
import { PaginationFooter } from "@/components/Common/PaginationFooter"
import { Typography } from "@/components/Common/Typography"
import { DataTable } from "@/components/ui/data-table"
import { itemColumns } from "@/components/Items/ItemColumns"

// =======================
// Search Schema
// =======================
const itemsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
})

// =======================
// Route
// =======================
export const Route = createFileRoute("/_layout/items")({
  component: Items,
  validateSearch: (search) => itemsSearchSchema.parse(search ?? {}),
})

const PER_PAGE = 5

function getItemsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      ItemsService.readItems({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
      }),
    queryKey: ["items", { page }],
  }
}

// =======================
// Page Component
// =======================
function Items() {
  return (
    <>
      <Navbar>
        <Typography variant="h2" className="mt-4">
          기체 관리
        </Typography>
      </Navbar>

      <AddItemDialog />
      <ItemsTable />
    </>
  )
}

// =======================
// Table Component
// =======================
function ItemsTable() {
  const queryClient = useQueryClient()

  // 🔹 search 안전 접근
  const search = Route.useSearch() as { page?: number }
  const page = typeof search.page === "number" ? search.page : 1

  const navigate = Route.useNavigate()

  // 🔹 핵심: reducer + 타입 우회 (admin과 동일)
  const setPage = (page: number) => {
    navigate({
      search: ((prev: any) => ({
        ...(prev ?? {}),
        page,
      })) as any,
      replace: true,
    } as any)
  }

  const {
    data: items,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getItemsQueryOptions({ page }),
    placeholderData: (prev) => prev,
  })

  const hasNextPage = !isPlaceholderData && items?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getItemsQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  return (
    <section className="m-4">
      {isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : (
        <DataTable columns={itemColumns} data={items?.data ?? []} />
      )}

      <PaginationFooter
        page={page}
        onChangePage={setPage}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
      />
    </section>
  )
}
