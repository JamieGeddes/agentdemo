/**
 * Root Vitest workspace. Each package/app ships its own vitest config
 * (node env for shared/server/agent, jsdom for web). `npm test` runs them all.
 */
export default [
  "packages/shared/vitest.config.ts",
  "apps/server/vitest.config.ts",
  "apps/agent/vitest.config.ts",
  "apps/web/vitest.config.ts",
];
