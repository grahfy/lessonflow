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
 *
 * Phase B.2 extends this fake with the full player surface the component's
 * playback/mixer/export code drives: transport methods, mixer methods,
 * export, transport getters/setters, `tickCache`, and the player events
 * (`playerReady`/`soundFontLoaded`/`playerFinished`/`playerStateChanged`/
 * `playerPositionChanged`), plus the `PlayerMode`/`PlayerOutputMode`/
 * `PlayerState`/`ScrollMode` enums the component reads at construction time.
 * Without the enums, the component throws while building its constructor
 * options (`alphaTab.PlayerMode.EnabledAutomatic`,
 * `alphaTab.ScrollMode.OffScreen`) BEFORE ever constructing an instance —
 * which is what broke every render-path test below until fixed. Any new enum
 * the component reads must be added here too.
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

  type FakeTrack = { index: number; name: string };
  type FakeMasterBar = { startTick: number; calculateDuration: () => number };
  type FakeScore = { title?: string | null; tracks: FakeTrack[]; masterBars: FakeMasterBar[] };
  type FakePlayerStateArgs = { state: number; stopped: boolean };
  type FakePositionArgs = {
    currentTime: number;
    endTime: number;
    currentTick: number;
    endTick: number;
    isSeek: boolean;
  };
  type FakeSettings = {
    display: { scale: number; layoutMode: number };
    player: { scrollMode: number };
  };
  type FakeAudioExportChunk = { samples: Float32Array; currentTime: number; endTime: number };

  const instances: FakeAlphaTabApi[] = [];
  let nextLoadResult = true;

  /** A fresh, deterministic fake `IAudioExporter`: two PCM chunks, then done. */
  function makeFakeExporter() {
    let call = 0;
    return {
      render: vi.fn(async (): Promise<FakeAudioExportChunk | undefined> => {
        call += 1;
        if (call === 1) {
          return { samples: new Float32Array([0.1, 0.2, 0.3, 0.4]), currentTime: 500, endTime: 1000 };
        }
        if (call === 2) {
          return { samples: new Float32Array([0.5, 0.6, 0.7, 0.8]), currentTime: 1000, endTime: 1000 };
        }
        return undefined;
      }),
      destroy: vi.fn()
    };
  }

  class FakeAlphaTabApi {
    settings: FakeSettings;

    // REALITY MODEL (BUG 1): alphaTab's `playerReady` fires only once ALL
    // playback prerequisites are met — crucially INCLUDING a loaded soundfont
    // (isReady && isSoundFontLoaded && isMidiLoaded). The viewer loads the
    // soundfont lazily on first Play, so the player is NOT ready at open. The
    // old fake let tests fire `playerReady` with no soundfont, which masked the
    // deadlock. This flag + `completeSoundFontLoad()` below make the fake refuse
    // to become player-ready until a soundfont has loaded.
    _soundFontLoaded = false;

    // ---- Render-path events (Phase B.1) ----
    scoreLoaded = new Emitter<(score: FakeScore) => void>();
    renderFinished = new Emitter<() => void>();
    error = new Emitter<(error: Error) => void>();

    // ---- Player-path events (Phase B.2) ----
    playerReady = new Emitter<() => void>();
    soundFontLoaded = new Emitter<() => void>();
    // H2: alphaTab exposes the soundfont load-FAILURE signal on the underlying
    // player (`api.player.soundFontLoadFailed`), not the public api surface.
    soundFontLoadFailed = new Emitter<(error: Error) => void>();
    playerFinished = new Emitter<() => void>();
    playerStateChanged = new Emitter<(args: FakePlayerStateArgs) => void>();
    playerPositionChanged = new Emitter<(args: FakePositionArgs) => void>();
    /** Mirrors `AlphaTabApiBase.player` — the component subscribes to failures here. */
    player = { soundFontLoadFailed: this.soundFontLoadFailed };

    // ---- Render-path methods ----
    destroy = vi.fn();
    updateSettings = vi.fn();
    render = vi.fn();
    renderTracks = vi.fn();
    load = vi.fn(() => nextLoadResult);

    // ---- Player-path methods ----
    play = vi.fn(() => true);
    pause = vi.fn();
    playPause = vi.fn();
    stop = vi.fn();
    print = vi.fn();
    downloadMidi = vi.fn();
    loadSoundFontFromUrl = vi.fn();
    changeTrackMute = vi.fn();
    changeTrackSolo = vi.fn();
    changeTrackVolume = vi.fn();
    exportAudio = vi.fn(async () => makeFakeExporter());

    // ---- Player-path getters/setters (plain fields suffice for the fake) ----
    timePosition = 0;
    tickPosition = 0;
    endTime = 0;
    playbackSpeed = 1;
    isLooping = false;
    playbackRange: { startTick: number; endTick: number } | null = null;
    metronomeVolume = 0;
    countInVolume = 0;
    tickCache = { getMasterBarStart: vi.fn((mb: FakeMasterBar) => mb.startTick) };

    constructor(
      public container: unknown,
      settings: FakeSettings
    ) {
      this.settings = settings;
      // Enforce the reality model: `playerReady` must not fire before a
      // soundfont has loaded. A test firing it directly (as the old, masking
      // fake allowed) throws loudly instead of silently letting playback enable.
      const rawTrigger = this.playerReady.trigger.bind(this.playerReady);
      this.playerReady.trigger = ((...args: Parameters<typeof rawTrigger>) => {
        if (!this._soundFontLoaded) {
          throw new Error(
            "FakeAlphaTabApi: playerReady cannot fire before a soundfont is loaded " +
              "(models alphaTab reality — drive readiness via completeSoundFontLoad())"
          );
        }
        rawTrigger(...args);
      }) as typeof this.playerReady.trigger;
      instances.push(this);
    }

    /**
     * Simulates the realistic post-load chain: the soundfont finishes loading
     * (`soundFontLoaded`) and, with the midi + workers already prepared, the
     * player then reports ready-for-playback (`playerReady`), in that order.
     * This is the ONLY way the fake reaches player-ready — mirroring alphaTab,
     * where `playerReady` cannot precede a soundfont.
     */
    completeSoundFontLoad() {
      this._soundFontLoaded = true;
      this.soundFontLoaded.trigger();
      this.playerReady.trigger();
    }
  }

  return {
    FakeAlphaTabApi,
    LayoutMode: { Page: 0, Horizontal: 1 },
    ScrollMode: { Off: 0, Continuous: 1, OffScreen: 2, Smooth: 3 },
    PlayerMode: { Disabled: 0, EnabledAutomatic: 1, EnabledManual: 2 },
    PlayerOutputMode: { WebAudioAudioWorklets: 0, WebAudioScriptProcessor: 1 },
    PlayerState: { Paused: 0, Playing: 1 },
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
  LayoutMode: alphaTabMocks.LayoutMode,
  ScrollMode: alphaTabMocks.ScrollMode,
  PlayerMode: alphaTabMocks.PlayerMode,
  PlayerOutputMode: alphaTabMocks.PlayerOutputMode,
  PlayerState: alphaTabMocks.PlayerState
}));

