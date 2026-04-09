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

async function loginAdmin(page: import("@playwright/test").Page) {
  const captchaPayload = await createCaptchaPayload(page);
  const forwardedIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;

  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

  const response = await page.request.post("/api/admin/login", {
    headers: {
      "x-forwarded-for": forwardedIp
    },
    data: {
      email: adminEmail,
      password: adminPassword,
      website: "",
      ...captchaPayload
    }
  });

  expect(response.ok(), `Admin login via API should succeed for updates e2e. Received ${response.status()}.`).toBeTruthy();
}

test.describe("admin updates notification", () => {
  test.use({ viewport: { width: 1440, height: 980 } });

  test("stays quiet when no repository updates are available", async ({ page }) => {
    if (!adminEmail || !adminPassword) {
      test.skip(true, "DOCS_SCREENSHOTS_ADMIN_EMAIL/PASSWORD are required for admin updates e2e checks.");
    }

    await page.route("**/api/admin/updates/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          updateAvailable: false,
          pendingCommits: [],
          webTriggerConfigured: true,
          webTriggerMessage: ""
        })
      });
    });

    await loginAdmin(page);

    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin\/bookings/);

    const banner = page.locator(".update-available-banner");
    await expect(banner).toHaveCount(0);
    await expect(page.getByText(/Failed to check for updates/i)).toHaveCount(0);
  });

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

    await loginAdmin(page);

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

  test("opens the deployment updates dialog cleanly when no deploy metadata exists yet", async ({ page }) => {
    if (!adminEmail || !adminPassword) {
      test.skip(true, "DOCS_SCREENSHOTS_ADMIN_EMAIL/PASSWORD are required for admin updates e2e checks.");
    }

    await page.route("**/api/admin/updates/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          updateAvailable: false,
          pendingCommits: [],
          webTriggerConfigured: true,
          webTriggerMessage: ""
        })
      });
    });

    await page.route("**/api/admin/deploy-updates/latest", async (route) => {
      await route.fulfill({
        status: 204,
        body: ""
      });
    });

    await page.route("**/api/admin/deploy-updates/history", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updates: [] })
      });
    });

    await loginAdmin(page);

    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin\/bookings/);

    const deployUpdatesDialog = page.getByRole("dialog", { name: /deployment updates/i });
    await expect(deployUpdatesDialog).toHaveCount(0);
    await expect(page.getByText(/Unable to load latest updates/i)).toHaveCount(0);

    const updatesButton = page.getByRole("button", { name: /^updates$/i }).first();
    await expect(updatesButton).toBeVisible();
    await updatesButton.click();

    await expect(deployUpdatesDialog).toBeVisible();
    await expect(deployUpdatesDialog).toContainText("No deployment update metadata has been recorded yet.");
    await expect(deployUpdatesDialog).not.toContainText(/Unable to load latest updates/i);

    const dialogBody = deployUpdatesDialog.locator(".dialog-body-scroll");
    const bodyPadding = await dialogBody.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        paddingLeft: Number.parseFloat(styles.paddingLeft),
        paddingRight: Number.parseFloat(styles.paddingRight)
      };
    });

    expect(bodyPadding.paddingLeft, "Deployment updates dialog body should keep left padding.").toBeGreaterThan(0);
    expect(bodyPadding.paddingRight, "Deployment updates dialog body should keep right padding.").toBeGreaterThan(0);

    const contentInset = await deployUpdatesDialog.locator(".deploy-updates-content").evaluate((node) => {
      const contentRect = node.getBoundingClientRect();
      const dialogRect = node.closest("[role='dialog']")?.getBoundingClientRect();

      return {
        leftInset: dialogRect ? contentRect.left - dialogRect.left : 0,
        rightInset: dialogRect ? dialogRect.right - contentRect.right : 0
      };
    });

    expect(contentInset.leftInset, "Deployment updates content should be inset from the left edge.").toBeGreaterThan(10);
    expect(contentInset.rightInset, "Deployment updates content should be inset from the right edge.").toBeGreaterThan(10);

    await deployUpdatesDialog.getByRole("tab", { name: /^history$/i }).click();
    await expect(deployUpdatesDialog).toContainText("No deployment history found.");
  });
});
