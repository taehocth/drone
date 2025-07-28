import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"

import { emailPattern, handleError } from "@/lib/formUtils"
import {
  type ApiError,
  type UserPublic,
  type UserUpdateMe,
  UsersService,
} from "../../client"
import useAuth from "../../hooks/useAuth"
import useCustomToast from "../../hooks/useCustomToast"

const UserInformation = () => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const [editMode, setEditMode] = useState(false)
  const { user: currentUser } = useAuth()

  const form = useForm<UserPublic>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      full_name: currentUser?.full_name,
      email: currentUser?.email,
    },
  })

  const toggleEditMode = () => {
    setEditMode(!editMode)
  }

  const mutation = useMutation({
    mutationFn: (data: UserUpdateMe) =>
      UsersService.updateUserMe({ requestBody: data }),
    onSuccess: () => {
      showToast("성공", "사용자 정보가 성공적으로 업데이트되었습니다.")
      toggleEditMode()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries()
    },
  })

  const onSubmit: SubmitHandler<UserUpdateMe> = async (data) => {
    mutation.mutate(data)
  }

  const onCancel = () => {
    form.reset()
    toggleEditMode()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>사용자 정보</CardTitle>
        <CardDescription>
          프로필 정보를 확인하고 수정할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              rules={{ maxLength: 30 }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이름</FormLabel>
                  <FormControl>
                    {editMode ? (
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder="이름을 입력하세요"
                      />
                    ) : (
                      <p className="py-2 text-muted-foreground text-sm">
                        {currentUser?.full_name || "N/A"}
                      </p>
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              rules={{
                required: "이메일은 필수입니다.",
                pattern: emailPattern,
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이메일</FormLabel>
                  <FormControl>
                    {editMode ? (
                      <Input
                        {...field}
                        type="email"
                        placeholder="이메일을 입력하세요"
                      />
                    ) : (
                      <p className="py-2 text-sm">{currentUser?.email}</p>
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              {editMode ? (
                <>
                  <Button
                    type="submit"
                    disabled={
                      !form.formState.isDirty || form.formState.isSubmitting
                    }
                  >
                    {form.formState.isSubmitting ? "저장 중..." : "저장"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={form.formState.isSubmitting}
                  >
                    취소
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={toggleEditMode}>
                  수정
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default UserInformation
