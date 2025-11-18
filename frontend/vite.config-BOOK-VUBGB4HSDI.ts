// vite.config.ts
import { defineConfig } from "vite"
import path from "path"
import react from "@vitejs/plugin-react-swc"
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import tailwindcss from "@tailwindcss/vite"

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
        target: "http://backend:8000", // 🚀 backend 컨테이너 서비스명 사용
        changeOrigin: true,
      },
    },
  },
})
