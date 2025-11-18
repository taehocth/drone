// vite.config.ts
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
      "@": path.resolve(__dirname, "src"), // ✅ "@/..." → src 경로로 매핑
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000", // ✅ FastAPI 백엔드
        changeOrigin: true,
      },
    },
  },
})
