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

import { handleError } from "@/lib/formUtils"
import { type ApiError, UsersService } from "../../client"
import useAuth from "../../hooks/useAuth"
import useCustomToast from "../../hooks/useCustomToast"

interface DeleteConfirmationProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DeleteConfirmation = ({
  open,
  onOpenChange,
}: DeleteConfirmationProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const { logout } = useAuth()

  const mutation = useMutation({
    mutationFn: () => UsersService.deleteUserMe(),
    onSuccess: () => {
      showToast("성공", "계정이 성공적으로 삭제되었습니다.")
      logout()
      onOpenChange(false)
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })

  const handleConfirm = () => {
    mutation.mutate()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>정말로 계정을 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            계정의 모든 데이터가 <strong>영구적으로 삭제됩니다.</strong>
            정말로 삭제하시려면 <strong>"확인"</strong>을 클릭하세요. 이 작업은
            되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            취소
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? "삭제 중..." : "확인"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default DeleteConfirmation
