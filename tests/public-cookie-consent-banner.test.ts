// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_COOKIE_CONSENT_STORAGE_KEY } from "@/lib/public-cookie-consent";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const pathnameMock = vi.fn();
const prefetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    prefetch: prefetchMock
  })
}));

vi.mock("@/components/motion/tween-link", () => ({
  TweenLink: ({
    href,
    children
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement("a", { href }, children)
}));

vi.mock("@/components/site-shell", () => ({
  SiteShell: ({
    children
  }: {
    children: React.ReactNode;
  }) => React.createElement("section", { className: "site-shell-test-double" }, children)
}));

vi.mock("@/lib/public-hero-preload", () => ({
  primePublicHeroImages: () => undefined
}));

vi.mock("@/lib/site-data", () => ({
  publicRouteOrder: ["/", "/contact"]
}));

describe("public-cookie-consent-banner", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    pathnameMock.mockReset();
    prefetchMock.mockReset();
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

  it("renders on first visit and includes the privacy policy link", async () => {
    const { PublicCookieConsentBanner } = await import("@/components/public-cookie-consent-banner");

    await act(async () => {
      root.render(React.createElement(PublicCookieConsentBanner));
    });

    expect(container.textContent).toContain("Cookie preferences");
    expect(container.textContent).toContain("Privacy Policy");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/privacy");
  });

  it("persists acceptance and hides after accepting", async () => {
    const { PublicCookieConsentBanner } = await import("@/components/public-cookie-consent-banner");

    await act(async () => {
      root.render(React.createElement(PublicCookieConsentBanner));
    });

    const acceptButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Accept");
    expect(acceptButton).toBeTruthy();

    await act(async () => {
      acceptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(window.localStorage.getItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY)).toBe("accepted");
    expect(container.textContent).not.toContain("Cookie preferences");
  });

  it("persists decline and hides after declining", async () => {
    const { PublicCookieConsentBanner } = await import("@/components/public-cookie-consent-banner");

    await act(async () => {
      root.render(React.createElement(PublicCookieConsentBanner));
    });

    const declineButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Decline");
    expect(declineButton).toBeTruthy();

    await act(async () => {
      declineButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(window.localStorage.getItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY)).toBe("declined");
    expect(container.textContent).not.toContain("Cookie preferences");
  });

  it("stays hidden when a prior consent choice already exists", async () => {
    window.localStorage.setItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY, "accepted");
    const { PublicCookieConsentBanner } = await import("@/components/public-cookie-consent-banner");

    await act(async () => {
      root.render(React.createElement(PublicCookieConsentBanner));
    });

    expect(container.textContent).not.toContain("Cookie preferences");
  });
});

describe("public-site-frame consent mounting", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    pathnameMock.mockReset();
    prefetchMock.mockReset();
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

  it("includes the consent banner on public routes", async () => {
    pathnameMock.mockReturnValue("/");

    const { PublicSiteFrame } = await import("@/components/public-site-frame");
    await act(async () => {
      root.render(React.createElement(
        PublicSiteFrame,
        { brandName: "Melbourne Guitar School" },
        React.createElement("main", null, "Home")
      ));
    });

    expect(container.textContent).toContain("Home");
    expect(container.textContent).toContain("Cookie preferences");
    expect(container.querySelector(".site-shell-test-double")).toBeTruthy();
  });

  it("does not wrap non-public routes with the public shell or consent banner", async () => {
    pathnameMock.mockReturnValue("/admin/login");

    const { PublicSiteFrame } = await import("@/components/public-site-frame");
    await act(async () => {
      root.render(React.createElement(
        PublicSiteFrame,
        { brandName: "Melbourne Guitar School" },
        React.createElement("main", null, "Admin")
      ));
    });

    expect(container.textContent).not.toContain("Cookie preferences");
    expect(container.querySelector(".site-shell-test-double")).toBeFalsy();
    expect(container.textContent).toContain("Admin");
  });
});
