"use client";

/**
 * GuitarProViewer — in-browser rendering AND playback of Guitar Pro files
 * (.gp3/.gp4/.gp5/.gpx/.gp) via alphaTab (https://alphatab.net, MPL-2.0), in a
 * "Studio Console" shell: a dark top bar, a left rail of instrument track
 * lanes, a light "paper" stage the score renders onto, and (Phase B.2) a
 * full-width bottom transport strip.
 *
 * Phase B.1 shipped RENDER-ONLY. Phase B.2 layers an in-app practice station on
 * top WITHOUT changing the render path: the score still loads with
 * `load(bytes, [0])`, the credit annotation is still stripped after each
 * render, and the always-mounted paper still hosts the loading/error overlays.
 * The added surface is audio playback:
 *   - `player.playerMode = EnabledAutomatic` constructs the synth/worklet
 *     subsystem. `core.useWorkers = false` keeps RENDERING on the main thread
 *     (as in B.1) — the player worklet is a separate, audio-only surface served
 *     same-origin under `worker-src 'self'`.
 *   - The soundfont is NOT loaded at construction. It is fetched lazily from
 *     `/alphatab/soundfont/sonivox.sf3` on the first Play (or first WAV export),
 *     keeping the initial dialog-open cost identical to B.1.
 *   - Playback only ever starts on an explicit user gesture (the Play click),
 *     which is what resumes the AudioContext under the browser autoplay policy —
 *     there is no autoplay on open.
 *   - Score BYTES are still fetched from the caller-supplied `src` (an already
 *     authorized route); the byte path is untouched.
 *
 * The four pure logic modules under `src/lib/guitar-pro/` (speed-trainer,
 * transport-format, loop-range, wav-encoder) own all the math; this component
 * only adapts alphaTab data into their shapes and reacts to their output.
 *
 * BUNDLE COST: alphaTab is large and this directory is imported by every
 * surface, so it is loaded with a dynamic `import()` inside the mount effect —
 * code-split out of the main bundle, fetched only when a GP file is opened, and
 * kept off the SSR path (alphaTab touches `window`/`document` at construction).
 */

import { type CSSProperties, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  AudioWaveform,
  ChevronDown,
  CircleDot,
  Download,
  Drum,
  FileText,
  Guitar,
  Minus,
  Music2,
  Plus,
  Printer,
  Repeat2,
  Rows3,
  StretchHorizontal,
  ZoomIn,
  ZoomOut
} from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import {
  DEFAULT_SPEED_TRAINER_CONFIG,
  initSpeedTrainer,
  onLoopComplete,
  resetSpeedTrainer,
  type SpeedTrainerConfig,
  type SpeedTrainerState
} from "@/lib/guitar-pro/speed-trainer";
import { formatTime, percentToSpeed } from "@/lib/guitar-pro/transport-format";
import { barRangeToTicks, isNewLoopPass, type BarTiming, type TickRange } from "@/lib/guitar-pro/loop-range";
import { concatFloat32, encodeWavBlob } from "@/lib/guitar-pro/wav-encoder";
import styles from "./guitar-pro-viewer.module.css";

/* ---- Minimal typing of the alphaTab surface this component depends on ----
 * (avoids pulling alphaTab's full types into the static graph while staying
 * `any`-free). Extended for B.2 with every player method/event/prop/enum this
 * component touches; enum VALUES come from the dynamically-imported module
 * (`AlphaTabModule`), whose real types are already precise. */
type AlphaTabModule = typeof import("@coderline/alphatab");
type GpTrack = { index: number; name: string };
/** A master bar exposes its own tick duration; `tickCache` supplies its start. */
type GpMasterBar = { calculateDuration: () => number };
type GpScore = { title?: string | null; tracks: GpTrack[]; masterBars: GpMasterBar[] };
/** `api.tickCache` maps a master bar to its absolute start tick (null pre-midi). */
type GpTickCache = { getMasterBarStart: (bar: GpMasterBar) => number };
type GpPlaybackRange = { startTick: number; endTick: number };
type GpPlayerStateArgs = { state: number; stopped: boolean };
type GpPositionArgs = {
  currentTime: number;
  endTime: number;
  currentTick: number;
  endTick: number;
  isSeek: boolean;
};
/** One streamed PCM chunk from `IAudioExporter.render()`; `undefined` = done. */
type GpAudioExportChunk = { samples: Float32Array; currentTime: number; endTime: number };
type GpAudioExporter = {
  render: (milliseconds: number) => Promise<GpAudioExportChunk | undefined>;
  destroy: () => void;
};
type GpAudioExportOptions = { sampleRate: number; masterVolume?: number };
/**
 * The underlying alphaTab synth. alphaTab exposes the soundfont load-FAILURE
 * signal here (`api.player.soundFontLoadFailed`), not on the public api surface
 * (which only has the success `soundFontLoaded`), so H2's failure path
 * subscribes through it once the player is ready.
 */
type GpPlayer = { soundFontLoadFailed: { on: (cb: (error: Error) => void) => void } };
type GpApi = {
  destroy: () => void;
  load: (data: Uint8Array, trackIndexes?: number[]) => boolean;
  renderTracks: (tracks: GpTrack[]) => void;
  updateSettings: () => void;
  render: () => void;
  settings: {
    display: { scale: number; layoutMode: number };
    player: { enableCursor: boolean; scrollElement: string | HTMLElement };
  };
  // Transport (getters/setters expose ms/tick position + speed/loop state).
  timePosition: number;
  tickPosition: number;
  readonly endTime: number;
  playbackSpeed: number;
  isLooping: boolean;
  playbackRange: GpPlaybackRange | null;
  metronomeVolume: number;
  countInVolume: number;
  readonly tickCache: GpTickCache | null;
  play: () => boolean;
  pause: () => void;
  playPause: () => void;
  stop: () => void;
  print: () => void;
  downloadMidi: () => void;
  loadSoundFontFromUrl: (url: string, append: boolean) => void;
  changeTrackMute: (tracks: GpTrack[], mute: boolean) => void;
  changeTrackSolo: (tracks: GpTrack[], solo: boolean) => void;
  changeTrackVolume: (tracks: GpTrack[], volume: number) => void;
  exportAudio: (options: GpAudioExportOptions) => Promise<GpAudioExporter>;
  readonly player: GpPlayer | null;
  // Events (each `.on(cb)` like scoreLoaded).
  scoreLoaded: { on: (cb: (score: GpScore) => void) => void };
  renderFinished: { on: (cb: () => void) => void };
  error: { on: (cb: (error: Error) => void) => void };
  playerReady: { on: (cb: () => void) => void };
  soundFontLoaded: { on: (cb: () => void) => void };
  playerFinished: { on: (cb: () => void) => void };
  playerStateChanged: { on: (cb: (args: GpPlayerStateArgs) => void) => void };
  playerPositionChanged: { on: (cb: (args: GpPositionArgs) => void) => void };
};

