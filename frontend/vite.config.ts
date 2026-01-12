// vite.config.ts
import { defineConfig } from "vite"
import path from "path"
import react from "@vitejs/plugin-react-swc"
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), TanStackRouterVite(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // "@/..." → src 경로
    },
  },

  server: {
    // 🔴 Nginx 뒤에서 WebSocket(HMR) 충돌 방지
    hmr: false,

    // 🔹 개발 중 API 프록시 (로컬 dev 전용)
    proxy: {
      "/api": {
        target: "http://backend:8000", // Docker 서비스명
        changeOrigin: true,
      },
    },
  },
})
