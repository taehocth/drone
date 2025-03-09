import { useState } from "react"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/Common/Typography"

import {
  type ApiError,
  type UserPublic,
  type UserUpdate,
  UsersService,
} from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { emailPattern, handleError } from "@/lib/formUtils"
import { Checkbox } from "../ui/checkbox"
import { DropdownMenuItem } from "../ui/dropdown-menu"

interface EditUserDialogProps {
  user: UserPublic
}

interface UserUpdateForm extends UserUpdate {
  confirm_password: string
}

const EditUserDialog = ({ user }: EditUserDialogProps) => {
  const [open, setOpen] = useState(false)
  const onClose = () => setOpen(false)

  const queryClient = useQueryClient()
  const showToast = useCustomToast()

  // const {
  //   register,
  //   handleSubmit,
  //   reset,
  //   getValues,
  //   formState: { errors, isSubmitting, isDirty },
  // } = useForm<UserUpdateForm>({
  //   mode: "onBlur",
  //   criteriaMode: "all",
  //   defaultValues: user,
  // })

  const form = useForm<UserUpdateForm>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: user,
  })

  const mutation = useMutation({
    mutationFn: (data: UserUpdateForm) =>
      UsersService.updateUser({ userId: user.id, requestBody: data }),
    onSuccess: () => {
      showToast("Success! User updated successfully.")
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })

  const onSubmit: SubmitHandler<UserUpdateForm> = async (data) => {
    if (data.password === "") {
      data.password = undefined
    }
    mutation.mutate(data)
  }

  const onCancel = () => {
    form.reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem>User 수정</DropdownMenuItem>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>'{user.email}' 정보 수정</DialogTitle>
          <DialogDescription>
            email input full name input set password confirm password is
            superuser? is active? save
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="email"
              rules={{
                required: "Email is required.",
                pattern: emailPattern,
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이메일</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      id="email"
                      placeholder="email"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage className="text-destructive ml-2" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              rules={{
                required: "Password is required.",
                minLength: {
                  value: 8,
                  message: "Password must be at least 8 characters",
                },
              }}
              render={({ field, fieldState: { error } }) => (
                <FormItem>
                  <FormLabel>비밀번호</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      id="password"
                      placeholder="password"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  {error && (
                    <Typography variant="error">{error.message}</Typography>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm_password"
              rules={{
                required: "Please confirm your password.",
                validate: (value) =>
                  value === form.getValues().password ||
                  "The passwords do not match",
              }}
              render={({ field, fieldState: { error } }) => (
                <FormItem>
                  <FormLabel>비밀번호 확인</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      id="password_confirm"
                      placeholder="password_confirm"
                      {...field}
                    />
                  </FormControl>
                  {error && (
                    <Typography variant="error">{error.message}</Typography>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="full_name"
              render={({ field, fieldState: { error } }) => (
                <FormItem>
                  <FormLabel>이름</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      id="full_name"
                      placeholder="full_name"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  {error && (
                    <Typography variant="error">{error.message}</Typography>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_superuser"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>관리자 여부</FormLabel>
                    <FormDescription>
                      is_superuser 여부를 선택합니다.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>활성화 여부</FormLabel>
                    <FormDescription>
                      is_active 여부를 선택합니다.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </form>
          <DialogFooter>
            <Button type="submit" disabled={!form.formState.isDirty}>
              저장 하기
            </Button>
            <Button onClick={onCancel}>취소</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default EditUserDialog
