import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev na 5174 (5173 é o playground do regime-regular); /api proxy para a API NestJS :8082.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:8082",
        changeOrigin: true,
      },
    },
  },
});