type ViewerStatus = "loading" | "ready" | "error";
type LayoutKind = "page" | "horizontal";
type MixerChannel = { mute: boolean; solo: boolean; volume: number };

const MIN_SCALE = 0.5;
const MAX_SCALE = 2;
const SCALE_STEP = 0.25;

// Master tempo control (independent of the trainer). Mirrors the existing
// PracticeAudioPlayer's 5%-step fine-speed convention for consistency.
const TEMPO_MIN = 25;
const TEMPO_MAX = 200;
const TEMPO_STEP = 5;
const SEEK_RESOLUTION = 1000; // seek slider granularity (0..1000 → fraction)

/** Self-hosted soundfont (Apache-2.0), fetched lazily on first play/export. */
const SOUNDFONT_URL = "/alphatab/soundfont/sonivox.sf3";
/**
 * alphaTab audio-export defaults: stereo, 44.1kHz interleaved PCM.
 *
 * `EXPORT_CHANNELS` is the single source of truth for the channel count. Note
 * alphaTab's `AudioExportOptions` has NO `channels` field — its exporter always
 * emits interleaved stereo — so there is nothing to pass into `exportAudio()`;
 * the constant instead feeds `encodeWavBlob` so the WAV header matches the
 * fixed-stereo PCM alphaTab produces. If a future alphaTab exposes a channel
 * count, thread it from here.
 */
const EXPORT_SAMPLE_RATE = 44100;
const EXPORT_CHANNELS = 2;
/**
 * Warn-and-proceed threshold for WAV export. The offline render accumulates the
 * whole song as Float32 PCM before encoding (~10.5 MB/min stereo at 44.1kHz,
 * copied once more during concat), so very long scores can allocate hundreds of
 * MB. We don't hard-cap (truncating audio would be a silent data loss); we warn
 * past this duration and free the accumulation as soon as it is encoded.
 */
const WAV_EXPORT_WARN_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Leave a completed browser download enough time to claim its Blob URL before
 * releasing the in-memory export. Revoking synchronously after anchor.click()
 * can cancel downloads in some desktop and mobile browsers.
 */
const WAV_DOWNLOAD_URL_REVOKE_DELAY_MS = 1000;
/**
 * Belt-and-suspenders timeout for the lazy soundfont fetch. alphaTab fires
 * `player.soundFontLoadFailed` on a real failure (see H2), but if that signal
 * never arrives (e.g. the player was unexpectedly null at subscribe time), this
 * prevents the Play spinner / WAV "Rendering…" flag from hanging forever.
 * Generous so a slow connection loading the ~1MB soundfont is not falsely failed.
 */
const SOUNDFONT_LOAD_TIMEOUT_MS = 30000;
const SOUNDFONT_ERROR_MESSAGE = "Couldn’t load the playback sound. Check your connection and try again.";
const PlayerStatePlaying = 1; // alphaTab.PlayerState.Playing (Paused = 0)

/**
 * Audio output path for the player. Default uses AudioWorklets (best latency);
 * it resolves the worklet asset via `new URL(..., import.meta.url)` (so we set
 * NO `core.scriptFile`, which is dead for our ESM path). QA can flip this ONE
 * value to "scriptProcessor" to force the worklet-free ScriptProcessorNode
 * fallback if the worklet asset ever fails to resolve under a given bundler.
 * Mapped to `alphaTab.PlayerOutputMode` at construction below.
 */
const PLAYER_OUTPUT_MODE: "worklet" | "scriptProcessor" = "worklet";

const DEFAULT_MIXER_CHANNEL: MixerChannel = { mute: false, solo: false, volume: 1 };

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

/* ---- Filled transport glyphs -----------------------------------------------
 * lucide's Play/Pause/Square are stroked outlines; the mockup's transport uses
 * solid fills for the primary CTA, so these tiny inline SVGs match that design
 * exactly. Metronome/count-in have no lucide equivalent and are inlined too. */
function PlayGlyph() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseGlyph() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
function StopGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}
function MetronomeGlyph() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 20h8l-2.2-14h-3.6z" />
      <path d="M12 9.5 15 4" />
      <path d="M9.5 15h5" />
    </svg>
  );
}
function CountInGlyph() {
  return (
    <svg width={26} height={10} viewBox="0 0 34 12" aria-hidden>
      <circle cx="4" cy="6" r="3" fill="currentColor" />
      <circle cx="14" cy="6" r="2.4" fill="currentColor" opacity={0.45} />
      <circle cx="24" cy="6" r="2.4" fill="currentColor" opacity={0.45} />
      <circle cx="30.5" cy="6" r="2.4" fill="currentColor" opacity={0.45} />
    </svg>
  );
}

/**
 * Closes an open popover/menu on outside click or Escape. Returns a ref to put
 * on the popover's wrapper. `onClose` must be stable (useCallback).
 *
 * U1: the viewer lives inside an AppDialog whose own Escape/backdrop handlers
 * also listen on `document`. We register the Escape listener in the CAPTURE
 * phase and `stopPropagation()` so pressing Escape with a popover open closes
 * ONLY the popover, never the surrounding dialog (the dialog's bubble-phase
 * Escape listener never receives the event). U2: on an Escape-close we restore
 * focus to the trigger button so keyboard focus isn't stranded.
 */
function useDismissable(
  open: boolean,
  onClose: () => void,
  triggerRef?: RefObject<HTMLButtonElement | null>
) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDocDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        event.stopPropagation();
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        triggerRef?.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocDown);
    // Capture phase: run before the dialog's bubble-phase Escape handler.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, triggerRef]);
  return ref;
}

/**
 * Renders + plays a Guitar Pro score with track / zoom / layout controls, a
 * bottom transport, a per-track mixer, a speed-trainer looper and export. Owns
 * its alphaTab instance for the component's lifetime and tears it down on
 * unmount or `src` change.
 */
