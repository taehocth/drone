import path from "path"
import react from "@vitejs/plugin-react-swc"
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import tailwindcss from "@tailwindcss/vite"

import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), TanStackRouterVite(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
