// vite.config.ts
import { defineConfig } from "file:///app/node_modules/vite/dist/node/index.js"
import path from "path"
import react from "file:///app/node_modules/@vitejs/plugin-react-swc/index.js"
import { TanStackRouterVite } from "file:///app/node_modules/@tanstack/router-vite-plugin/dist/esm/index.js"
import tailwindcss from "file:///app/node_modules/@tailwindcss/vite/dist/index.mjs"
var __vite_injected_original_dirname = "/app"
var vite_config_default = defineConfig({
  plugins: [react(), TanStackRouterVite(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "src"),
      // ✅ "@/..." → src 경로로 매핑
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://backend:8000",
        // 🚀 backend 컨테이너 서비스명 사용
        changeOrigin: true,
      },
    },
  },
})
export { vite_config_default as default }
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvYXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvYXBwL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9hcHAvdml0ZS5jb25maWcudHNcIjsvLyB2aXRlLmNvbmZpZy50c1xyXG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiXHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCJcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIlxyXG5pbXBvcnQgeyBUYW5TdGFja1JvdXRlclZpdGUgfSBmcm9tIFwiQHRhbnN0YWNrL3JvdXRlci12aXRlLXBsdWdpblwiXHJcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tIFwiQHRhaWx3aW5kY3NzL3ZpdGVcIlxyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBwbHVnaW5zOiBbcmVhY3QoKSwgVGFuU3RhY2tSb3V0ZXJWaXRlKCksIHRhaWx3aW5kY3NzKCldLFxyXG4gIHJlc29sdmU6IHtcclxuICAgIGFsaWFzOiB7XHJcbiAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcInNyY1wiKSwgLy8gXHUyNzA1IFwiQC8uLi5cIiBcdTIxOTIgc3JjIFx1QUNCRFx1Qjg1Q1x1Qjg1QyBcdUI5RTRcdUQ1NTFcclxuICAgIH0sXHJcbiAgfSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHByb3h5OiB7XHJcbiAgICAgIFwiL2FwaVwiOiB7XHJcbiAgICAgICAgdGFyZ2V0OiBcImh0dHA6Ly9iYWNrZW5kOjgwMDBcIiwgLy8gXHVEODNEXHVERTgwIGJhY2tlbmQgXHVDRUU4XHVEMTRDXHVDNzc0XHVCMTA4IFx1QzExQ1x1QkU0NFx1QzJBNFx1QkE4NSBcdUMwQUNcdUM2QTlcclxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH0sXHJcbn0pXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFVBQVU7QUFDakIsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsMEJBQTBCO0FBQ25DLE9BQU8saUJBQWlCO0FBTHhCLElBQU0sbUNBQW1DO0FBUXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLEdBQUcsbUJBQW1CLEdBQUcsWUFBWSxDQUFDO0FBQUEsRUFDdEQsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsS0FBSztBQUFBO0FBQUEsSUFDcEM7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsUUFDTixRQUFRO0FBQUE7QUFBQSxRQUNSLGNBQWM7QUFBQSxNQUNoQjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
