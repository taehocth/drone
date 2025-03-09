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
  type ItemPublic,
  type ItemUpdate,
  ItemsService,
} from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "@/lib/formUtils"

interface EditItemDialogProps {
  item: ItemPublic
}

const EditItemDialog = ({ item }: EditItemDialogProps) => {
  const [open, setOpen] = useState(false)

  const queryClient = useQueryClient()
  const showToast = useCustomToast()

  const form = useForm<ItemUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: item,
  })

  const mutation = useMutation({
    mutationFn: (data: ItemUpdate) =>
      ItemsService.updateItem({ id: item.id, requestBody: data }),
    onSuccess: () => {
      showToast("Success! Item updated successfully.")
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })

  const onClose = () => setOpen(false)

  const onCancel = () => {
    form.reset()
    onClose()
  }

  const onSubmit: SubmitHandler<ItemUpdate> = async (data) => {
    mutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>수정</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>'{item.title}' 기체 정보 수정</DialogTitle>
          <DialogDescription>
            email input full name input set password confirm password is
            superuser? is active? save
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="title"
              rules={{ required: "Title is required." }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>기체 타이틀</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      id="title"
                      placeholder="title"
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
              name="description"
              render={({ field, fieldState: { error } }) => (
                <FormItem>
                  <FormLabel>기체 타이틀</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      id="description"
                      placeholder="description"
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
    // <Modal
    //   isOpen={isOpen}
    //   onClose={onClose}
    //   size={{ base: "sm", md: "md" }}
    //   isCentered
    // >
    //   <ModalOverlay />
    //   <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
    //     <ModalHeader>Edit Item</ModalHeader>
    //     <ModalCloseButton />
    //     <ModalBody pb={6}>
    //       <FormControl isInvalid={!!errors.title}>
    //         <FormLabel htmlFor="title">Title</FormLabel>
    //         <Input
    //           id="title"
    //           {...register("title", {
    //             required: "Title is required",
    //           })}
    //           type="text"
    //         />
    //         {errors.title && (
    //           <FormErrorMessage>{errors.title.message}</FormErrorMessage>
    //         )}
    //       </FormControl>
    //       <FormControl mt={4}>
    //         <FormLabel htmlFor="description">Description</FormLabel>
    //         <Input
    //           id="description"
    //           {...register("description")}
    //           placeholder="Description"
    //           type="text"
    //         />
    //       </FormControl>
    //     </ModalBody>
    //     <ModalFooter gap={3}>
    //       <Button
    //         variant="primary"
    //         type="submit"
    //         isLoading={isSubmitting}
    //         isDisabled={!isDirty}
    //       >
    //         Save
    //       </Button>
    //       <Button onClick={onCancel}>Cancel</Button>
    //     </ModalFooter>
    //   </ModalContent>
    // </Modal>
  )
}

export default EditItemDialog
