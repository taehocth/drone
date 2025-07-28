import { useCallback } from "react"
import { toast } from "sonner"

type ToastType = "success" | "error" | "info" | "warning"

const useCustomToast = () => {
  const showToast = useCallback(
    (title: string, description?: string, type: ToastType = "success") => {
      const message = description ? `${title}: ${description}` : title

      switch (type) {
        case "error":
          toast.error(message)
          break
        case "warning":
          toast.warning(message)
          break
        case "info":
          toast.info(message)
          break
        default:
          toast.success(message)
      }
    },
    [],
  )

  return showToast
}

export default useCustomToast
