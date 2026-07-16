// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

/**
 * Fake `@coderline/alphatab` module. The real package touches `window`/
 * `document` at construction and is dynamically imported by the component —
 * `vi.mock` intercepts both static and dynamic imports of the specifier, so
 * the component never sees the real (heavy) library.
 *
 * Built with `vi.hoisted` so the mock state (constructed instances, the next
 * `load()` return value) is reachable both from the factory below and from
 * the test bodies.
 */
const alphaTabMocks = vi.hoisted(() => {
  class Emitter<Callback extends (...args: never[]) => void> {
    private listeners: Callback[] = [];
    on(cb: Callback) {
      this.listeners.push(cb);
    }
    trigger(...args: Parameters<Callback>) {
      for (const cb of this.listeners) {
        (cb as (...a: Parameters<Callback>) => void)(...args);
      }
    }
  }

  type FakeScore = { title?: string | null; tracks: { index: number; name: string }[] };

  const instances: FakeAlphaTabApi[] = [];
  let nextLoadResult = true;

  class FakeAlphaTabApi {
    settings: { display: { scale: number; layoutMode: number } };
    scoreLoaded = new Emitter<(score: FakeScore) => void>();
    renderFinished = new Emitter<() => void>();
    error = new Emitter<(error: Error) => void>();
    destroy = vi.fn();
    updateSettings = vi.fn();
    render = vi.fn();
    renderTracks = vi.fn();
    load = vi.fn(() => nextLoadResult);

    constructor(
      public container: unknown,
      settings: { display: { scale: number; layoutMode: number } }
    ) {
      this.settings = settings;
      instances.push(this);
    }
  }

  return {
    FakeAlphaTabApi,
    LayoutMode: { Page: 0, Horizontal: 1 },
    instances,
    /** Resets constructed-instance tracking and the next `load()` outcome between tests. */
    reset() {
      instances.length = 0;
      nextLoadResult = true;
    },
    setNextLoadResult(value: boolean) {
      nextLoadResult = value;
    },
    lastInstance() {
      return instances[instances.length - 1];
    }
  };
});

vi.mock("@coderline/alphatab", () => ({
  AlphaTabApi: alphaTabMocks.FakeAlphaTabApi,
  LayoutMode: alphaTabMocks.LayoutMode
}));

import { GuitarProViewer } from "@/components/ui/guitar-pro-viewer";

