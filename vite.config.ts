import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev proxies API calls to the Express server (server/index.js) so the
// browser never needs direct CORS access to Apps Script.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
