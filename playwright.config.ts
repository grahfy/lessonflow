import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.DOCS_SCREENSHOTS_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "off",
    viewport: { width: 1440, height: 980 },
    colorScheme: "dark",
    locale: "en-AU"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
