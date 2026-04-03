import { expect, test } from "@playwright/test";

const adminEmail = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL;
const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD;

async function createCaptchaPayload(page: import("@playwright/test").Page) {
  const captchaResponse = await page.request.get("/api/captcha");
  expect(captchaResponse.ok(), "Captcha endpoint should succeed for admin updates e2e login.").toBeTruthy();

  const captcha = (await captchaResponse.json()) as {
    token?: string;
    imageDataUrl?: string;
  } | null;

  const token = String(captcha?.token || "").trim();
  const imageDataUrl = String(captcha?.imageDataUrl || "");
  expect(token, "Captcha response should include a token for updates e2e login.").not.toBe("");
  expect(imageDataUrl.startsWith("data:image/svg+xml;base64,"), "Captcha should be returned as SVG data URL.").toBeTruthy();

  const svg = Buffer.from(imageDataUrl.split(",")[1] || "", "base64").toString("utf8");
  const answer = Array.from(svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g))
    .map((match) => match[1])
    .join("")
    .trim();

  expect(answer, "Captcha SVG should expose a readable answer for updates e2e login.").not.toBe("");

  return {
    captchaToken: token,
    captchaAnswer: answer
  };
}

test.describe("admin updates notification", () => {
  test("shows update banner when updates are available", async ({ page }) => {
    if (!adminEmail || !adminPassword) {
      test.skip(true, "DOCS_SCREENSHOTS_ADMIN_EMAIL/PASSWORD are required for admin updates e2e checks.");
    }

    // Mock the status API to return an update available
    await page.route("**/api/admin/updates/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          updateAvailable: true,
          localSha: "local-sha",
          remoteSha: "remote-sha",
          pendingCommits: [
            {
              sha: "remote-sha",
              author: "Tester",
              date: "2026-03-10",
              message: "Test commit message"
            }
          ]
        })
      });
    });

    const captchaPayload = await createCaptchaPayload(page);

    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

    const response = await page.request.post("/api/admin/login", {
      data: {
        email: adminEmail,
        password: adminPassword,
        website: "",
        ...captchaPayload
      }
    });
    expect(response.ok(), `Admin login via API should succeed for updates e2e. Received ${response.status()}.`).toBeTruthy();

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin/);
    
    // Check for banner (Wait up to 10s for the fetch to complete)
    const banner = page.locator(".update-available-banner", { hasText: /A new version of LessonFlow is available/ });
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Open changes modal
    await banner.getByRole("button", { name: /View Changes/i }).click();

    // Verify modal content
    const modal = page.getByRole("dialog", { name: /available repository updates/i });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Tester");
    await expect(modal).toContainText("Test commit message");

    // Close modal
    await modal.getByRole("button", { name: /close/i }).click();
    await expect(modal).toBeHidden({ timeout: 10000 });
  });
});
