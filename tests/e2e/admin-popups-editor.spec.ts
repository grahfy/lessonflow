import { expect, test, type Page } from "@playwright/test";

import { loginAdminViaApi } from "./auth-helpers";

async function openPopupEditor(page: Page): Promise<void> {
  await loginAdminViaApi(page);
  await page.goto("/admin/popups", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Popup" }).click();
  await expect(page.getByRole("dialog", { name: "New Popup" })).toBeVisible();
}

for (const viewport of [
  { label: "desktop", width: 1440, height: 980 },
  { label: "compact height", width: 390, height: 640 }
]) {
  test(`Site Popups editor scrolls without obscuring actions at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openPopupEditor(page);

    const dialog = page.getByRole("dialog", { name: "New Popup" });
    const scrollBody = dialog.locator(".dialog-body-scroll");
    const saveButton = dialog.getByRole("button", { name: "Save Popup" });
    const cancelButton = dialog.getByRole("button", { name: "Cancel" });

    const initialScrollMetrics = await scrollBody.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight
    }));
    expect(initialScrollMetrics.scrollHeight, "Popup editor body should overflow vertically").toBeGreaterThan(
      initialScrollMetrics.clientHeight
    );
    await scrollBody.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
    await expect.poll(() => scrollBody.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);

    await expect(saveButton).toBeVisible();
    await expect(cancelButton).toBeVisible();

    const [bodyBox, saveBox, cancelBox] = await Promise.all([
      scrollBody.boundingBox(),
      saveButton.boundingBox(),
      cancelButton.boundingBox()
    ]);

    expect(bodyBox, "Popup editor scroll body should be laid out").not.toBeNull();
    expect(saveBox, "Save Popup button should be laid out").not.toBeNull();
    expect(cancelBox, "Cancel button should be laid out").not.toBeNull();
    expect(saveBox!.y, "Save Popup should be below the scroll body").toBeGreaterThanOrEqual(bodyBox!.y + bodyBox!.height);
    expect(cancelBox!.y, "Cancel should be below the scroll body").toBeGreaterThanOrEqual(bodyBox!.y + bodyBox!.height);

    await cancelButton.click();
    await expect(dialog).toBeHidden();
  });
}
