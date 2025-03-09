import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

import { useMutation } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"

import { type ApiError, LoginService } from "../client"
import { isLoggedIn } from "../hooks/useAuth"
import useCustomToast from "../hooks/useCustomToast"
import { emailPattern, ERROR_MESSAGES, handleError } from "@/lib/formUtils"
import { cn } from "@/lib/commonUtils"
import { Typography } from "@/components/Common/Typography"

interface FormData {
  email: string
}

export const Route = createFileRoute("/recover-password")({
  component: RecoverPassword,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

function RecoverPassword() {
  const showToast = useCustomToast()

  const form = useForm<FormData>()

  const recoverPassword = async (data: FormData) => {
    await LoginService.recoverPassword({
      email: data.email,
    })
  }

  const mutation = useMutation({
    mutationFn: recoverPassword,
    onSuccess: () => {
      showToast("비밀번호 재설정 이메일을 전송했습니다.")
      form.reset()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
  })

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    mutation.mutate(data)
  }

  return (
    <main className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm px-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Typography variant="h1" className="border-0 text-center">
              비밀번호 찾기
            </Typography>
            <FormField
              control={form.control}
              name="email"
              rules={{
                required: ERROR_MESSAGES.common.required,
                pattern: emailPattern,
              }}
              render={({ field }) => (
                <FormItem className="mt-2">
                  <div className="flex items-center">
                    <FormLabel className="text-xl">아이디</FormLabel>
                    <FormMessage className="m-1" />
                  </div>
                  <FormControl>
                    <Input
                      type="email"
                      id="email"
                      placeholder="Email 입력"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className={cn(
                "mb-24 mt-6 w-full cursor-pointer",
                form.formState.isSubmitting
                  ? "pointer-events-none opacity-50"
                  : "",
              )}
              disabled={form.formState.isSubmitting}
            >
              인증 메일 발송하기
            </Button>
          </form>
        </Form>
      </div>
    </main>
  )
}
