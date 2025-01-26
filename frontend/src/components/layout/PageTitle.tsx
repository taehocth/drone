import { ComponentProps } from "react"
import { Text } from "@chakra-ui/react"

export const PageTitle = ({
  children,
  ...props
}: ComponentProps<typeof Text>) => {
  return (
    <Text
      as="h1"
      textStyle="h1"
      mb={4}
      borderBottomWidth="1px"
      borderBottomStyle="solid"
      borderBottomColor="gray.200"
      {...props}
    >
      {children}
    </Text>
  )
}
