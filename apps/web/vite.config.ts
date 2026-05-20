import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const SERVER = process.env.SERVER_API_URL ?? "http://localhost:4000";

// The browser talks to the web origin only; Vite proxies REST + the CopilotKit
// runtime endpoint to the Fastify server so everything is same-origin in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      "/api": { target: SERVER, changeOrigin: true },
    },
  },
});
