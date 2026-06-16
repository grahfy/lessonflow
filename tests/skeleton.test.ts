// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SkeletonBlock, SkeletonRegion } from "@/components/ui/skeleton";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("SkeletonBlock", () => {
  it("renders a decorative (aria-hidden) placeholder with the shape class", () => {
    act(() => {
      root.render(React.createElement(SkeletonBlock, { variant: "text", width: "50%" }));
    });

    const block = container.querySelector(".skeleton-block");
    expect(block).not.toBeNull();
    expect(block?.classList.contains("skeleton-block-text")).toBe(true);
    // Decorative shimmer must be hidden from the accessibility tree.
    expect(block?.getAttribute("aria-hidden")).toBe("true");
    expect((block as HTMLElement | null)?.style.width).toBe("50%");
  });
});

describe("SkeletonRegion", () => {
  it("announces the loading state once via role=status + aria-busy", () => {
    act(() => {
      root.render(
        // eslint-disable-next-line react/no-children-prop -- non-JSX (.ts) test file; SkeletonRegion requires children typed as a prop.
        React.createElement(SkeletonRegion, {
          label: "Loading portal",
          children: React.createElement(SkeletonBlock)
        })
      );
    });

    const region = container.querySelector(".skeleton-region");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-busy")).toBe("true");
    // The sr-only label conveys the loading state to assistive tech.
    expect(region?.textContent).toContain("Loading portal");
  });
});
