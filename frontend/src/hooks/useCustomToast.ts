import { useCallback } from "react"
import { toast } from "sonner"

const useCustomToast = () => {
  const showToast = useCallback(
    (message: string) => {
      toast(message)
    },
    [toast],
  )

  return showToast
}

export default useCustomToast
