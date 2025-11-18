/// <reference types="react-sparklines" />
declare module "react-sparklines" {
  import * as React from "react"

  export interface SparklinesProps {
    data: number[]
    limit?: number
    width?: number
    height?: number
    margin?: number
    style?: React.CSSProperties
    children?: React.ReactNode
  }

  export interface SparklinesLineProps {
    color?: string
    style?: React.CSSProperties
  }

  export interface SparklinesReferenceLineProps {
    type?: "mean" | "median" | "avg" | "custom"
    style?: React.CSSProperties
  }

  export const Sparklines: React.FC<SparklinesProps>
  export const SparklinesLine: React.FC<SparklinesLineProps>
  export const SparklinesReferenceLine: React.FC<SparklinesReferenceLineProps>
}
