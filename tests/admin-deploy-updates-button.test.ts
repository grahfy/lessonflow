// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock("@/components/admin/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children)
}));

vi.mock("@/components/admin/ui/admin-dialog", () => ({
  AdminDialog: ({
    isOpen,
    title,
    children
  }: {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
  }) => (isOpen ? React.createElement("div", { role: "dialog", "aria-label": title }, children) : null)
}));

const safeFetchMock = vi.fn();
const handleApiErrorMock = vi.fn();

vi.mock("@/lib/admin/use-safe-fetch", () => ({
  useSafeFetch: () => ({
    safeFetch: safeFetchMock,
    handleApiError: handleApiErrorMock
  })
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("admin-deploy-updates-button", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    safeFetchMock.mockReset();
    handleApiErrorMock.mockReset();
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function renderButton() {
    await act(async () => {
      root.render(React.createElement(AdminDeployUpdatesButton));
    });
  }

  it("stays quiet on passive load when no deployment metadata exists yet", async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await renderButton();

    expect(safeFetchMock).toHaveBeenCalledWith("/api/admin/deploy-updates/latest", { cache: "no-store" });
    expect(handleApiErrorMock).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    expect(container.textContent).not.toContain("Unable to load latest updates.");
  });

  it("opens cleanly without an error when force-open sees no deployment metadata", async () => {
    safeFetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await renderButton();

    const updatesButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Updates"
    );
    expect(updatesButton).toBeTruthy();

    await act(async () => {
      updatesButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(handleApiErrorMock).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Unable to load latest updates.");
    expect(container.textContent).toContain("No deployment update metadata has been recorded yet.");
  });

  it("renders deployment metadata when a latest update payload exists", async () => {
    safeFetchMock.mockResolvedValueOnce(jsonResponse({
      branch: "main",
      release: "1.2.3",
      appliedAt: "2026-04-03T10:00:00.000Z",
      commit: "abcdef1234567",
      shortCommit: "abcdef1",
      previousCommit: "1234567",
      commits: [
        {
          hash: "abcdef1234567",
          shortHash: "abcdef1",
          authorName: "Deploy Bot",
          authoredAt: "2026-04-03T09:59:00.000Z",
          subject: "Ship release",
          body: "Release body"
        }
      ]
    }));

    await renderButton();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(container.textContent).toContain("Ship release");
    expect(container.textContent).toContain("Current commit");
    expect(container.textContent).toContain("abcdef1");
  });
});
