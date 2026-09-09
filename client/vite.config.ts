import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://localhost:3000",
      "/me": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
