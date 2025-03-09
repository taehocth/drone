import { ComponentProps } from "react"

import { Separator } from "@/components/ui/separator"
import { Typography } from "@/components/Common/Typography"

export const PageTitle = ({
  children,
  ...props
}: ComponentProps<typeof Typography>) => {
  return (
    <Typography variant="h2" {...props} className="pb-0">
      {children}
      <Separator />
    </Typography>
  )
}
