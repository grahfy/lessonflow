// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_COOKIE_CONSENT_STORAGE_KEY } from "@/lib/public-cookie-consent";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock("@/components/admin/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children)
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

const videos = [
  { id: "abc123", title: "Video Showcase 1" }
];

describe("videos-grid-modal", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
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

  async function renderModal() {
    const { VideosGridModal } = await import("@/components/videos-grid-modal");

    await act(async () => {
      root.render(React.createElement(VideosGridModal, { videos }));
    });
  }

  async function openVideo() {
    const launchButton = container.querySelector(".video-launch-button");
    expect(launchButton).toBeTruthy();

    await act(async () => {
      launchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("renders the YouTube iframe when optional cookies are already accepted", async () => {
    window.localStorage.setItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY, "accepted");

    await renderModal();
    const thumbnail = container.querySelector(".video-thumb-image");
    expect(thumbnail).toBeTruthy();
    expect(thumbnail?.getAttribute("src")).toContain("i.ytimg.com/vi/abc123/hqdefault.jpg");
    await openVideo();

    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("src")).toContain("youtube-nocookie.com/embed/abc123?autoplay=1");
    expect(container.textContent).not.toContain("Consent required");
  });

  it("blocks playback and explains the consent requirement when consent is unknown", async () => {
    await renderModal();

    expect(container.querySelector(".video-thumb-image")).toBeFalsy();
    expect(container.querySelector(".video-thumb-placeholder")).toBeTruthy();
    await openVideo();

    expect(container.querySelector("iframe")).toBeFalsy();
    expect(container.textContent).toContain("Consent required");
    expect(container.textContent).toContain("Accept optional cookies to play this video.");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/privacy");
  });

  it("keeps playback blocked after an explicit decline", async () => {
    window.localStorage.setItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY, "declined");

    await renderModal();

    expect(container.querySelector(".video-thumb-image")).toBeFalsy();
    expect(container.querySelector(".video-thumb-placeholder")).toBeTruthy();
    await openVideo();

    expect(container.querySelector("iframe")).toBeFalsy();
    expect(container.textContent).toContain("Consent required");
    expect(window.localStorage.getItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY)).toBe("declined");
  });

  it("accepts optional cookies from the blocked modal and reveals the iframe", async () => {
    await renderModal();
    await openVideo();

    const acceptButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Accept optional cookies"
    );
    expect(acceptButton).toBeTruthy();

    await act(async () => {
      acceptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(window.localStorage.getItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY)).toBe("accepted");
    expect(container.querySelector("iframe")).toBeTruthy();
    expect(container.textContent).not.toContain("Consent required");
    expect(container.querySelector(".video-thumb-image")).toBeTruthy();
    expect(container.querySelector(".video-thumb-placeholder")).toBeFalsy();
  });

  it("closes the blocked modal without changing consent", async () => {
    window.localStorage.setItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY, "declined");

    await renderModal();
    await openVideo();

    const closeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Close"
    );
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(window.localStorage.getItem(PUBLIC_COOKIE_CONSENT_STORAGE_KEY)).toBe("declined");
    expect(container.querySelector("[role='dialog']")).toBeFalsy();
  });
});