import { GuitarProViewer } from "@/components/ui/guitar-pro-viewer";

/** Mirrors the component's private lazy-soundfont URL constant (not exported). */
const SOUNDFONT_URL = "/alphatab/soundfont/sonivox.sf3";

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

  /** Builds a deterministic, evenly-spaced `masterBars` fixture for loop/trainer tests. */
  function masterBars(count: number, durationTicks = 960) {
    const bars: { startTick: number; calculateDuration: () => number }[] = [];
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      bars.push({ startTick: cursor, calculateDuration: () => durationTicks });
      cursor += durationTicks;
    }
    return bars;
  }

  const score = (names: string[], bars: { startTick: number; calculateDuration: () => number }[] = []) => ({
    title: "Test Score",
    tracks: names.map((name, index) => ({ index, name })),
    masterBars: bars
  });

  /**
   * Advances a fake instance to SCORE-ready only: score loaded + first render
   * finished (`status === "ready"`) but NO soundfont loaded yet, so the player
   * subsystem is deliberately NOT ready. This is the realistic just-opened
   * state — Play is enabled (its click triggers the lazy soundfont load) while
   * readiness-gated transport controls stay disabled.
   */
  async function makeScoreReady(
    api: InstanceType<typeof alphaTabMocks.FakeAlphaTabApi>,
    trackNames: string[] = ["Lead Guitar", "Bass"],
    bars = masterBars(4)
  ) {
    await act(async () => {
      api.scoreLoaded.trigger(score(trackNames, bars));
      api.renderFinished.trigger();
    });
  }

  /** Simulates the lazy soundfont finishing to load, which makes the player ready. */
  async function completeSoundFontLoad(api: InstanceType<typeof alphaTabMocks.FakeAlphaTabApi>) {
    await act(async () => {
      api.completeSoundFontLoad();
    });
  }

  /**
   * Advances a constructed fake instance all the way to "fully playable":
   * score-ready PLUS the soundfont loaded so the player reports ready
   * (`playerReady === true`, `tickCache` populated) — the state readiness-gated
   * transport controls need. Mirrors reality: player-ready implies a soundfont.
   */
  async function makeReady(
    api: InstanceType<typeof alphaTabMocks.FakeAlphaTabApi>,
    trackNames: string[] = ["Lead Guitar", "Bass"],
    bars = masterBars(4)
  ) {
    await makeScoreReady(api, trackNames, bars);
    await completeSoundFontLoad(api);
  }

  /** Finds a `<button>` by exact `aria-label`, matching the existing tests' convention. */
  function findButton(label: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === label
    ) as HTMLButtonElement | undefined;
  }

  /**
   * The Export control is a plain disclosure (U6): the trigger is the only
   * button whose text says "Export", and the open list is a `role="group"`
   * labelled "Export options" (no role="menu"/menuitem). These helpers select
   * against that markup.
   */
  const findExportToggle = () =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Export")
    ) as HTMLButtonElement;
  const exportMenu = () => container.querySelector('[aria-label="Export options"]');
  const exportItems = () => Array.from(exportMenu()?.querySelectorAll("button, a") ?? []) as HTMLElement[];

  /** Sets a controlled `<input type="range">`'s value through React's native setter + `input` event. */
  function setRangeValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Opens the speed-trainer popover and clicks "Start trainer" (auto-sets a loop if none exists). */
  async function startTrainer() {
    const trainerToggle = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Trainer")
    ) as HTMLButtonElement;
    await act(async () => {
      trainerToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const startBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Start trainer")
    ) as HTMLButtonElement;
    await act(async () => {
      startBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

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

  // Regression cover for 5b8b047: the cursor must only scroll once it leaves the
  // visible area, not continuously on every beat. This assertion also pins the
  // `ScrollMode` enum the component reads at construction — the enum whose
  // absence from the fake previously broke every render-path test here.
  it("constructs alphaTab with OffScreen cursor scrolling", async () => {
    await renderViewer();
    const api = await waitForApi();

    expect(api.settings.player.scrollMode).toBe(alphaTabMocks.ScrollMode.OffScreen);
  });

  it("populates the track rail from scoreLoaded with the first lane active", async () => {
    await renderViewer();
    const api = await waitForApi();

    await act(async () => {
      api.scoreLoaded.trigger(score(["Lead Guitar", "Bass"]));
    });

    const rail = container.querySelector('[aria-label="Tracks"]');
    // Phase B.2 added per-lane mixer chips (Mute/Solo, each with their own
    // aria-label) inside the same rail; the lane's own select button is the
    // only per-lane button WITHOUT an aria-label, so filter to just those.
    const lanes = Array.from(rail?.querySelectorAll("button") ?? []).filter(
      (b) => !b.hasAttribute("aria-label")
    );
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

  // L10 guard (`setStatus((prev) => (prev === "ready" ? prev : "error"))`): a
  // transient PLAYER error after the score is already rendered must not blow
  // away a working score. The pre-ready half of the branch is pinned by the
  // "shows an error alert…" test above.
  it("keeps the rendered score visible when a player error arrives after ready", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeScoreReady(api);

    await act(async () => {
      api.error.trigger(new Error("transient player error"));
    });

    const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
    expect(alerts.some((el) => el.textContent?.includes("displayed here"))).toBe(false);
    expect(container.querySelector('[role="img"]')).toBeTruthy();
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
    // Phase B.2 added per-lane mixer chips (Mute/Solo, each with their own
    // aria-label) inside the same rail; the lane's own select button is the
    // only per-lane button WITHOUT an aria-label, so filter to just those.
    const lanes = Array.from(rail?.querySelectorAll("button") ?? []).filter(
      (b) => !b.hasAttribute("aria-label")
    );
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

  // ---- Phase B.2: PLAYBACK ---------------------------------------------------

  it("enables Play at score-ready (before any soundfont) while readiness-gated transport stays disabled until the player is ready", async () => {
    await renderViewer();
    const api = await waitForApi();

    // Loading: everything disabled.
    expect(findButton("Play")?.disabled).toBe(true);
    expect(findButton("Stop")?.disabled).toBe(true);
    expect(findButton("Metronome")?.disabled).toBe(true);

    // Score + first render arrive but NO soundfont is loaded yet. BUG-1 FIX:
    // Play must be ENABLED here (its click triggers the lazy soundfont load) —
    // gating it on `playerReady`, which needs a soundfont, was the deadlock.
    // The rest of the transport (needs the live player) stays disabled.
    await makeScoreReady(api);
    expect(findButton("Play")?.disabled).toBe(false);
    expect(findButton("Stop")?.disabled).toBe(true);
    expect(findButton("Metronome")?.disabled).toBe(true);
    expect((container.querySelector('input[aria-label="Seek"]') as HTMLInputElement).disabled).toBe(true);

    // Soundfont loads -> player reports ready: the rest of the transport enables.
    await completeSoundFontLoad(api);
    expect(findButton("Play")?.disabled).toBe(false);
    expect(findButton("Stop")?.disabled).toBe(false);
    expect(findButton("Metronome")?.disabled).toBe(false);
  });

  it("REGRESSION (BUG 1): with the score ready but no soundfont, Play is ENABLED; clicking it lazily loads the soundfont, then playerReady starts playback and enables the transport; a second Play does not reload", async () => {
    await renderViewer();
    const api = await waitForApi();
    // Score rendered, but NO soundfont loaded and the player is NOT ready.
    await makeScoreReady(api);

    const play = findButton("Play") as HTMLButtonElement;
    expect(play).toBeTruthy();
    // The crux of the deadlock: Play must be reachable off score-ready alone.
    // (Against the old `canPlay = ready && playerReady` gating this was `true`.)
    expect(play.disabled).toBe(false);
    // Readiness-gated transport is still off until the first play makes the
    // player ready — so the ONLY way to reach playback is this enabled Play.
    expect(findButton("Stop")?.disabled).toBe(true);

    await act(async () => {
      play.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // First click kicks off the lazy soundfont fetch; playback is deferred.
    expect(api.loadSoundFontFromUrl).toHaveBeenCalledTimes(1);
    expect(api.loadSoundFontFromUrl).toHaveBeenCalledWith(SOUNDFONT_URL, false);
    expect(api.play).not.toHaveBeenCalled();
    // Loading-sound state: the Play/Pause glyph is swapped for a spinner placeholder.
    expect(play.querySelector("svg")).toBeFalsy();

    // Soundfont finishes -> playerReady fires -> the deferred play() dispatches.
    await completeSoundFontLoad(api);

    expect(api.play).toHaveBeenCalledTimes(1);
    expect(play.querySelector("svg")).toBeTruthy();
    // The player is now ready, so the readiness-gated transport is usable.
    expect(findButton("Stop")?.disabled).toBe(false);

    await act(async () => {
      play.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Second play: no second soundfont fetch, but play() is invoked again.
    expect(api.loadSoundFontFromUrl).toHaveBeenCalledTimes(1);
    expect(api.play).toHaveBeenCalledTimes(2);
  });

  it("playerStateChanged flips the Play button to a Pause affordance, and Stop + a Paused state flips it back", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    expect(findButton("Play")).toBeTruthy();
    expect(findButton("Pause")).toBeFalsy();

    await act(async () => {
      api.playerStateChanged.trigger({ state: alphaTabMocks.PlayerState.Playing, stopped: false });
    });
    expect(findButton("Pause")).toBeTruthy();
    expect(findButton("Play")).toBeFalsy();

    const stop = findButton("Stop") as HTMLButtonElement;
    await act(async () => {
      stop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.stop).toHaveBeenCalledTimes(1);

    // The real instance would report Paused after stopping; simulate that event.
    await act(async () => {
      api.playerStateChanged.trigger({ state: alphaTabMocks.PlayerState.Paused, stopped: true });
    });
    expect(findButton("Play")).toBeTruthy();
    expect(findButton("Pause")).toBeFalsy();
  });

  it("playerPositionChanged updates the time readout and the seek slider position", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    const transport = container.querySelector('[aria-label="Playback transport"]') as HTMLElement;
    const seek = container.querySelector('input[aria-label="Seek"]') as HTMLInputElement;
    expect(transport).toBeTruthy();
    expect(seek).toBeTruthy();

    await act(async () => {
      api.playerPositionChanged.trigger({
        currentTime: 61000,
        endTime: 125000,
        currentTick: 500,
        endTick: 10000,
        isSeek: false
      });
    });

    expect(transport.textContent).toContain("1:01");
    expect(transport.textContent).toContain("2:05");
    expect(seek.value).toBe(String(Math.round((61000 / 125000) * 1000)));
  });

  it("the mute chip mutes a track via changeTrackMute and marks its lane muted", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    const muteBtn = findButton("Mute Lead Guitar") as HTMLButtonElement;
    expect(muteBtn).toBeTruthy();
    expect(muteBtn.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      muteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(api.changeTrackMute).toHaveBeenCalledWith([{ index: 0, name: "Lead Guitar" }], true);
    expect(muteBtn.getAttribute("aria-pressed")).toBe("true");
    const rail = container.querySelector('[aria-label="Tracks"]');
    expect(rail?.querySelector('[data-muted="true"]')).toBeTruthy();
    expect(rail?.textContent).toContain("Muted");
  });

  it("the solo chip solos a track via changeTrackSolo", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    const soloBtn = findButton("Solo Bass") as HTMLButtonElement;
    expect(soloBtn).toBeTruthy();
    expect(soloBtn.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      soloBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(api.changeTrackSolo).toHaveBeenCalledWith([{ index: 1, name: "Bass" }], true);
    expect(soloBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("the per-track volume slider calls changeTrackVolume with the new value", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    const volume = container.querySelector('input[aria-label="Volume for Lead Guitar"]') as HTMLInputElement;
    expect(volume).toBeTruthy();
    expect(volume.value).toBe("1");

    await act(async () => {
      setRangeValue(volume, "0.5");
    });

    expect(api.changeTrackVolume).toHaveBeenCalledWith([{ index: 0, name: "Lead Guitar" }], 0.5);
    expect(volume.value).toBe("0.5");
  });

  it("mixer mute state persists after switching the displayed track", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    const muteBtn = findButton("Mute Lead Guitar") as HTMLButtonElement;
    await act(async () => {
      muteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(muteBtn.getAttribute("aria-pressed")).toBe("true");

    // Switch the displayed (rendered) track to Bass — the lane's own main
    // button carries the track name as visible text and no aria-label.
    const bassLane = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === null && b.textContent?.includes("Bass")
    ) as HTMLButtonElement;
    expect(bassLane).toBeTruthy();
    await act(async () => {
      bassLane.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.renderTracks).toHaveBeenCalledWith([{ index: 1, name: "Bass" }]);

    // The Lead Guitar mixer state (mute) is untouched by the display switch.
    expect(findButton("Mute Lead Guitar")?.getAttribute("aria-pressed")).toBe("true");
    const rail = container.querySelector('[aria-label="Tracks"]');
    expect(rail?.querySelector('[data-muted="true"]')).toBeTruthy();
  });

  it("the metronome toggle sets metronomeVolume on, then clears it back to 0", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    const metronome = findButton("Metronome") as HTMLButtonElement;
    expect(metronome.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      metronome.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.metronomeVolume).toBe(1);
    expect(metronome.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      metronome.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.metronomeVolume).toBe(0);
    expect(metronome.getAttribute("aria-pressed")).toBe("false");
  });

  it("the count-in toggle sets countInVolume on, then clears it back to 0", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    const countIn = findButton("Count-in") as HTMLButtonElement;
    expect(countIn.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      countIn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.countInVolume).toBe(1);
    expect(countIn.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      countIn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.countInVolume).toBe(0);
    expect(countIn.getAttribute("aria-pressed")).toBe("false");
  });

  it("the Export menu's MIDI item calls downloadMidi and closes the menu", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    const exportToggle = findExportToggle();
    await act(async () => {
      exportToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(exportMenu()).toBeTruthy();

    const midiItem = exportItems().find((el) => el.textContent?.includes("MIDI")) as HTMLButtonElement;
    expect(midiItem).toBeTruthy();

    await act(async () => {
      midiItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(api.downloadMidi).toHaveBeenCalledTimes(1);
    expect(exportMenu()).toBeFalsy();
  });

  it("the Export menu's Print item calls print and closes the menu", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api);

    const exportToggle = findExportToggle();
    await act(async () => {
      exportToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const printItem = exportItems().find((el) => el.textContent?.includes("Print")) as HTMLButtonElement;
    expect(printItem).toBeTruthy();

    await act(async () => {
      printItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(api.print).toHaveBeenCalledTimes(1);
    expect(exportMenu()).toBeFalsy();
  });

  it("the Export menu's WAV item disables the control while rendering, then re-enables and downloads once finished", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake-export"),
      revokeObjectURL: vi.fn()
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      await renderViewer();
      const api = await waitForApi();
      // Score-ready but no soundfont — so the WAV export exercises the lazy load.
      await makeScoreReady(api);

      const exportToggle = findExportToggle();
      expect(exportToggle.disabled).toBe(false);

      await act(async () => {
        exportToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const wavItem = exportItems().find((el) => el.textContent?.includes("WAV")) as HTMLButtonElement;
      expect(wavItem).toBeTruthy();

      await act(async () => {
        wavItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // Rendering: the Export control disables and shows progress; the lazy
      // soundfont fetch is kicked off since export needs audible output too.
      expect(exportToggle.disabled).toBe(true);
      expect(exportToggle.textContent).toContain("Rendering");
      expect(api.loadSoundFontFromUrl).toHaveBeenCalledWith(SOUNDFONT_URL, false);

      // Soundfont loads -> playerReady dispatches the deferred export action.
      await completeSoundFontLoad(api);

      // The export loop (exportAudio -> render() chunks -> undefined) runs
      // as a detached promise chain; wait for it to settle.
      await vi.waitFor(() => {
        expect(exportToggle.disabled).toBe(false);
      });

      expect(api.exportAudio).toHaveBeenCalledWith({ sampleRate: 44100, masterVolume: 1 });
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(exportToggle.textContent).toContain("Export");
    } finally {
      clickSpy.mockRestore();
    }
  });

  it("a genuine loop-wrap position event ramps the speed trainer's playbackSpeed", async () => {
    await renderViewer();
    const api = await waitForApi();
    // 4 bars x 960 ticks -> loop defaults to bars 1..4 -> ticks [0, 3840].
    await makeReady(api, ["Lead Guitar", "Bass"], masterBars(4));

    await startTrainer();
    expect(api.playbackSpeed).toBe(0.6); // default startPercent 60%

    // Progresses into the back half of the loop range — not a wrap yet.
    await act(async () => {
      api.playerPositionChanged.trigger({
        currentTime: 2000,
        endTime: 4000,
        currentTick: 2000,
        endTick: 3840,
        isSeek: false
      });
    });
    expect(api.playbackSpeed).toBe(0.6);

    // Snaps back to the range start from the back half — a genuine wrap.
    await act(async () => {
      api.playerPositionChanged.trigger({
        currentTime: 0,
        endTime: 4000,
        currentTick: 0,
        endTick: 3840,
        isSeek: false
      });
    });
    expect(api.playbackSpeed).toBe(0.7); // startPercent 60 + stepPercent 10
  });

  it("a forward-progress position event does not ramp the speed trainer", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api, ["Lead Guitar", "Bass"], masterBars(4));

    await startTrainer();
    expect(api.playbackSpeed).toBe(0.6);

    await act(async () => {
      api.playerPositionChanged.trigger({
        currentTime: 500,
        endTime: 4000,
        currentTick: 500,
        endTick: 3840,
        isSeek: false
      });
    });
    expect(api.playbackSpeed).toBe(0.6);
  });

  it("does not ramp the trainer on a backward SEEK inside the loop (isSeek honored)", async () => {
    await renderViewer();
    const api = await waitForApi();
    await makeReady(api, ["Lead Guitar", "Bass"], masterBars(4));

    await startTrainer();
    expect(api.playbackSpeed).toBe(0.6);

    // Progress into the back half of the loop range.
    await act(async () => {
      api.playerPositionChanged.trigger({
        currentTime: 2000,
        endTime: 4000,
        currentTick: 2000,
        endTick: 3840,
        isSeek: false
      });
    });
    expect(api.playbackSpeed).toBe(0.6);

    // A manual backward seek back to the start LOOKS like a wrap by position,
    // but isSeek=true must suppress pass-detection (no ramp).
    await act(async () => {
      api.playerPositionChanged.trigger({
        currentTime: 0,
        endTime: 4000,
        currentTick: 0,
        endTick: 3840,
        isSeek: true
      });
    });
    expect(api.playbackSpeed).toBe(0.6);

    // The seek reset the baseline; a subsequent GENUINE (non-seek) wrap ramps.
    await act(async () => {
      api.playerPositionChanged.trigger({
        currentTime: 2000,
        endTime: 4000,
        currentTick: 2000,
        endTick: 3840,
        isSeek: false
      });
    });
    await act(async () => {
      api.playerPositionChanged.trigger({
        currentTime: 0,
        endTime: 4000,
        currentTick: 0,
        endTick: 3840,
        isSeek: false
      });
    });
    expect(api.playbackSpeed).toBe(0.7);
  });

  it("queues a concurrent Play and WAV export and dispatches both from ONE soundfont load", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake-export"),
      revokeObjectURL: vi.fn()
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      await renderViewer();
      const api = await waitForApi();
      // Score-ready but no soundfont — both gestures queue on the single load.
      await makeScoreReady(api);

      // Gesture 1: Play kicks off the single lazy soundfont fetch.
      const play = findButton("Play") as HTMLButtonElement;
      await act(async () => {
        play.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(api.loadSoundFontFromUrl).toHaveBeenCalledTimes(1);
      expect(api.play).not.toHaveBeenCalled();

      // Gesture 2 (before the fetch resolves): WAV export. The in-flight guard
      // must NOT fire a second loadSoundFontFromUrl — it only enqueues.
      const exportToggle = findExportToggle();
      await act(async () => {
        exportToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const wavItem = exportItems().find((el) => el.textContent?.includes("WAV")) as HTMLButtonElement;
      await act(async () => {
        wavItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(api.loadSoundFontFromUrl).toHaveBeenCalledTimes(1);
      expect(exportToggle.textContent).toContain("Rendering");

      // ONE load (soundFontLoaded -> playerReady) resolves BOTH queued actions:
      // playback starts AND export runs.
      await completeSoundFontLoad(api);
      expect(api.play).toHaveBeenCalledTimes(1);
      expect(api.exportAudio).toHaveBeenCalledTimes(1);
      expect(api.loadSoundFontFromUrl).toHaveBeenCalledTimes(1);

      await vi.waitFor(() => {
        expect(exportToggle.disabled).toBe(false);
      });
      expect(exportToggle.textContent).toContain("Export");
    } finally {
      clickSpy.mockRestore();
    }
  });

  it("surfaces a retryable error and clears the loading state when the soundfont fails", async () => {
    await renderViewer();
    const api = await waitForApi();
    // Score-ready but no soundfont: the failure path runs during the first
    // lazy load (the player never reaches ready, so playerReady never fires).
    await makeScoreReady(api);

    const play = findButton("Play") as HTMLButtonElement;
    await act(async () => {
      play.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.loadSoundFontFromUrl).toHaveBeenCalledTimes(1);
    // Loading: the play glyph is swapped for the spinner placeholder.
    expect(play.querySelector("svg")).toBeFalsy();

    // alphaTab reports the fetch failed (404 / network error).
    await act(async () => {
      api.soundFontLoadFailed.trigger(new Error("404 sonivox.sf3"));
    });

    // Playback never started; the loading state cleared (glyph restored); a
    // concise, retryable error is surfaced (NOT the whole-viewer error overlay,
    // which would replace the still-rendered score).
    expect(api.play).not.toHaveBeenCalled();
    expect(play.querySelector("svg")).toBeTruthy();
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent?.toLowerCase()).toContain("sound");
    // The score itself is untouched (no error overlay tore it down).
    expect(container.querySelector('[role="status"]')).toBeFalsy();

    // Retry: clicking Play again re-attempts the fetch (in-flight guard reset).
    await act(async () => {
      play.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.loadSoundFontFromUrl).toHaveBeenCalledTimes(2);
  });
});
