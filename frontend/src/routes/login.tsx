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
import Logo from "/assets/images/company-logo.svg"

import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import type { Body_login_login_access_token as AccessToken } from "../client"
import useAuth, { isLoggedIn } from "../hooks/useAuth"
import { type SubmitHandler, useForm } from "react-hook-form"
import { ERROR_MESSAGES, emailPattern, passwordRules } from "@/lib/formUtils"
import { cn } from "@/lib/commonUtils"

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

function Login() {
  const { loginMutation, error, resetError } = useAuth()

  const form = useForm<AccessToken>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit: SubmitHandler<AccessToken> = async (data) => {
    // TODO: isSubmitting return 추가 (Shadcn Form 호환되게)
    resetError()

    try {
      await loginMutation.mutateAsync(data)
      if (error) {
        throw new Error("Login failed")
      }
    } catch {
      form.setError("username", { message: "" })
      form.setError("password", {
        message: ERROR_MESSAGES.common.loginFailed,
      })
    }
  }

  return (
    <main className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm px-4">
        <img
          src={Logo}
          alt="HanulDrone logo"
          className="mx-auto h-auto w-auto max-w-64"
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="username"
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
                      type="username"
                      id="username"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              rules={passwordRules()}
              render={({ field }) => (
                <FormItem className="mt-2">
                  <div className="flex items-center">
                    <FormLabel className="text-xl">비밀번호</FormLabel>
                    <FormMessage className="m-1" />
                  </div>
                  <FormControl>
                    <Input
                      type="password"
                      id="password"
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
                "mt-6 w-full cursor-pointer",
                form.formState.isSubmitting
                  ? "pointer-events-none opacity-50"
                  : "",
              )}
              disabled={form.formState.isSubmitting}
            >
              로그인 하기
            </Button>
          </form>
        </Form>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="link">
            <Link to="/recover-password">비밀번호 찾기</Link>
          </Button>
          <Button variant="link">
            <Link to="/signup">회원 가입</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
