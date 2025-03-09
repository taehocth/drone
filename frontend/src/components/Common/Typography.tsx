import { cn } from "@/lib/commonUtils"
import React from "react"

type TypographyVariant =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "p"
  | "blockquote"
  | "list"
  | "inline-code"
  | "bold"
  | "small"
  | "error"

interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  variant?: TypographyVariant
  children: React.ReactNode
  as?: React.ElementType
}

const variantMapping: Record<
  TypographyVariant,
  { element: string; className: string }
> = {
  h1: {
    element: "h1",
    className: "scroll-m-20 text-3xl font-bold tracking-tight lg:text-4xl",
  },
  h2: {
    element: "h2",
    className:
      "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
  },
  h3: {
    element: "h3",
    className: "scroll-m-20 text-2xl font-semibold tracking-tight",
  },
  h4: {
    element: "h4",
    className: "scroll-m-20 text-xl font-semibold tracking-tight",
  },
  p: {
    element: "p",
    className: "leading-7 [&:not(:first-child)]:mt-6",
  },
  blockquote: {
    element: "blockquote",
    className: "mt-6 border-l-2 pl-6 italic",
  },
  list: {
    element: "ul",
    className: "my-6 ml-6 list-disc [&>li]:mt-2",
  },
  "inline-code": {
    element: "code",
    className:
      "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
  },
  bold: {
    element: "div",
    className: "text-lg font-semibold",
  },
  small: {
    element: "small",
    className: "text-sm font-medium leading-none",
  },
  error: {
    element: "span",
    className: "text-sm text-rose-400  font-medium leading-none",
  },
}

export function Typography({
  variant = "p",
  as,
  children,
  className,
  ...props
}: TypographyProps) {
  const { element: Element, className: defaultClassName } =
    variantMapping[variant]
  const Component = as || Element

  return (
    <Component className={cn(defaultClassName, className)} {...props}>
      {children}
    </Component>
  )
}

// // Renders an h1 with the h1 variant styling
// <Typography variant="h1">Taxing Laughter: The Joke Tax Chronicles</Typography>

// // Renders an h2 with the h2 variant styling
// <Typography variant="h2">The People of the Kingdom</Typography>

// // Renders a paragraph with the p variant styling
// <Typography variant="p">
//   The king, seeing how much happier his subjects were, realized the error of his ways and repealed the joke tax.
// </Typography>

// // Override the default element while keeping the variant styling
// <Typography variant="h1" as="div">
//   This will look like an h1 but render as a div.
// </Typography>
