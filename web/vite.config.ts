import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/auth": "http://localhost:3000",
      "/dashboard": "http://localhost:3000",
      "/admin": "http://localhost:3000",
      "/v1": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/docs": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});
