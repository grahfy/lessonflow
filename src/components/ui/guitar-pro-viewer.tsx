"use client";

/**
 * GuitarProViewer — in-browser rendering of Guitar Pro files (.gp3/.gp4/.gp5/
 * .gpx/.gp) via alphaTab (https://alphatab.net, MPL-2.0), in a "Studio Console"
 * shell: a dark top bar, a left rail of instrument track lanes, and a light
 * "paper" stage the score renders onto.
 *
 * Phase B.1 is RENDER-ONLY (no audio playback yet — that is a deliberate
 * follow-up). Rendering, as configured here, needs NO Content-Security-Policy
 * change:
 *   - `core.useWorkers = false` renders on the main thread → no Web Worker, so
 *     the app's `default-src 'self'` (which has no `worker-src`) is never
 *     exercised.
 *   - `player.enablePlayer = false` never constructs the audio synth subsystem
 *     (no AudioWorklet, no soundfont fetch).
 *   - `core.fontDirectory` points at the self-hosted Bravura font under
 *     `/public/alphatab/font/`, loaded same-origin under `font-src 'self'`.
 *   - Score BYTES are fetched from the caller-supplied `src` — an already
 *     authorized download route (student assignment check / admin session) that
 *     streams `application/octet-stream` with `nosniff` intact. A same-origin
 *     `fetch` satisfies `connect-src 'self'`; the byte path is untouched.
 *
 * BUNDLE COST: alphaTab is large and this directory is imported by every
 * surface, so it is loaded with a dynamic `import()` inside the mount effect —
 * code-split out of the main bundle, fetched only when a GP file is opened, and
 * kept off the SSR path (alphaTab touches `window`/`document` at construction).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Drum, Guitar, Music2, Rows3, StretchHorizontal, ZoomIn, ZoomOut } from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import styles from "./guitar-pro-viewer.module.css";

/* ---- Minimal typing of the alphaTab surface this component depends on ----
 * (avoids pulling alphaTab's full types into the static graph while staying
 * `any`-free). */
type AlphaTabModule = typeof import("@coderline/alphatab");
type GpTrack = { index: number; name: string };
type GpScore = { title?: string | null; tracks: GpTrack[] };
type GpApi = {
  destroy: () => void;
  load: (data: Uint8Array, trackIndexes?: number[]) => boolean;
  renderTracks: (tracks: GpTrack[]) => void;
  updateSettings: () => void;
  render: () => void;
  settings: { display: { scale: number; layoutMode: number } };
  scoreLoaded: { on: (cb: (score: GpScore) => void) => void };
  renderFinished: { on: (cb: () => void) => void };
  error: { on: (cb: (error: Error) => void) => void };
};

type ViewerStatus = "loading" | "ready" | "error";
type LayoutKind = "page" | "horizontal";

const MIN_SCALE = 0.5;
const MAX_SCALE = 2;
const SCALE_STEP = 0.25;

type GuitarProViewerProps = {
  /**
   * Authorized URL that streams the raw Guitar Pro bytes. Fetched same-origin
   * with credentials; its headers are never relaxed.
   */
  src: string;
  /** URL for the Download action. Defaults to `src`. */
  downloadUrl?: string;
  /** Score title shown in the top bar. */
  title?: string;
};

/**
 * alphaTab renders a hardcoded "rendered by alphaTab" credit annotation into
 * the score SVG with no setting to disable it. Remove it after each render.
 * MPL-2.0 requires preserving license notices in source (which we do — the
 * dependency, this file's header, and the bundled OFL/notice files), not a
 * displayed on-canvas credit, so stripping the visual annotation is permitted.
 */
const ALPHATAB_CREDIT = "rendered by alphatab";
function stripAlphaTabCredit(root: HTMLElement) {
  root.querySelectorAll("text").forEach((node) => {
    if (node.textContent?.trim().toLowerCase() === ALPHATAB_CREDIT) {
      node.remove();
    }
  });
}

