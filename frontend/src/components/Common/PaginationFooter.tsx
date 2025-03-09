import { Button } from "../ui/button"

type PaginationFooterProps = {
  hasNextPage?: boolean
  hasPreviousPage?: boolean
  onChangePage: (newPage: number) => void
  page: number
}

export function PaginationFooter({
  hasNextPage,
  hasPreviousPage,
  onChangePage,
  page,
}: PaginationFooterProps) {
  return (
    <div className="flex gap-1 justify-end items-center mt-4">
      <Button
        onClick={() => onChangePage(page - 1)}
        disabled={!hasPreviousPage || page <= 1}
        // isDisabled={!hasPreviousPage || page <= 1}
      >
        Previous
      </Button>
      <span>Page {page}</span>
      <Button onClick={() => onChangePage(page + 1)} disabled={!hasNextPage}>
        Next
      </Button>
    </div>
  )
}
