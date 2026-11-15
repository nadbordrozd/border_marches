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
  },
});
