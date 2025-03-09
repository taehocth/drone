import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"

import { type UserPublic, UsersService } from "../client"

// import RowActionsMenu from "@/components/Common/RowActionsMenu"
import Navbar from "../components/Common/Navbar"
import { PaginationFooter } from "../components/Common/PaginationFooter.tsx"
import { Typography } from "@/components/Common/Typography.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { DataTable } from "@/components/ui/data-table.tsx"
import { userColumns } from "@/components/Admin/UserColumns.tsx"
import AddUserDialog from "@/components/Admin/AddUserDialog.tsx"

const usersSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  validateSearch: (search) => usersSearchSchema.parse(search),
})

const PER_PAGE = 5

function getUsersQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      UsersService.readUsers({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["users", { page }],
  }
}

function Admin() {
  return (
    <>
      <Navbar>
        <Typography variant="h2" className="mt-4">
          사용자 관리
        </Typography>
      </Navbar>

      <AddUserDialog />
      <UsersTable />
    </>
  )
}

function UsersTable() {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: { page: number }) => ({ ...prev, page }) })

  const {
    data: users,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getUsersQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
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
      {/* <TableContainer>
        <Table size={{ base: "sm", md: "md" }}>
          <Thead>
            <Tr>
              <Th width="20%">Full name</Th>
              <Th width="50%">Email</Th>
              <Th width="10%">Role</Th>
              <Th width="10%">Status</Th>
              <Th width="10%">Actions</Th>
            </Tr>
          </Thead>
          {isPending ? (
            <Tbody>
              <Tr>
                {new Array(4).fill(null).map((_, index) => (
                  <Td key={index}>
                    <SkeletonText noOfLines={1} paddingBlock="16px" />
                  </Td>
                ))}
              </Tr>
            </Tbody>
          ) : (
            <Tbody>
              {users?.data.map((user) => (
                <Tr key={user.id}>
                  <Td
                    color={!user.full_name ? "ui.dim" : "inherit"}
                    isTruncated
                    maxWidth="150px"
                  >
                    {user.full_name || "N/A"}
                    {currentUser?.id === user.id && (
                      <Badge ml="1" colorScheme="teal">
                        You
                      </Badge>
                    )}
                  </Td>
                  <Td isTruncated maxWidth="150px">
                    {user.email}
                  </Td>
                  <Td>{user.is_superuser ? "Superuser" : "User"}</Td>
                  <Td>
                    <div gap={2}>
                      <div
                        w="2"
                        h="2"
                        borderRadius="50%"
                        bg={user.is_active ? "ui.success" : "ui.danger"}
                        alignSelf="center"
                      />
                      {user.is_active ? "Active" : "Inactive"}
                    </div>
                  </Td>
                  <Td>
                    <RowActionsMenu
                      type="User"
                      value={user}
                      disabled={currentUser?.id === user.id}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          )}
        </Table>
      </TableContainer> */}
      <PaginationFooter
        onChangePage={setPage}
        page={page}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
      />
    </section>
  )
}
