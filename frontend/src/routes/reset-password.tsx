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
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"

import { type ApiError, LoginService, type NewPassword } from "../client"
import { isLoggedIn } from "../hooks/useAuth"
import useCustomToast from "../hooks/useCustomToast"
import {
  confirmPasswordRules,
  handleError,
  passwordRules,
} from "@/lib/formUtils"
import { cn } from "@/lib/commonUtils"
import { Typography } from "@/components/Common/Typography"

interface NewPasswordForm extends NewPassword {
  confirm_password: string
}

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

function ResetPassword() {
  const showToast = useCustomToast()
  const navigate = useNavigate()
  // const {
  //   register,
  //   handleSubmit,
  //   getValues,
  //   reset,
  //   formState: { errors },
  // } = useForm<NewPasswordForm>({
  //   mode: "onBlur",
  //   criteriaMode: "all",
  //   defaultValues: {
  //     new_password: "",
  //   },
  // })
  const form = useForm<NewPasswordForm>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      new_password: "",
    },
  })

  const resetPassword = async (data: NewPassword) => {
    const token = new URLSearchParams(window.location.search).get("token")
    if (!token) return
    await LoginService.resetPassword({
      requestBody: { new_password: data.new_password, token: token },
    })
  }

  const mutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      showToast("비밀번호 재설정에 성공 하였습니다!")
      form.reset()
      navigate({ to: "/login" })
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
  })

  const onSubmit: SubmitHandler<NewPasswordForm> = async (data) => {
    mutation.mutate(data)
  }

  return (
    <main className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm px-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Typography variant="h1" className="border-0 text-center">
              비밀번호 재설정
            </Typography>
            <FormField
              control={form.control}
              name="new_password"
              rules={passwordRules()}
              render={({ field }) => (
                <FormItem className="mt-2">
                  <div className="flex items-center">
                    <FormLabel className="text-xl">새로운 비밀번호</FormLabel>
                    <FormMessage className="m-1" />
                  </div>
                  <FormControl>
                    <Input
                      type="password"
                      id="password"
                      placeholder="비밀번호 입력"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm_password"
              rules={confirmPasswordRules(form.getValues)}
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormControl>
                    <Input
                      type="password"
                      id="password"
                      placeholder="비밀번호 입력 확인"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage className="ml-2" />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className={cn(
                "mb-11 w-full cursor-pointer",
                form.formState.isSubmitting
                  ? "pointer-events-none opacity-50"
                  : "",
              )}
              disabled={form.formState.isSubmitting}
            >
              재설정 하기
            </Button>
          </form>
        </Form>
      </div>
    </main>
  )
}

// return (
//   <div
//     as="form"
//     onSubmit={handleSubmit(onSubmit)}
//     h="100vh"
//     maxW="sm"
//     alignItems="stretch"
//     justifyContent="center"
//     gap={4}
//     centerContent
//   >
//     <h2 size="xl" color="ui.main" textAlign="center" mb={2}>
//       Reset Password
//     </h2>
//     <Text textAlign="center">
//       Please enter your new password and confirm it to reset your password.
//     </Text>
//     <FormControl mt={4} isInvalid={!!errors.new_password}>
//       <FormLabel htmlFor="password">Set Password</FormLabel>
//       <Input
//         id="password"
//         {...register("new_password", passwordRules())}
//         placeholder="Password"
//         type="password"
//       />
//       {errors.new_password && (
//         <FormErrorMessage>{errors.new_password.message}</FormErrorMessage>
//       )}
//     </FormControl>
//     <FormControl mt={4} isInvalid={!!errors.confirm_password}>
//       <FormLabel htmlFor="confirm_password">Confirm Password</FormLabel>
//       <Input
//         id="confirm_password"
//         {...register("confirm_password", confirmPasswordRules(getValues))}
//         placeholder="Password"
//         type="password"
//       />
//       {errors.confirm_password && (
//         <FormErrorMessage>{errors.confirm_password.message}</FormErrorMessage>
//       )}
//     </FormControl>
//     <Button variant="primary" type="submit">
//       Reset Password
//     </Button>
//   </div>
// )
