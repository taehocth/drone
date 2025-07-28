import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ItemsService, UsersService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"

interface DeleteAlertProps {
  type: string
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DeleteAlert = ({ type, id, open, onOpenChange }: DeleteAlertProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()

  const deleteEntity = async (id: string) => {
    if (type === "Item") {
      await ItemsService.deleteItem({ id: id })
    } else if (type === "User") {
      await UsersService.deleteUser({ userId: id })
    } else {
      throw new Error(`Unexpected type: ${type}`)
    }
  }

  const mutation = useMutation({
    mutationFn: deleteEntity,
    onSuccess: () => {
      showToast(
        "성공",
        `${type === "Item" ? "아이템" : "사용자"}가 성공적으로 삭제되었습니다.`,
      )
      onOpenChange(false)
    },
    onError: () => {
      showToast(
        "오류 발생",
        `${type === "Item" ? "아이템" : "사용자"} 삭제 중 오류가 발생했습니다.`,
        "error",
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [type === "Item" ? "items" : "users"],
      })
    },
  })

  const handleDelete = () => {
    mutation.mutate(id)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {type === "Item" ? "아이템" : "사용자"} 삭제
          </AlertDialogTitle>
          <AlertDialogDescription>
            {type === "User" && (
              <span className="mb-2 block">
                이 사용자와 연결된 모든 아이템도{" "}
                <strong>영구적으로 삭제됩니다.</strong>
              </span>
            )}
            정말로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            취소
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? "삭제 중..." : "삭제"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default DeleteAlert
