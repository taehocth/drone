import { StrictMode } from "react"
import ReactDOM from "react-dom/client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { APIProvider } from "@vis.gl/react-google-maps"
import { routeTree } from "./routeTree.gen"

import { Toaster } from "@/components/ui/sonner"
import { OpenAPI } from "./client"

import "./globals.css"

OpenAPI.BASE = import.meta.env.VITE_API_URL
OpenAPI.TOKEN = async () => {
  return localStorage.getItem("access_token") || ""
}

const GOOGLE_MAP_API_KEY = import.meta.env.VITE_GOOGLE_MAP_API_KEY

const queryClient = new QueryClient()

const router = createRouter({ routeTree })
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <APIProvider apiKey={GOOGLE_MAP_API_KEY} libraries={["marker"]}>
        <RouterProvider router={router} />
        <Toaster />
      </APIProvider>
    </QueryClientProvider>
  </StrictMode>,
)
