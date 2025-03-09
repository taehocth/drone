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

import { type UserCreate, UsersService } from "../../client"
import type { ApiError } from "../../client/core/ApiError"
import useCustomToast from "../../hooks/useCustomToast"
import { emailPattern, handleError } from "@/lib/formUtils"
import { Checkbox } from "../ui/checkbox"

interface UserCreateForm extends UserCreate {
  confirm_password: string
}

const AddUserDialog = () => {
  const [open, setOpen] = useState(false)

  const queryClient = useQueryClient()
  const showToast = useCustomToast()

  // const {
  //   register,
  //   handleSubmit,
  //   reset,
  //   getValues,
  //   formState: { errors, isSubmitting },
  // } = useForm<UserCreateForm>({
  //   mode: "onBlur",
  //   criteriaMode: "all",
  //   defaultValues: {
  //     email: "",
  //     full_name: "",
  //     password: "",
  //     confirm_password: "",
  //     is_superuser: false,
  //     is_active: false,
  //   },
  // })
  const form = useForm<UserCreateForm>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      confirm_password: "",
      is_superuser: false,
      is_active: false,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: UserCreate) =>
      UsersService.createUser({ requestBody: data }),
    onSuccess: () => {
      showToast("Success! User created successfully.")
      form.reset()
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })
  const onClose = () => setOpen(false)

  const onSubmit: SubmitHandler<UserCreateForm> = (data) => {
    mutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>사용자 추가</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>사용자 추가</DialogTitle>
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
              rules={{ required: "Email is required.", pattern: emailPattern }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이메일</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      id="email"
                      placeholder="email"
                      {...field}
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
            {/* TODO: is_active 누락 */}
          </form>
          <DialogFooter>
            <Button type="submit">추가하기</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>

    /* <Modal
        isOpen={isOpen}
        onClose={onClose}
        size={{ base: "sm", md: "md" }}
        isCentered
      >
        <ModalOverlay />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>Add User</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl isRequired isInvalid={!!errors.email}>
              <FormLabel htmlFor="email">Email</FormLabel>
              <Input
                id="email"
                {...register("email", {
                  required: "Email is required",
                  pattern: emailPattern,
                })}
                placeholder="Email"
                type="email"
              />
              {errors.email && (
                <FormErrorMessage>{errors.email.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl mt={4} isInvalid={!!errors.full_name}>
              <FormLabel htmlFor="name">Full name</FormLabel>
              <Input
                id="name"
                {...register("full_name")}
                placeholder="Full name"
                type="text"
              />
              {errors.full_name && (
                <FormErrorMessage>{errors.full_name.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl mt={4} isRequired isInvalid={!!errors.password}>
              <FormLabel htmlFor="password">Set Password</FormLabel>
              <Input
                id="password"
                {...register("password", {
                  required: "Password is required",
                  minLength: {
                    value: 8,
                    message: "Password must be at least 8 characters",
                  },
                })}
                placeholder="Password"
                type="password"
              />
              {errors.password && (
                <FormErrorMessage>{errors.password.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl
              mt={4}
              isRequired
              isInvalid={!!errors.confirm_password}
            >
              <FormLabel htmlFor="confirm_password">Confirm Password</FormLabel>
              <Input
                id="confirm_password"
                {...register("confirm_password", {
                  required: "Please confirm your password",
                  validate: (value) =>
                    value === getValues().password ||
                    "The passwords do not match",
                })}
                placeholder="Password"
                type="password"
              />
              {errors.confirm_password && (
                <FormErrorMessage>
                  {errors.confirm_password.message}
                </FormErrorMessage>
              )}
            </FormControl>
            <div className="mt-1">
              <FormControl>
                <Checkbox {...register("is_superuser")} colorScheme="teal">
                  Is superuser?
                </Checkbox>
              </FormControl>
              <FormControl>
                <Checkbox {...register("is_active")} colorScheme="teal">
                  Is active?
                </Checkbox>
              </FormControl>
            </div>
          </ModalBody>
          <ModalFooter gap={3}>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Save
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal> */
  )
}

export default AddUserDialog

// const AddItemDialog = () => {
//   const [open, setOpen] = useState(false)

//   const queryClient = useQueryClient()
//   const showToast = useCustomToast()

//   const form = useForm<ItemCreate>({
//     mode: "onBlur",
//     criteriaMode: "all",
//     defaultValues: {
//       title: "",
//       description: "",
//     },
//   })

//   const mutation = useMutation({
//     mutationFn: (data: ItemCreate) =>
//       ItemsService.createItem({ requestBody: data }),
//     onSuccess: () => {
//       showToast("Success! Item created successfully.")
//       form.reset()
//       setOpen(false)
//     },
//     onError: (err: ApiError) => {
//       handleError(err, showToast)
//     },
//     onSettled: () => {
//       queryClient.invalidateQueries({ queryKey: ["items"] })
//     },
//   })

//   const onSubmit: SubmitHandler<ItemCreate> = (data) => {
//     mutation.mutate(data)
//   }

//   return (
//     <Dialog open={open} onOpenChange={setOpen}>
//       <DialogTrigger asChild>
//         <Button>기체 추가</Button>
//       </DialogTrigger>
//       <DialogContent>
//         <DialogHeader>
//           <DialogTitle>기체 추가</DialogTitle>
//           <DialogDescription>
//             email input full name input set password confirm password is
//             superuser? is active? save
//           </DialogDescription>
//         </DialogHeader>
//         <Form {...form}>
//           <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
//             <FormField
//               control={form.control}
//               name="title"
//               rules={{ required: "Title is required." }}
//               render={({ field }) => (
//                 <FormItem>
//                   <FormLabel>기체 타이틀</FormLabel>
//                   <FormControl>
//                     <Input
//                       type="text"
//                       id="title"
//                       placeholder="title"
//                       {...field}
//                     />
//                   </FormControl>
//                   <FormMessage className="text-destructive ml-2" />
//                 </FormItem>
//               )}
//             />
//             <FormField
//               control={form.control}
//               name="description"
//               render={({ field, fieldState: { error } }) => (
//                 <FormItem>
//                   <FormLabel>기체 타이틀</FormLabel>
//                   <FormControl>
//                     <Input
//                       type="text"
//                       id="description"
//                       placeholder="description"
//                       {...field}
//                       value={field.value ?? ""}
//                     />
//                   </FormControl>
//                   {error && (
//                     <Typography variant="error">{error.message}</Typography>
//                   )}
//                   <FormMessage />
//                 </FormItem>
//               )}
//             />
//           </form>
//           <DialogFooter>
//             <Button type="submit">추가하기</Button>
//           </DialogFooter>
//         </Form>
//       </DialogContent>
//     </Dialog>
//   )
// }

// export default AddItemDialog
