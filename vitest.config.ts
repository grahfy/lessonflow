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
    // MUST stay false: integration tests share ONE MySQL database (mgs_test)
    // and many files own global table state (e.g. lessonPricingOption, whose
    // active rows gate booking create/edit validation). Serial files + each
    // file resetting the state it depends on in beforeEach is the isolation
    // model; flipping this to true reintroduces cross-file write/read races.
    fileParallelism: false
  }
});