export function GuitarProViewer({ src, downloadUrl, title }: GuitarProViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // U2: triggers for the Export dropdown / Trainer popover, so focus returns to
  // them when their surface closes (via item-select or Escape) instead of being
  // stranded on a now-removed element.
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const trainerTriggerRef = useRef<HTMLButtonElement>(null);
  const apiRef = useRef<GpApi | null>(null);
  const modRef = useRef<AlphaTabModule | null>(null);
  const scoreRef = useRef<GpScore | null>(null);

  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [tracks, setTracks] = useState<GpTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [scale, setScale] = useState(1);
  const [layout, setLayout] = useState<LayoutKind>("page");

  // ---- Playback state -------------------------------------------------------
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundFontLoading, setSoundFontLoading] = useState(false);
  // Concise, retryable soundfont-load error (H2). Surfaced inline near the
  // transport — NOT via the whole-viewer error overlay — since a failed sound
  // fetch shouldn't tear down an already-rendered score.
  const [soundFontError, setSoundFontError] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [endTimeMs, setEndTimeMs] = useState(0);
  const [seekValue, setSeekValue] = useState(0);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [countInOn, setCountInOn] = useState(false);
  const [totalBars, setTotalBars] = useState(0);

  // ---- Mixer (persists across display-track switches within a session) ------
  const [mixer, setMixer] = useState<Record<number, MixerChannel>>({});
  const channelFor = useCallback(
    (index: number): MixerChannel => mixer[index] ?? DEFAULT_MIXER_CHANNEL,
    [mixer]
  );

  // ---- Trainer / loop state -------------------------------------------------
  const [exportOpen, setExportOpen] = useState(false);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [trainerEnabled, setTrainerEnabled] = useState(false);
  const [loopStartBar, setLoopStartBar] = useState(1);
  const [loopEndBar, setLoopEndBar] = useState(1);
  const [trainerConfig, setTrainerConfig] = useState<SpeedTrainerConfig>({ ...DEFAULT_SPEED_TRAINER_CONFIG });
  const [trainerState, setTrainerState] = useState<SpeedTrainerState>(() =>
    initSpeedTrainer(DEFAULT_SPEED_TRAINER_CONFIG)
  );

  // ---- WAV export state -----------------------------------------------------
  const [wavRendering, setWavRendering] = useState(false);
  const [wavProgress, setWavProgress] = useState(0);

  // Refs read inside the (once-subscribed) alphaTab event handlers, which close
  // over stale state otherwise. Kept in sync with the React state above.
  const cancelledRef = useRef(false);
  const soundFontLoadedRef = useRef(false);
  // A queue (not a single slot): concurrent Play + WAV-export before the lazy
  // soundfont finishes must BOTH run once it loads, instead of one clobbering
  // the other (H1). `soundFontLoadingRef` is the in-flight guard that stops a
  // second request from firing a duplicate `loadSoundFontFromUrl` (H1/M7).
  const pendingActionsRef = useRef<Array<() => void>>([]);
  const soundFontLoadingRef = useRef(false);
  // One-time guard for the `player.soundFontLoadFailed` subscription. We attach
  // it at the FIRST lazy load (in `withSoundFont`) rather than in `playerReady`,
  // because `playerReady` only fires after a *successful* soundfont load and so
  // could never catch the first load failing (see withSoundFont / H2).
  const soundFontFailSubscribedRef = useRef(false);
  const soundFontTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrubbingRef = useRef(false);
  const prevTickRef = useRef(-1);
  const loopRangeRef = useRef<TickRange | null>(null);
  const barTimingsRef = useRef<BarTiming[]>([]);
  const trainerEnabledRef = useRef(false);
  const trainerStateRef = useRef<SpeedTrainerState>(trainerState);
  const trainerConfigRef = useRef<SpeedTrainerConfig>(trainerConfig);
  const tempoPercentRef = useRef(100);

  useEffect(() => {
    trainerConfigRef.current = trainerConfig;
  }, [trainerConfig]);
  useEffect(() => {
    tempoPercentRef.current = tempoPercent;
  }, [tempoPercent]);

  /**
   * Fail the pending soundfont load (H2): clear the loading/in-flight flags,
   * drop the queued play/export actions, reset the WAV "Rendering…" lifecycle
   * so it can't strand, and surface a concise retryable message. Reused by both
   * the `soundFontLoadFailed` subscription and the timeout fallback.
   */
  const failSoundFont = useCallback(() => {
    if (cancelledRef.current) return;
    if (soundFontTimeoutRef.current !== null) {
      clearTimeout(soundFontTimeoutRef.current);
      soundFontTimeoutRef.current = null;
    }
    soundFontLoadingRef.current = false;
    pendingActionsRef.current = [];
    setSoundFontLoading(false);
    setWavRendering(false);
    setWavProgress(0);
    setSoundFontError(SOUNDFONT_ERROR_MESSAGE);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    cancelledRef.current = false;
    setStatus("loading");
    setTracks([]);
    setSelectedTrack(0);
    // Reset display config so a reused instance (src change) doesn't show stale
    // zoom/layout while the freshly constructed engine renders at the defaults.
    setScale(1);
    setLayout("page");
    // Reset all playback/mixer/trainer state for the new score.
    setPlayerReady(false);
    setIsPlaying(false);
    setSoundFontLoading(false);
    setSoundFontError(null);
    setCurrentTimeMs(0);
    setEndTimeMs(0);
    setSeekValue(0);
    setTempoPercent(100);
    setMetronomeOn(false);
    setCountInOn(false);
    setTotalBars(0);
    setMixer({});
    setExportOpen(false);
    setTrainerOpen(false);
    setLoopEnabled(false);
    setTrainerEnabled(false);
    setLoopStartBar(1);
    setLoopEndBar(1);
    setTrainerConfig({ ...DEFAULT_SPEED_TRAINER_CONFIG });
    setTrainerState(initSpeedTrainer(DEFAULT_SPEED_TRAINER_CONFIG));
    setWavRendering(false);
    setWavProgress(0);
    soundFontLoadedRef.current = false;
    pendingActionsRef.current = [];
    soundFontLoadingRef.current = false;
    soundFontFailSubscribedRef.current = false;
    if (soundFontTimeoutRef.current !== null) {
      clearTimeout(soundFontTimeoutRef.current);
      soundFontTimeoutRef.current = null;
    }
    isScrubbingRef.current = false;
    prevTickRef.current = -1;
    loopRangeRef.current = null;
    barTimingsRef.current = [];
    trainerEnabledRef.current = false;
    tempoPercentRef.current = 100;

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
            useWorkers: false, // main-thread render → no worker-src CSP surface for rendering
            fontDirectory: "/alphatab/font/"
          },
          player: {
            // Construct the synth subsystem, but DON'T set `soundFont` — it is
            // loaded lazily on first play/export (keeps dialog-open cost = B.1).
            playerMode: alphaTab.PlayerMode.EnabledAutomatic,
            outputMode:
              PLAYER_OUTPUT_MODE === "worklet"
                ? alphaTab.PlayerOutputMode.WebAudioAudioWorklets
                : alphaTab.PlayerOutputMode.WebAudioScriptProcessor,
            enableCursor: true,
            // Only scroll when the cursor leaves the visible area (reaches the
            // last on-screen bar), instead of scrolling continuously on every
            // beat. Lets the cursor travel to the bottom before the next jump.
            scrollMode: alphaTab.ScrollMode.OffScreen,
            // Auto-scroll the stage (not the window) to keep the cursor visible.
            scrollElement: stageRef.current ?? "html,body"
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
          const barCount = score.masterBars.length;
          setTotalBars(barCount);
          setLoopStartBar(1);
          setLoopEndBar(Math.min(4, Math.max(1, barCount)));
        });
        instance.renderFinished.on(() => {
          if (cancelled) return;
          stripAlphaTabCredit(container);
          setStatus("ready");
        });
        instance.error.on((error) => {
          if (cancelled) return;
          console.warn("[GuitarProViewer] alphaTab error", error);
          // L10: only a pre-"ready" error (parse/initial render) tears the
          // viewer down to the error overlay. A transient PLAYER error after
          // the score is already rendered must not blow away a working score;
          // it's logged and the score stays up.
          setStatus((prev) => (prev === "ready" ? prev : "error"));
        });

        // Player subsystem ready: `tickCache` is now populated, so adapt the
        // master bars into the `BarTiming[]` the loop-range module reads.
        //
        // BUG-1 fix: this is alphaTab's AUTHORITATIVE ready-for-playback signal
        // (isReady && isSoundFontLoaded && isMidiLoaded). Because the soundfont
        // loads lazily on the first Play, `playerReady` first fires right AFTER
        // that lazy load — so we dispatch the queued play/export actions HERE,
        // not at `soundFontLoaded`: the soundfont being loaded doesn't guarantee
        // the midi is, and `api.play()` before midi-ready would no-op silently.
        instance.playerReady.on(() => {
          if (cancelled) return;
          const score = scoreRef.current;
          const cache = instance.tickCache;
          if (score && cache) {
            barTimingsRef.current = score.masterBars.map((mb) => ({
              startTick: cache.getMasterBarStart(mb),
              durationTicks: mb.calculateDuration()
            }));
          }
          setPlayerReady(true);
          // Dispatch EVERY queued action (play AND/OR export) that was waiting on
          // the lazy soundfont/player becoming ready.
          const actions = pendingActionsRef.current;
          pendingActionsRef.current = [];
          for (const action of actions) action();
        });

        // Lazy soundfont finished loading: clear the loading lifecycle so the
        // Play spinner / WAV "Rendering…" flag resolve. The queued actions are
        // dispatched from `playerReady` above (which fires just after this once
        // the midi is also loaded), NOT here — see the note there.
        instance.soundFontLoaded.on(() => {
          if (cancelled) return;
          soundFontLoadedRef.current = true;
          soundFontLoadingRef.current = false;
          if (soundFontTimeoutRef.current !== null) {
            clearTimeout(soundFontTimeoutRef.current);
            soundFontTimeoutRef.current = null;
          }
          setSoundFontLoading(false);
          setSoundFontError(null);
        });

        instance.playerStateChanged.on((args) => {
          if (cancelled) return;
          setIsPlaying(args.state === PlayerStatePlaying);
        });

        instance.playerFinished.on(() => {
          if (cancelled) return;
          setIsPlaying(false);
        });

        instance.playerPositionChanged.on((args) => {
          if (cancelled) return;
          const prevTick = prevTickRef.current;
          prevTickRef.current = args.currentTick;

          setCurrentTimeMs(args.currentTime);
          setEndTimeMs(args.endTime);
          if (!isScrubbingRef.current) {
            setSeekValue(
              args.endTime > 0 ? Math.round((args.currentTime / args.endTime) * SEEK_RESOLUTION) : 0
            );
          }

          // M4: a manual seek (including a backward seek inside the loop) is not
          // a loop pass. Skip pass-detection and treat the post-seek position as
          // the new baseline (`prevTickRef` already holds `args.currentTick`), so
          // the next genuine wrap is measured from here rather than spuriously
          // ramping the trainer.
          if (args.isSeek) return;

          // Speed-trainer: on each completed loop pass, ramp the tempo up.
          if (trainerEnabledRef.current && loopRangeRef.current) {
            if (isNewLoopPass(prevTick, args.currentTick, loopRangeRef.current)) {
              const next = onLoopComplete(trainerStateRef.current, trainerConfigRef.current);
              trainerStateRef.current = next;
              setTrainerState(next);
              const api = apiRef.current;
              if (api) api.playbackSpeed = percentToSpeed(next.currentPercent);
            }
          }
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
      cancelledRef.current = true;
      if (soundFontTimeoutRef.current !== null) {
        clearTimeout(soundFontTimeoutRef.current);
        soundFontTimeoutRef.current = null;
      }
      try {
        apiRef.current?.destroy();
      } catch {
        // destroy() can throw if construction never completed; ignore on unmount.
      }
      apiRef.current = null;
      scoreRef.current = null;
    };
  }, [src, failSoundFont]);

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

  /**
   * Ensures the soundfont is loaded, then runs `action`. If already loaded it
   * runs synchronously; otherwise it enqueues the action and (only on the FIRST
   * in-flight request) kicks off the lazy fetch — the `soundFontLoaded` handler
   * dispatches every queued action. The in-flight guard means a rapid second
   * Play/export can't fire a duplicate `loadSoundFontFromUrl` (H1/M7); a
   * timeout guards against the load never resolving (H2 fallback).
   */
  const withSoundFont = useCallback(
    (action: () => void) => {
      const api = apiRef.current;
      if (!api) return;
      if (soundFontLoadedRef.current) {
        action();
        return;
      }
      pendingActionsRef.current.push(action);
      setSoundFontError(null);
      if (soundFontLoadingRef.current) return; // a fetch is already in flight
      soundFontLoadingRef.current = true;
      setSoundFontLoading(true);
      // Subscribe to the soundfont load-FAILURE signal (H2). alphaTab exposes it
      // on the player (not the public api), and the audio backend is reliably
      // initialized by first-Play time (the score has already rendered, so
      // `api.player` is non-null). This is the earliest point we can catch a
      // load failure: `playerReady` only fires after a SUCCESSFUL load, so it
      // would never see the first load fail. If `api.player` is somehow still
      // null, the timeout below is the fallback.
      const player = api.player;
      if (player && !soundFontFailSubscribedRef.current) {
        soundFontFailSubscribedRef.current = true;
        player.soundFontLoadFailed.on((error) => {
          if (cancelledRef.current) return;
          console.warn("[GuitarProViewer] soundfont load failed", error);
          failSoundFont();
        });
      }
      if (soundFontTimeoutRef.current !== null) clearTimeout(soundFontTimeoutRef.current);
      soundFontTimeoutRef.current = setTimeout(() => {
        console.warn("[GuitarProViewer] soundfont load timed out");
        failSoundFont();
      }, SOUNDFONT_LOAD_TIMEOUT_MS);
      api.loadSoundFontFromUrl(SOUNDFONT_URL, false);
    },
    [failSoundFont]
  );

  const handlePlayPause = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    if (isPlaying) {
      api.pause();
      return;
    }
    // Starting playback: the click itself resumes the AudioContext (autoplay
    // policy). First play also triggers the lazy soundfont load; the actual
    // `api.play()` runs from the `playerReady` dispatch once the player is ready.
    withSoundFont(() => {
      // `play()` returns false only when the player isn't ready or is already
      // playing. We dispatch this from `playerReady`, so "not ready" shouldn't
      // occur — but log a non-start rather than swallowing it silently.
      if (!api.play()) {
        console.warn("[GuitarProViewer] play() did not start the player (not ready or already playing)");
      }
    });
  }, [isPlaying, withSoundFont]);

  const handleStop = useCallback(() => {
    apiRef.current?.stop();
  }, []);

  const handleSeek = useCallback((value: number) => {
    const api = apiRef.current;
    setSeekValue(value);
    if (!api || endTimeMs <= 0) return;
    api.timePosition = (value / SEEK_RESOLUTION) * endTimeMs;
  }, [endTimeMs]);

  const applyTempo = useCallback((nextPercent: number) => {
    const clamped = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, nextPercent));
    setTempoPercent(clamped);
    tempoPercentRef.current = clamped;
    const api = apiRef.current;
    if (api) api.playbackSpeed = percentToSpeed(clamped);
  }, []);

  const toggleMetronome = useCallback(() => {
    const api = apiRef.current;
    setMetronomeOn((prev) => {
      const next = !prev;
      if (api) api.metronomeVolume = next ? 1 : 0;
      return next;
    });
  }, []);

  const toggleCountIn = useCallback(() => {
    const api = apiRef.current;
    setCountInOn((prev) => {
      const next = !prev;
      if (api) api.countInVolume = next ? 1 : 0;
      return next;
    });
  }, []);

  const toggleMute = useCallback((index: number) => {
    const api = apiRef.current;
    const track = scoreRef.current?.tracks[index];
    if (!api || !track) return;
    setMixer((prev) => {
      const current = prev[index] ?? DEFAULT_MIXER_CHANNEL;
      const nextMute = !current.mute;
      api.changeTrackMute([track], nextMute);
      return { ...prev, [index]: { ...current, mute: nextMute } };
    });
  }, []);

  const toggleSolo = useCallback((index: number) => {
    const api = apiRef.current;
    const track = scoreRef.current?.tracks[index];
    if (!api || !track) return;
    setMixer((prev) => {
      const current = prev[index] ?? DEFAULT_MIXER_CHANNEL;
      const nextSolo = !current.solo;
      api.changeTrackSolo([track], nextSolo);
      return { ...prev, [index]: { ...current, solo: nextSolo } };
    });
  }, []);

  const setChannelVolume = useCallback((index: number, volume: number) => {
    const api = apiRef.current;
    const track = scoreRef.current?.tracks[index];
    if (!api || !track) return;
    api.changeTrackVolume([track], volume);
    setMixer((prev) => {
      const current = prev[index] ?? DEFAULT_MIXER_CHANNEL;
      return { ...prev, [index]: { ...current, volume } };
    });
  }, []);

  /** Applies (or clears) the bar-range loop from the current bar inputs. */
  const applyLoop = useCallback(
    (enabled: boolean) => {
      const api = apiRef.current;
      if (!api) return false;
      if (!enabled) {
        api.isLooping = false;
        api.playbackRange = null;
        loopRangeRef.current = null;
        setLoopEnabled(false);
        return true;
      }
      const range = barRangeToTicks(barTimingsRef.current, loopStartBar - 1, loopEndBar - 1);
      if (!range) return false;
      api.playbackRange = { startTick: range.startTick, endTick: range.endTick };
      api.isLooping = true;
      loopRangeRef.current = range;
      prevTickRef.current = -1;
      setLoopEnabled(true);
      return true;
    },
    [loopStartBar, loopEndBar]
  );

  const toggleLoop = useCallback(() => {
    if (loopEnabled) {
      applyLoop(false);
      // A loop is the trainer's substrate; clearing it stops the trainer too.
      if (trainerEnabledRef.current) {
        trainerEnabledRef.current = false;
        setTrainerEnabled(false);
        applyTempo(tempoPercentRef.current);
      }
    } else {
      applyLoop(true);
    }
  }, [loopEnabled, applyLoop, applyTempo]);

  /** Enables/disables the auto-ramp speed trainer over the loop range. */
  const toggleTrainer = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    if (trainerEnabled) {
      trainerEnabledRef.current = false;
      setTrainerEnabled(false);
      const reset = resetSpeedTrainer(trainerConfigRef.current);
      trainerStateRef.current = reset;
      setTrainerState(reset);
      // Disabling the trainer returns to the (independent) master tempo.
      applyTempo(tempoPercentRef.current);
    } else {
      // The trainer needs a loop to count passes against; ensure one is set.
      if (!loopRangeRef.current) {
        if (!applyLoop(true)) return; // invalid bar range → can't start
      }
      const initial = initSpeedTrainer(trainerConfigRef.current);
      trainerStateRef.current = initial;
      setTrainerState(initial);
      trainerEnabledRef.current = true;
      setTrainerEnabled(true);
      prevTickRef.current = -1;
      api.playbackSpeed = percentToSpeed(initial.currentPercent);
    }
  }, [trainerEnabled, applyLoop, applyTempo]);

  const updateTrainerConfig = useCallback((patch: Partial<SpeedTrainerConfig>) => {
    setTrainerConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const runWavExport = useCallback(() => {
    const api = apiRef.current;
    if (!api || wavRendering) return;
    setExportOpen(false);
    exportTriggerRef.current?.focus();
    setWavRendering(true);
    setWavProgress(0);
    // Ensure the soundfont is loaded so the offline render produces audio.
    withSoundFont(() => {
      void (async () => {
        let exporter: GpAudioExporter | null = null;
        // BUG-2 fix: track the object URL so `finally` can always revoke it. If
        // anything after `createObjectURL` (e.g. `anchor.click()`) throws, an
        // inline revoke would be skipped and leak the URL for the page lifetime.
        let objectUrl: string | null = null;
        let downloadTriggered = false;
        try {
          // alphaTab's exporter emits fixed interleaved stereo; there is no
          // `channels` option to pass (see EXPORT_CHANNELS). Only sampleRate +
          // masterVolume are configurable here.
          exporter = await api.exportAudio({ sampleRate: EXPORT_SAMPLE_RATE, masterVolume: 1 });
          const chunks: Float32Array[] = [];
          let longDurationWarned = false;
          for (;;) {
            if (cancelledRef.current) return;
            const chunk = await exporter.render(1000);
            if (!chunk) break;
            chunks.push(chunk.samples);
            if (chunk.endTime > 0) {
              setWavProgress(Math.min(1, chunk.currentTime / chunk.endTime));
              // M5: warn (once) on very long exports whose accumulation can run
              // to hundreds of MB. We proceed rather than truncating audio.
              if (!longDurationWarned && chunk.endTime > WAV_EXPORT_WARN_DURATION_MS) {
                longDurationWarned = true;
                console.warn(
                  `[GuitarProViewer] WAV export is long (~${Math.round(chunk.endTime / 60000)} min); ` +
                    "audio accumulates fully in memory before encoding."
                );
              }
            }
          }
          if (cancelledRef.current) return;

          const all = concatFloat32(chunks);
          // M5: free the per-chunk accumulation as soon as it's merged so only
          // one copy of the PCM is held while we encode.
          chunks.length = 0;
          const blob = encodeWavBlob(all, { sampleRate: EXPORT_SAMPLE_RATE, channels: EXPORT_CHANNELS });
          objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = objectUrl;
          anchor.download = `${title || "guitar-pro-score"}.wav`;
          document.body.appendChild(anchor);
          anchor.click();
          downloadTriggered = true;
          anchor.remove();
        } catch (error) {
          console.warn("[GuitarProViewer] WAV export failed", error);
        } finally {
          exporter?.destroy();
          if (objectUrl !== null) {
            if (downloadTriggered) {
              // Let the browser begin its normal desktop/mobile download flow
              // before releasing the generated file.
              const completedDownloadUrl = objectUrl;
              window.setTimeout(() => URL.revokeObjectURL(completedDownloadUrl), WAV_DOWNLOAD_URL_REVOKE_DELAY_MS);
            } else {
              // Nothing can consume this URL if preparation or the click fails.
              URL.revokeObjectURL(objectUrl);
            }
          }
          if (!cancelledRef.current) {
            setWavRendering(false);
            setWavProgress(0);
          }
        }
      })();
    });
  }, [wavRendering, withSoundFont, title]);

  const handlePrint = useCallback(() => {
    setExportOpen(false);
    exportTriggerRef.current?.focus();
    apiRef.current?.print();
  }, []);

  const handleDownloadMidi = useCallback(() => {
    setExportOpen(false);
    exportTriggerRef.current?.focus();
    apiRef.current?.downloadMidi();
  }, []);

  const closeExport = useCallback(() => setExportOpen(false), []);
  const closeExportAndFocus = useCallback(() => {
    setExportOpen(false);
    exportTriggerRef.current?.focus();
  }, []);
  const closeTrainer = useCallback(() => setTrainerOpen(false), []);
  const exportRef = useDismissable(exportOpen, closeExport, exportTriggerRef);
  const trainerRef = useDismissable(trainerOpen, closeTrainer, trainerTriggerRef);

  const href = downloadUrl ?? src;
  const subtitle = tracks.length ? `${tracks.length} track${tracks.length === 1 ? "" : "s"}` : "Guitar Pro";
  // Score-interaction controls are only meaningful once a score has rendered.
  // Gating them also prevents calling into the alphaTab instance after an error
  // (when it may be mid-teardown), which would otherwise throw in a click handler.
  const ready = status === "ready";
  // BUG-1 fix (playerReady deadlock): Play must be reachable as soon as the
  // SCORE has rendered. alphaTab's `playerReady` only fires once a soundfont is
  // present (isReady && isSoundFontLoaded && isMidiLoaded), and we load the
  // soundfont LAZILY on the first Play — so gating Play on `playerReady` (the
  // old `canPlay`) deadlocked: the very button that loads the soundfont was
  // disabled until the soundfont already existed. Play now enables at `ready`;
  // its first click kicks off the lazy load, and the deferred play/export
  // dispatch from the `playerReady` event once the load completes.
  const canPlay = ready;
  // Controls that need the LIVE player subsystem (position, transport, looping,
  // and the synth settings below) stay gated on `playerReady`, which becomes
  // reachable right after the first Play loads the soundfont.
  const canTransport = ready && playerReady;
  // Metronome / count-in / master tempo are synth settings alphaTab only honors
  // once the player is ready, so they follow `canTransport` (usable after the
  // first Play). Mixer mute/solo/volume are handled separately: they buffer
  // channel state on the always-present player wrapper, so they enable at
  // score-`ready` (see their own `disabled` gates) without waiting on playback.
  const canTempo = canTransport && !trainerEnabled;
  const canLoop = canTransport && barTimingsRef.current.length > 0;
  const readyLabel = ready
    ? `Guitar Pro score${title ? `: ${title}` : ""}${tracks[selectedTrack]?.name ? `, ${tracks[selectedTrack].name}` : ""}`
    : undefined;

  const displayCurrentMs =
    isScrubbingRef.current && endTimeMs > 0 ? (seekValue / SEEK_RESOLUTION) * endTimeMs : currentTimeMs;
  const seekPct = endTimeMs > 0 ? (seekValue / SEEK_RESOLUTION) * 100 : 0;

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

        <div className={styles.exportWrap} ref={exportRef}>
          <button
            type="button"
            ref={exportTriggerRef}
            className={styles.linkBtn}
            aria-expanded={exportOpen}
            disabled={!ready || wavRendering}
            onClick={() => setExportOpen((prev) => !prev)}
          >
            {wavRendering ? (
              <>Rendering… {Math.round(wavProgress * 100)}%</>
            ) : (
              <>
                Export
                <ChevronDown size={14} aria-hidden />
              </>
            )}
          </button>
          {wavRendering ? (
            <div className={styles.wavProgress} role="progressbar" aria-label="Rendering WAV" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(wavProgress * 100)}>
              <span className={styles.wavProgressFill} style={{ width: `${Math.round(wavProgress * 100)}%` }} />
            </div>
          ) : null}
          {exportOpen ? (
            // U6: a plain disclosure list of action buttons (natural Tab order),
            // NOT a role="menu" — so no roving-tabindex/arrow-key contract to
            // honor. The trigger's aria-expanded conveys the open state.
            <div className={styles.exportDropdown} role="group" aria-label="Export options">
              <button type="button" className={styles.exportItem} onClick={handlePrint}>
                <Printer size={16} aria-hidden /> PDF · Print
              </button>
              <button type="button" className={styles.exportItem} onClick={handleDownloadMidi}>
                <CircleDot size={16} aria-hidden /> MIDI
              </button>
              <button
                type="button"
                className={styles.exportItem}
                onClick={runWavExport}
                disabled={wavRendering}
              >
                <AudioWaveform size={16} aria-hidden /> WAV
              </button>
              <a className={styles.exportItem} href={href} download onClick={closeExportAndFocus}>
                <FileText size={16} aria-hidden /> Download
              </a>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.rail} role="group" aria-label="Tracks">
          <span className={styles.railHeading}>Tracks</span>
          {tracks.map((track, index) => {
            const Icon = laneIconFor(track.name);
            const active = index === selectedTrack;
            const channel = channelFor(index);
            return (
              <div
                key={`${track.index}-${track.name}`}
                className={styles.lane}
                data-active={active}
                data-muted={channel.mute}
              >
                <button
                  type="button"
                  className={styles.laneMain}
                  aria-pressed={active}
                  disabled={!ready}
                  onClick={() => selectTrack(index)}
                >
                  <span className={styles.laneIcon}>
                    <Icon size={16} aria-hidden />
                  </span>
                  <span className={styles.laneCopy}>
                    <span className={styles.laneName}>
                      {track.name || `Track ${index + 1}`}
                      {channel.mute ? <span className={styles.mutedBadge}>Muted</span> : null}
                    </span>
                    <span className={styles.laneMeta}>Track {index + 1}</span>
                  </span>
                </button>
                <div className={styles.mixerRow}>
                  <button
                    type="button"
                    className={`${styles.chip} ${styles.chipMute}`}
                    aria-pressed={channel.mute}
                    aria-label={`Mute ${track.name || `track ${index + 1}`}`}
                    disabled={!ready}
                    onClick={() => toggleMute(index)}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    className={`${styles.chip} ${styles.chipSolo}`}
                    aria-pressed={channel.solo}
                    aria-label={`Solo ${track.name || `track ${index + 1}`}`}
                    disabled={!ready}
                    onClick={() => toggleSolo(index)}
                  >
                    S
                  </button>
                  <input
                    type="range"
                    className={styles.miniVol}
                    min={0}
                    max={1}
                    step={0.01}
                    value={channel.volume}
                    disabled={!ready}
                    aria-label={`Volume for ${track.name || `track ${index + 1}`}`}
                    onChange={(event) => setChannelVolume(index, Number(event.target.value))}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.stage} ref={stageRef}>
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

      {/* ---- Bottom transport strip (Variant A) ---- */}
      <div className={styles.transportBar} role="group" aria-label="Playback transport">
        {/* U9: visually-hidden polite live region announcing the transient
            soundfont-loading and WAV-rendering states (no role="status" so it
            doesn't collide with the loading/error overlays' status roles). */}
        <div className={styles.srStatus} aria-live="polite">
          {soundFontLoading
            ? "Loading playback sound…"
            : wavRendering
              ? `Rendering audio, ${Math.round(wavProgress * 100)} percent complete`
              : ""}
        </div>
        <div className={styles.transportLeft}>
          <button
            type="button"
            className={styles.playBtn}
            onClick={handlePlayPause}
            disabled={!canPlay}
            aria-label={soundFontLoading ? "Loading sound…" : isPlaying ? "Pause" : "Play"}
          >
            {soundFontLoading ? (
              <span className={styles.playLoading} aria-hidden />
            ) : isPlaying ? (
              <PauseGlyph />
            ) : (
              <PlayGlyph />
            )}
          </button>
          <button
            type="button"
            className={styles.stopBtn}
            onClick={handleStop}
            disabled={!canTransport}
            aria-label="Stop"
          >
            <StopGlyph />
          </button>
          {soundFontError ? (
            <p className={styles.soundFontError} role="alert">
              {soundFontError}
            </p>
          ) : null}
        </div>

        <div className={styles.timelineWrap}>
          <input
            type="range"
            className={styles.timeline}
            min={0}
            max={SEEK_RESOLUTION}
            step={1}
            value={seekValue}
            disabled={!canTransport || endTimeMs <= 0}
            aria-label="Seek"
            // The filled portion is painted on the (thin) track via this var so
            // the input itself can be a 44px-tall touch target (U10) without a
            // thick visual bar.
            style={{ "--seek-fill": `${seekPct}%` } as CSSProperties}
            onPointerDown={() => {
              isScrubbingRef.current = true;
            }}
            onPointerUp={() => {
              isScrubbingRef.current = false;
            }}
            onChange={(event) => handleSeek(Number(event.target.value))}
          />
          <div className={styles.timeReadout} aria-hidden>
            <span className={styles.timeCur}>{formatTime(displayCurrentMs)}</span>
            <span className={styles.timeTot}>{formatTime(endTimeMs)}</span>
          </div>
        </div>

        <div className={styles.transportRight}>
          <div className={styles.tempoControl} role="group" aria-label="Tempo">
            <span className={styles.tempoLabel}>Tempo</span>
            <button
              type="button"
              className={styles.tempoBtn}
              onClick={() => applyTempo(tempoPercent - TEMPO_STEP)}
              disabled={!canTempo || tempoPercent <= TEMPO_MIN}
              aria-label="Slower"
            >
              <Minus size={14} aria-hidden />
            </button>
            <span className={styles.tempoValue} aria-live="polite">
              {tempoPercent}%
            </span>
            <button
              type="button"
              className={styles.tempoBtn}
              onClick={() => applyTempo(tempoPercent + TEMPO_STEP)}
              disabled={!canTempo || tempoPercent >= TEMPO_MAX}
              aria-label="Faster"
            >
              <Plus size={14} aria-hidden />
            </button>
          </div>

          <button
            type="button"
            className={styles.toggleChip}
            aria-pressed={metronomeOn}
            disabled={!canTransport}
            onClick={toggleMetronome}
            aria-label="Metronome"
          >
            <MetronomeGlyph />
          </button>
          <button
            type="button"
            className={styles.toggleChip}
            aria-pressed={countInOn}
            disabled={!canTransport}
            onClick={toggleCountIn}
            aria-label="Count-in"
          >
            <CountInGlyph />
            <span className={styles.chipText}>In</span>
          </button>

          <div className={styles.trainerWrap} ref={trainerRef}>
            <button
              type="button"
              ref={trainerTriggerRef}
              className={`${styles.iconBtn} ${styles.trainerBtn}`}
              data-open={trainerOpen}
              aria-expanded={trainerOpen}
              disabled={!canLoop}
              onClick={() => setTrainerOpen((prev) => !prev)}
            >
              <Repeat2 size={15} aria-hidden />
              <span className={styles.chipText}>Trainer</span>
            </button>

            {trainerOpen ? (
              // U5: a non-modal disclosure popover (Escape / outside-click close,
              // focus not trapped), NOT role="dialog" — which would demand
              // initial-focus + a focus trap this lightweight popover doesn't need.
              <div className={styles.popover}>
                <div className={styles.trainerHead}>
                  <span className={styles.trainerTitle}>
                    <Repeat2 size={13} aria-hidden /> Speed Trainer
                  </span>
                  <span className={styles.passBadge}>Pass {trainerState.passCount}</span>
                </div>

                <div className={styles.loopRow}>
                  <label className={styles.loopField}>
                    <span>From bar</span>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={1}
                      max={Math.max(1, totalBars)}
                      value={loopStartBar}
                      disabled={!canLoop}
                      onChange={(event) =>
                        setLoopStartBar(
                          Math.min(Math.max(1, Number(event.target.value) || 1), Math.max(1, totalBars))
                        )
                      }
                    />
                  </label>
                  <label className={styles.loopField}>
                    <span>To bar</span>
                    <input
                      type="number"
                      className={styles.numInput}
                      min={1}
                      max={Math.max(1, totalBars)}
                      value={loopEndBar}
                      disabled={!canLoop}
                      onChange={(event) =>
                        setLoopEndBar(
                          Math.min(Math.max(1, Number(event.target.value) || 1), Math.max(1, totalBars))
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.loopToggle}
                    aria-pressed={loopEnabled}
                    disabled={!canLoop}
                    onClick={toggleLoop}
                  >
                    {loopEnabled ? "Clear" : "Set loop"}
                  </button>
                </div>

                <div className={styles.statGrid}>
                  <label className={styles.statCell}>
                    <span className={styles.statLbl}>Start</span>
                    <input
                      type="number"
                      className={styles.statInput}
                      min={1}
                      max={200}
                      value={trainerConfig.startPercent}
                      disabled={trainerEnabled}
                      onChange={(event) =>
                        updateTrainerConfig({
                          startPercent: Math.min(200, Math.max(1, Number(event.target.value) || 1))
                        })
                      }
                    />
                  </label>
                  <label className={styles.statCell}>
                    <span className={styles.statLbl}>Step</span>
                    <input
                      type="number"
                      className={styles.statInput}
                      min={1}
                      max={100}
                      value={trainerConfig.stepPercent}
                      disabled={trainerEnabled}
                      onChange={(event) =>
                        updateTrainerConfig({
                          stepPercent: Math.min(100, Math.max(1, Number(event.target.value) || 1))
                        })
                      }
                    />
                  </label>
                  <label className={styles.statCell}>
                    <span className={styles.statLbl}>Ceiling</span>
                    <input
                      type="number"
                      className={styles.statInput}
                      min={1}
                      max={200}
                      value={trainerConfig.ceilingPercent}
                      disabled={trainerEnabled}
                      onChange={(event) =>
                        updateTrainerConfig({
                          ceilingPercent: Math.min(200, Math.max(1, Number(event.target.value) || 1))
                        })
                      }
                    />
                  </label>
                </div>

                <div className={styles.nowRow}>
                  <span className={styles.nowLabel}>Now</span>
                  <span className={styles.nowVal}>{trainerState.currentPercent}%</span>
                </div>
                <div className={styles.nowBar}>
                  <span
                    className={styles.nowBarFill}
                    style={{ width: `${Math.min(100, trainerState.currentPercent)}%` }}
                  />
                </div>

                <button
                  type="button"
                  className={styles.trainerToggle}
                  aria-pressed={trainerEnabled}
                  disabled={!canLoop}
                  onClick={toggleTrainer}
                >
                  {trainerEnabled ? "Stop trainer" : "Start trainer"}
                </button>
              </div>
            ) : null}
          </div>
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