describe("GuitarProViewer", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let unmounted = false;
  const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    alphaTabMocks.reset();
    unmounted = false;

    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8)
    }));
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (!unmounted) {
      await act(async () => {
        root.unmount();
      });
    }
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderViewer(props: { src?: string; downloadUrl?: string; title?: string } = {}) {
    await act(async () => {
      root.render(
        React.createElement(GuitarProViewer, {
          src: props.src ?? "/api/library/items/abc/download",
          downloadUrl: props.downloadUrl,
          title: props.title
        })
      );
    });
  }

  /** Waits until the mocked AlphaTabApi has been constructed for the current render. */
  async function waitForApi() {
    await vi.waitFor(() => {
      expect(alphaTabMocks.lastInstance()).toBeTruthy();
    });
    return alphaTabMocks.lastInstance();
  }

  const score = (names: string[]) => ({
    title: "Test Score",
    tracks: names.map((name, index) => ({ index, name }))
  });

  it("shows the loading status while the score is being fetched and constructed", async () => {
    await renderViewer();

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain("Loading Guitar Pro score");
    expect(container.querySelector('[role="alert"]')).toBeFalsy();
  });

  it("hides the loading status and shows the score once renderFinished fires", async () => {
    await renderViewer();
    const api = await waitForApi();

    await act(async () => {
      api.renderFinished.trigger();
    });

    expect(container.querySelector('[role="status"]')).toBeFalsy();
    expect(container.querySelector('[role="alert"]')).toBeFalsy();
  });

  it("populates the track rail from scoreLoaded with the first lane active", async () => {
    await renderViewer();
    const api = await waitForApi();

    await act(async () => {
      api.scoreLoaded.trigger(score(["Lead Guitar", "Bass"]));
    });

    const rail = container.querySelector('[aria-label="Tracks"]');
    const lanes = Array.from(rail?.querySelectorAll("button") ?? []);
    expect(lanes).toHaveLength(2);
    expect(lanes[0]?.textContent).toContain("Lead Guitar");
    expect(lanes[1]?.textContent).toContain("Bass");
    expect(lanes[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(lanes[1]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows an error alert with a Download link when alphaTab reports an error", async () => {
    await renderViewer({ src: "/api/library/items/abc/download", downloadUrl: "/api/library/items/abc/download?dl=1" });
    const api = await waitForApi();

    await act(async () => {
      api.error.trigger(new Error("boom"));
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain("couldn");
    expect(alert?.textContent).toContain("displayed here");
    const downloadLink = alert?.querySelector("a[download]");
    expect(downloadLink).toBeTruthy();
    expect(downloadLink?.getAttribute("href")).toBe("/api/library/items/abc/download?dl=1");
    expect(container.querySelector('[role="status"]')).toBeFalsy();
  });

  it("shows the error state when load() returns false", async () => {
    alphaTabMocks.setNextLoadResult(false);
    await renderViewer();

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')).toBeTruthy();
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("couldn");
    expect(container.querySelector('[role="status"]')).toBeFalsy();
  });

  it("keeps score controls disabled until ready and after an error", async () => {
    const controls = () => {
      const byLabel = (label: string) =>
        Array.from(container.querySelectorAll("button")).find(
          (b) => b.getAttribute("aria-label") === label
        ) as HTMLButtonElement | undefined;
      const layout = Array.from(
        container.querySelector('[aria-label="Layout"]')?.querySelectorAll("button") ?? []
      ) as HTMLButtonElement[];
      const lanes = Array.from(
        container.querySelector('[aria-label="Tracks"]')?.querySelectorAll("button") ?? []
      ) as HTMLButtonElement[];
      return { zoomIn: byLabel("Zoom in"), zoomOut: byLabel("Zoom out"), layout, lanes };
    };

    await renderViewer();
    const api = await waitForApi();

    // Loading: zoom + layout controls disabled.
    let c = controls();
    expect(c.zoomIn?.disabled).toBe(true);
    expect(c.zoomOut?.disabled).toBe(true);
    expect(c.layout.every((b) => b.disabled)).toBe(true);

    // Tracks arrive but render hasn't finished — lanes still disabled.
    await act(async () => {
      api.scoreLoaded.trigger(score(["Lead Guitar", "Bass"]));
    });
    expect(controls().lanes.every((b) => b.disabled)).toBe(true);

    // After an error the controls stay disabled (no calls into a torn-down api).
    await act(async () => {
      api.error.trigger(new Error("boom"));
    });
    c = controls();
    expect(c.zoomIn?.disabled).toBe(true);
    expect(c.layout.every((b) => b.disabled)).toBe(true);
    expect(c.lanes.every((b) => b.disabled)).toBe(true);
  });

  it("calls renderTracks when a different track lane is clicked", async () => {
    await renderViewer();
    const api = await waitForApi();

    await act(async () => {
      api.scoreLoaded.trigger(score(["Lead Guitar", "Bass"]));
      // Reach the "ready" state — score-interaction controls are disabled until
      // the first render finishes.
      api.renderFinished.trigger();
    });

    const rail = container.querySelector('[aria-label="Tracks"]');
    const lanes = Array.from(rail?.querySelectorAll("button") ?? []);
    expect(lanes).toHaveLength(2);

    await act(async () => {
      lanes[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(api.renderTracks).toHaveBeenCalledTimes(1);
    expect(api.renderTracks).toHaveBeenCalledWith([{ index: 1, name: "Bass" }]);
    expect(lanes[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(lanes[0]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("zooming in raises the % readout and applies the scale to alphaTab", async () => {
    await renderViewer();
    const api = await waitForApi();
    await act(async () => {
      api.renderFinished.trigger();
    });

    const zoomIn = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Zoom in"
    );
    expect(zoomIn).toBeTruthy();

    await act(async () => {
      zoomIn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const readout = container.querySelector('[aria-live="polite"]');
    expect(readout?.textContent).toBe("125%");
    expect(api.settings.display.scale).toBe(1.25);
    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    expect(api.render).toHaveBeenCalledTimes(1);
  });

  it("zooming out lowers the % readout and applies the scale to alphaTab", async () => {
    await renderViewer();
    const api = await waitForApi();
    await act(async () => {
      api.renderFinished.trigger();
    });

    const zoomOut = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Zoom out"
    );
    expect(zoomOut).toBeTruthy();

    await act(async () => {
      zoomOut?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const readout = container.querySelector('[aria-live="polite"]');
    expect(readout?.textContent).toBe("75%");
    expect(api.settings.display.scale).toBe(0.75);
    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    expect(api.render).toHaveBeenCalledTimes(1);
  });

  it("toggling to Horizontal layout sets aria-pressed and applies layoutMode to alphaTab", async () => {
    await renderViewer();
    const api = await waitForApi();
    await act(async () => {
      api.renderFinished.trigger();
    });

    const layoutGroup = container.querySelector('[aria-label="Layout"]');
    const buttons = Array.from(layoutGroup?.querySelectorAll("button") ?? []);
    const pageButton = buttons.find((b) => b.textContent?.includes("Page"));
    const horizontalButton = buttons.find((b) => b.textContent?.includes("Horizontal"));
    expect(pageButton?.getAttribute("aria-pressed")).toBe("true");
    expect(horizontalButton?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      horizontalButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(horizontalButton?.getAttribute("aria-pressed")).toBe("true");
    expect(pageButton?.getAttribute("aria-pressed")).toBe("false");
    expect(api.settings.display.layoutMode).toBe(alphaTabMocks.LayoutMode.Horizontal);
    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    expect(api.render).toHaveBeenCalledTimes(1);
  });

  it("shows the error state when the fetch for the score bytes fails", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0)
    }));

    await renderViewer();

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')).toBeTruthy();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn");
  });

  it("strips the 'rendered by alphaTab' credit annotation after render", async () => {
    await renderViewer();
    const api = await waitForApi();

    // Simulate the hardcoded credit annotation alphaTab injects into the SVG.
    const mount = api.container as HTMLElement;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const credit = document.createElementNS("http://www.w3.org/2000/svg", "text");
    credit.textContent = "rendered by alphaTab";
    const keep = document.createElementNS("http://www.w3.org/2000/svg", "text");
    keep.textContent = "Amazing Grace";
    svg.append(credit, keep);
    mount.appendChild(svg);

    await act(async () => {
      api.renderFinished.trigger();
    });

    const remaining = Array.from(mount.querySelectorAll("text")).map((t) => t.textContent);
    expect(remaining).not.toContain("rendered by alphaTab");
    expect(remaining).toContain("Amazing Grace");
  });

  it("destroys the alphaTab instance on unmount", async () => {
    await renderViewer();
    const api = await waitForApi();

    await act(async () => {
      root.unmount();
    });
    unmounted = true;

    expect(api.destroy).toHaveBeenCalledTimes(1);
  });
});
