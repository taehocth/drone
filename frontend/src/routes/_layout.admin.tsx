import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"

import { type UserPublic, UsersService } from "../client"
import Navbar from "../components/Common/Navbar"
import { PaginationFooter } from "../components/Common/PaginationFooter"
import { Typography } from "@/components/Common/Typography"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTable } from "@/components/ui/data-table"
import { userColumns } from "@/components/Admin/UserColumns"
import AddUserDialog from "@/components/Admin/AddUserDialog"
import { DashboardBackground } from "@/components/layout/DashboardBackground"

// =======================
// Search Schema
// =======================
const usersSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
})

// =======================
// Route
// =======================
export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  validateSearch: (search) => usersSearchSchema.parse(search ?? {}),
})

const PER_PAGE = 5

function getUsersQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      UsersService.readUsers({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
      }),
    queryKey: ["users", { page }],
  }
}

// =======================
// Page Component
// =======================
function Admin() {
  return (
    <DashboardBackground variant="admin">
      <Navbar>
        <Typography variant="h2" className="mt-4">
          사용자 관리
        </Typography>
      </Navbar>

      <AddUserDialog />
      <UsersTable />
    </DashboardBackground>
  )
}

// =======================
// Table Component
// =======================
function UsersTable() {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])

  // 🔹 search 안전 접근
  const search = Route.useSearch() as { page?: number }
  const page = typeof search.page === "number" ? search.page : 1

  const navigate = Route.useNavigate()

  // 🔹 핵심: reducer 형태 + 타입 우회
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
    data: users,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getUsersQueryOptions({ page }),
    placeholderData: (prev) => prev,
  })

  const hasNextPage = !isPlaceholderData && users?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getUsersQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  return (
    <section className="m-4">
      로그인된 사용자: {currentUser?.full_name ?? "N/A"}
      {isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : (
        <DataTable columns={userColumns} data={users?.data ?? []} />
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
