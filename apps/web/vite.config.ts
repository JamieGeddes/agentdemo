import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Explicit IPv4 (not "localhost"): Fastify binds IPv4 only, and on dual-stack
// hosts "localhost" resolves ::1 first — connecting over IPv6 then refuses.
const SERVER = process.env.SERVER_API_URL ?? "http://127.0.0.1:4000";

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
