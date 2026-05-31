import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAdminViaApi } from "./helpers/admin-auth";

async function getBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a visible bounding box.`).not.toBeNull();
  return box!;
}

test.describe("admin analytics desktop layout", () => {
  test.use({ viewport: { width: 1440, height: 980 } });

  test("content scrolls and stacked blocks never overlap", async ({ page }) => {
    await loginAdminViaApi(page);

    await page.goto("/admin/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /website analytics/i }).first()).toBeVisible({
      timeout: 12_000
    });
    // Dashboard body (period cards + chart + breakdowns) renders once data loads.
    await expect(page.locator(".analytics-period-grid")).toBeVisible({ timeout: 12_000 });

    // 1) The analytics pane must be vertically scrollable, not clipped.
    const pane = page.locator(".analytics-layout-content");
    const metrics = await pane.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY
    }));

    expect(
      ["auto", "scroll"].includes(metrics.overflowY),
      "Analytics pane should expose a vertical scroll region."
    ).toBeTruthy();
    expect(
      metrics.scrollHeight,
      "Analytics content is expected to exceed the viewport on desktop, requiring scroll."
    ).toBeGreaterThan(metrics.clientHeight + 1);

    // The bottom-most block must be reachable by scrolling the pane.
    const lastBlock = page.locator(".analytics-breakdown-grid").last();
    await lastBlock.scrollIntoViewIfNeeded();
    await expect(lastBlock).toBeVisible();
    const scrolledTop = await pane.evaluate((node) => node.scrollTop);
    expect(scrolledTop, "Scrolling to the last block should advance the pane scroll position.").toBeGreaterThan(0);

    // 2) Consecutive top-level blocks must stack without overlapping.
    const blocks = [
      page.locator(".analytics-toolbar-card"),
      page.locator(".analytics-period-grid"),
      page.locator(".analytics-chart-card"),
      page.locator(".analytics-breakdown-grid").nth(0),
      page.locator(".analytics-breakdown-grid").nth(1)
    ];

    let previousBottom = -Infinity;
    for (let i = 0; i < blocks.length; i++) {
      const box = await getBox(blocks[i], `Analytics block #${i}`);
      expect(
        box.y,
        `Analytics block #${i} should start at or below the previous block's bottom (no overlap).`
      ).toBeGreaterThanOrEqual(previousBottom - 1);
      previousBottom = box.y + box.height;
    }
  });
});
