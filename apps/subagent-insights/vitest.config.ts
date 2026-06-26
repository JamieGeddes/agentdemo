import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "subagent-insights",
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: { NODE_ENV: "test" },
  },
});
