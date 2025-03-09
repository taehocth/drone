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

import { type ApiError, type ItemCreate, ItemsService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "@/lib/formUtils"

const AddItemDialog = () => {
  const [open, setOpen] = useState(false)

  const queryClient = useQueryClient()
  const showToast = useCustomToast()

  const form = useForm<ItemCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: "",
      description: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: ItemCreate) =>
      ItemsService.createItem({ requestBody: data }),
    onSuccess: () => {
      showToast("Success! Item created successfully.")
      form.reset()
      setOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })

  const onSubmit: SubmitHandler<ItemCreate> = (data) => {
    mutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>기체 추가</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>기체 추가</DialogTitle>
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
            <Button type="submit">추가하기</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default AddItemDialog
