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
import { type SubmitHandler, useForm } from "react-hook-form"
import type { UserRegister } from "../client"
import useAuth, { isLoggedIn } from "../hooks/useAuth"
import {
  confirmPasswordRules,
  emailPattern,
  ERROR_MESSAGES,
  namePattern,
  passwordRules,
} from "@/lib/formUtils"
import { cn } from "@/lib/commonUtils"

export const Route = createFileRoute("/signup")({
  component: SignUp,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

interface UserRegisterForm extends UserRegister {
  confirm_password: string
}

function SignUp() {
  const { signUpMutation } = useAuth()

  const form = useForm<UserRegisterForm>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      confirm_password: "",
    },
  })

  // ✅ confirm_password는 제외하고 API 호출
  const onSubmit: SubmitHandler<UserRegisterForm> = (data) => {
    const { confirm_password, ...payload } = data
    signUpMutation.mutate(payload) // payload = { email, full_name, password }
  }

  return (
    <main className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm px-4">
        <Link to="/login">
          <img
            src={Logo}
            alt="HanulDrone logo"
            className="mx-auto mt-[100px] h-auto w-auto max-w-64"
          />
        </Link>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="full_name"
              rules={{
                required: ERROR_MESSAGES.common.required,
                pattern: namePattern,
              }}
              render={({ field }) => (
                <FormItem className="mt-2">
                  <div className="flex items-center">
                    <FormLabel className="text-xl">이름</FormLabel>
                    <FormMessage className="m-1" />
                  </div>
                  <FormControl>
                    <Input
                      type="text"
                      id="full_name"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
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
                      placeholder="8자리 이상 입력"
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
                <FormItem className="mt-2">
                  <div className="flex items-center">
                    <FormLabel className="text-xl">비밀번호 확인</FormLabel>
                    <FormMessage className="m-1" />
                  </div>
                  <FormControl>
                    <Input
                      type="password"
                      id="confirm_password"
                      placeholder="비밀번호 입력 확인"
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
              회원 가입 하기
            </Button>
          </form>
        </Form>
      </div>
    </main>
  )
}

export default SignUp
