import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  test: {
    setupFiles: ["tests/setup-env.ts"],
    globalSetup: ["tests/global-db-setup.ts"],
    include: ["tests/**/*.test.ts"],
    fileParallelism: false
  }
});
