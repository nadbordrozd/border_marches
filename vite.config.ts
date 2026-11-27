import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works from any static host or sub-path.
  base: "./",
  server: {
    host: "localhost",
    port: 6273,
    strictPort: true,
  },
  preview: {
    host: "localhost",
    port: 6273,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // `.claude/**` holds agent worktrees (other checkouts of this repo).
    exclude: [...configDefaults.exclude, ".claude/**"],
    // Several workers often run the unit tier at once on one machine, which
    // stretches the slower tests (1-3 s alone) past vitest's 5 s default.
    // Speed budgets live in `npm run perf` (tests/perf/run.ts), not here.
    // Heavy tests (many maps, whole games, many battles) set their own,
    // longer limit: HEAVY_TIMEOUT in tests/timeouts.ts.
    testTimeout: 30_000,
  },
});