/** Picks a lane glyph from the track name (best-effort; falls back to guitar). */
function laneIconFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("bass")) return Guitar;
  if (n.includes("drum") || n.includes("perc")) return Drum;
  if (n.includes("guitar") || n.includes("gtr")) return Guitar;
  return Music2;
}

/**
 * Renders a Guitar Pro score with track / zoom / layout controls. Owns its
 * alphaTab instance for the component's lifetime and tears it down on unmount
 * or `src` change.
 */
export function GuitarProViewer({ src, downloadUrl, title }: GuitarProViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GpApi | null>(null);
  const modRef = useRef<AlphaTabModule | null>(null);
  const scoreRef = useRef<GpScore | null>(null);

  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [tracks, setTracks] = useState<GpTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [scale, setScale] = useState(1);
  const [layout, setLayout] = useState<LayoutKind>("page");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setTracks([]);
    setSelectedTrack(0);
    // Reset display config so a reused instance (src change) doesn't show stale
    // zoom/layout while the freshly constructed engine renders at the defaults.
    setScale(1);
    setLayout("page");

    void (async () => {
      try {
        const [alphaTab, response] = await Promise.all([
          import("@coderline/alphatab"),
          fetch(src, { credentials: "same-origin", cache: "no-store" })
        ]);
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(`Failed to load Guitar Pro file (${response.status}).`);
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;

        modRef.current = alphaTab;
        const instance = new alphaTab.AlphaTabApi(container, {
          core: {
            useWorkers: false, // main-thread render → no worker-src CSP surface
            fontDirectory: "/alphatab/font/"
          },
          player: {
            enablePlayer: false // render-only; playback is a CSP-widening follow-up
          },
          display: {
            layoutMode: alphaTab.LayoutMode.Page,
            scale: 1
          }
        }) as unknown as GpApi;
        apiRef.current = instance;

        instance.scoreLoaded.on((score) => {
          if (cancelled) return;
          scoreRef.current = score;
          setTracks(score.tracks.map((t) => ({ index: t.index, name: t.name })));
          setSelectedTrack(0);
        });
        instance.renderFinished.on(() => {
          if (cancelled) return;
          stripAlphaTabCredit(container);
          setStatus("ready");
        });
        instance.error.on((error) => {
          if (cancelled) return;
          console.warn("[GuitarProViewer] alphaTab error", error);
          setStatus("error");
        });

        // Render the first track only; `load` returns false immediately on
        // unparseable bytes — surface that without waiting on an event.
        const started = instance.load(bytes, [0]);
        if (!started && !cancelled) setStatus("error");
      } catch (error) {
        if (!cancelled) {
          console.warn("[GuitarProViewer] failed to initialize", error);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        apiRef.current?.destroy();
      } catch {
        // destroy() can throw if construction never completed; ignore on unmount.
      }
      apiRef.current = null;
      scoreRef.current = null;
    };
  }, [src]);

  const selectTrack = useCallback((index: number) => {
    const api = apiRef.current;
    const score = scoreRef.current;
    if (!api || !score?.tracks[index]) return;
    setSelectedTrack(index);
    api.renderTracks([score.tracks[index]]);
  }, []);

  const applyScale = useCallback((next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(next * 100) / 100));
    const api = apiRef.current;
    setScale(clamped);
    if (!api) return;
    api.settings.display.scale = clamped;
    api.updateSettings();
    api.render();
  }, []);

  const applyLayout = useCallback((next: LayoutKind) => {
    const api = apiRef.current;
    const mod = modRef.current;
    setLayout(next);
    if (!api || !mod) return;
    api.settings.display.layoutMode = next === "page" ? mod.LayoutMode.Page : mod.LayoutMode.Horizontal;
    api.updateSettings();
    api.render();
  }, []);

  const href = downloadUrl ?? src;
  const subtitle = tracks.length ? `${tracks.length} track${tracks.length === 1 ? "" : "s"}` : "Guitar Pro";
  // Score-interaction controls are only meaningful once a score has rendered.
  // Gating them also prevents calling into the alphaTab instance after an error
  // (when it may be mid-teardown), which would otherwise throw in a click handler.
  const ready = status === "ready";
  const readyLabel = ready
    ? `Guitar Pro score${title ? `: ${title}` : ""}${tracks[selectedTrack]?.name ? `, ${tracks[selectedTrack].name}` : ""}`
    : undefined;

  return (
    <div className={styles.viewer} data-layout={layout}>
      <div className={styles.topbar}>
        <div className={styles.titleBlock}>
          <span className={styles.title}>{title || "Guitar Pro score"}</span>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>

        <div className={styles.cluster} role="group" aria-label="Zoom">
          <div className={styles.zoomGroup}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => applyScale(scale - SCALE_STEP)}
              disabled={!ready || scale <= MIN_SCALE}
              aria-label="Zoom out"
            >
              <ZoomOut size={18} aria-hidden />
            </button>
            <span className={styles.zoomValue} aria-live="polite">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => applyScale(scale + SCALE_STEP)}
              disabled={!ready || scale >= MAX_SCALE}
              aria-label="Zoom in"
            >
              <ZoomIn size={18} aria-hidden />
            </button>
          </div>
        </div>

        <div className={styles.segGroup} role="group" aria-label="Layout">
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={layout === "page"}
            disabled={!ready}
            onClick={() => applyLayout("page")}
          >
            <Rows3 size={16} aria-hidden /> Page
          </button>
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={layout === "horizontal"}
            disabled={!ready}
            onClick={() => applyLayout("horizontal")}
          >
            <StretchHorizontal size={16} aria-hidden /> Horizontal
          </button>
        </div>

        <a className={styles.linkBtn} href={href} download>
          <Download size={16} aria-hidden /> Download
        </a>
      </div>

      <div className={styles.body}>
        <div className={styles.rail} role="group" aria-label="Tracks">
          <span className={styles.railHeading}>Tracks</span>
          {tracks.map((track, index) => {
            const Icon = laneIconFor(track.name);
            const active = index === selectedTrack;
            return (
              <button
                key={`${track.index}-${track.name}`}
                type="button"
                className={styles.lane}
                aria-pressed={active}
                disabled={!ready}
                onClick={() => selectTrack(index)}
              >
                <span className={styles.laneIcon}>
                  <Icon size={16} aria-hidden />
                </span>
                <span className={styles.laneCopy}>
                  <span className={styles.laneName}>{track.name || `Track ${index + 1}`}</span>
                  <span className={styles.laneMeta}>Track {index + 1}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.stage}>
          {/* The paper + score container stay mounted in EVERY state so alphaTab
              always has a valid, attached, correctly-sized ref target; the
              loading/error states are overlaid on top rather than replacing it. */}
          <div className={styles.paper}>
            <div
              ref={containerRef}
              className={styles.score}
              role={ready ? "img" : undefined}
              aria-label={readyLabel}
              aria-hidden={!ready}
            />
          </div>
          {status === "loading" ? (
            <div className={styles.overlay} role="status">
              Loading Guitar Pro score…
            </div>
          ) : null}
          {status === "error" ? (
            <div className={`${styles.overlay} ${styles.statusError}`} role="alert">
              <p>This Guitar Pro file couldn’t be displayed here.</p>
              <div className={styles.statusActions}>
                <a className={styles.linkBtn} href={href} download>
                  <Download size={16} aria-hidden /> Download
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type GuitarProViewerDialogProps = GuitarProViewerProps & {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * The viewer inside the shared AppDialog `media` shell (90vw × 90vh, chrome-
 * light, overlaid close, focus trap + scroll lock + Escape). Surfaces render
 * this with their own open state and the authorized byte/download URLs.
 */
export function GuitarProViewerDialog({ isOpen, onClose, ...viewer }: GuitarProViewerDialogProps) {
  if (!isOpen) return null;
  return (
    <AppDialog isOpen={isOpen} onClose={onClose} size="media" ariaLabel={viewer.title || "Guitar Pro viewer"}>
      <GuitarProViewer {...viewer} />
    </AppDialog>
  );
}
