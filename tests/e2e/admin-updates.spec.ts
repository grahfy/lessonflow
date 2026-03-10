import { expect, test } from "@playwright/test";

const adminEmail = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL;
const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD;

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

    // Login
    await page.goto("/admin/login");
    await page.fill('input[name="email"]', adminEmail!);
    await page.fill('input[name="password"]', adminPassword!);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard and then wait for the mocked API response
    await expect(page).toHaveURL(/\/admin/);
    
    // Check for banner (Wait up to 10s for the fetch to complete)
    const banner = page.locator(".notice", { hasText: /A new version of LessonFlow is available/ });
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Open changes modal
    await banner.getByRole("button", { name: /View Changes/i }).click();

    // Verify modal content
    const modal = page.locator(".dialog-panel", { hasText: /Available repository updates/ });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Tester");
    await expect(modal).toContainText("Test commit message");

    // Close modal
    await modal.getByRole("button", { name: /Close/i }).click();
    await expect(modal).not.toBeVisible();
  });
});
