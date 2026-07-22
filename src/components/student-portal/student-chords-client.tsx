"use client";

import { useRouter } from "next/navigation";
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Sampler } from "tone";

import { getPlayableChordNotes } from "@/lib/chords/chord-preview";
import {
  buildChordPreviewPlaybackPlan,
  ensureChordPreviewSamplerReady,
  getChordPreviewSampler,
  getToneModule
} from "@/lib/chords/chord-preview-sampler";
import { ALL_ROOT_NOTES, CHORD_QUALITIES } from "@/lib/chords/music-theory";
import { renderChordSvg } from "@/lib/chords/chord-svg";
import type { ChordDiagramData } from "@/lib/chords/chord-types";
import {
  buildChordProgressionSchedule,
  chordRangeToLoopTime,
  tempoForLoopPass
} from "@/lib/chords/progression-player";

import styles from "./student-chords-client.module.css";

const MIN_TEMPO_BPM = 40;
const MAX_TEMPO_BPM = 240;
const MIN_BARS_PER_CHORD = 1;
const MAX_BARS_PER_CHORD = 4;
// Fixed step for the "gradually speed up" ramp — one exposed target-tempo
// field reads better than a 4-input form for what is a practice nicety.
const SPEED_UP_INCREMENT_BPM = 5;

// Tracks the same cached Sampler the admin chord builder uses (one load, two
// consumers), so stopAllChordSound() can silence it synchronously without
// re-awaiting the loader.
let activeSampler: Sampler | null = null;

/**
 * Auditions one chord (AC-7) or one progression step (AC-8) through the
 * shared guitar-acoustic sampler — the same load/playback path as the admin
 * chord builder's block preview, extracted to
 * src/lib/chords/chord-preview-sampler.ts so both sides load the sample pack
 * once. Tone.js requires a user gesture before audio starts; every call here
 * originates from a click/keydown handler, so `Tone.start()` is always
 * inside that gesture.
 */
async function triggerChordSound(diagram: ChordDiagramData): Promise<void> {
  const notes = getPlayableChordNotes(diagram);
  if (notes.length === 0) {
    return;
  }

  try {
    const Tone = await getToneModule();
    await Tone.start();

    const sampler = ensureChordPreviewSamplerReady(await getChordPreviewSampler());
    activeSampler = sampler;

    const now = Tone.now() + 0.02;
    sampler.releaseAll(now);
    buildChordPreviewPlaybackPlan(notes, "block").forEach((note) => {
      sampler.triggerAttackRelease(note.note, note.durationSeconds, now + note.timeOffsetSeconds, note.velocity);
    });
  } catch {
    // No dedicated error UI here (AC-7/AC-8 don't call for one) — a sampler
    // that's still loading or failed to load just makes this click silent.
  }
}

/** Silences whatever is currently ringing; does not touch the loader cache. */
function stopAllChordSound(): void {
  activeSampler?.releaseAll();
}

type StudentChord = {
  id: string;
  name: string;
  root: string;
  quality: string;
  diagram: ChordDiagramData;
};

type StudentChordListResponse = {
  chords: StudentChord[];
  page: number;
  pageSize: number;
  total: number;
};

type StudentChordChart = {
  id: string;
  title: string;
  description: string | null;
};

type StudentChordChartItem = {
  chordId: string;
  sortOrder: number;
  annotation: string | null;
  chord: StudentChord;
};

type StudentChordChartDetail = StudentChordChart & {
  items: StudentChordChartItem[];
};

/**
 * Read-only chord library browser for students: search/filter the chord
 * list, audition any chord, and open charts to play their ordered
 * progression. No create, edit, save, delete or reorder affordance exists
 * anywhere here.
 */
export function StudentChordsClient(): ReactElement {
  const [view, setView] = useState<"chords" | "charts">("chords");

  return (
    <div className={styles["shell"]}>
      <nav className={styles["view-switch"]} aria-label="Chord library sections">
        <button
          type="button"
          className={cx("btn", "btn-secondary", styles["control"], view === "chords" && styles["view-switch-active"])}
          onClick={() => setView("chords")}
        >
          Browse chords
        </button>
        <button
          type="button"
          className={cx("btn", "btn-secondary", styles["control"], view === "charts" && styles["view-switch-active"])}
          onClick={() => setView("charts")}
        >
          Chord charts
        </button>
      </nav>

      {view === "chords" ? <ChordBrowser /> : <ChordChartsBrowser />}
    </div>
  );
}

/**
 * Search box plus root/quality filters over the paginated chord list.
 * Filters are sent as query params — the library can hold thousands of
 * voicings, so filtering client-side over the full set is not an option.
 */
function ChordBrowser(): ReactElement {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [root, setRoot] = useState("");
  const [quality, setQuality] = useState("");
  const [page, setPage] = useState(1);
  const [chords, setChords] = useState<StudentChord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Debounce the search box so every keystroke doesn't fire a request.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change starts back at page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, root, quality]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({ page: String(page) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (root) params.set("root", root);
      if (quality) params.set("quality", quality);

      const response = await fetch(`/api/student/chords?${params.toString()}`, { cache: "no-store" });
      if (response.status === 401) {
        router.push("/student/login");
        router.refresh();
        return;
      }
      if (cancelled) return;
      if (!response.ok) {
        setLoading(false);
        setError("Unable to load chords right now.");
        return;
      }

      const payload = (await response.json().catch(() => null)) as StudentChordListResponse | null;
      if (cancelled) return;
      if (!payload) {
        setLoading(false);
        setError("Unable to load chords right now.");
        return;
      }

      setChords((prev) => (page === 1 ? payload.chords : [...prev, ...payload.chords]));
      setTotal(payload.total);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, root, quality, page, router]);

  const hasMore = chords.length < total;

  return (
    <div className={cx("admin-card", styles["panel"])}>
      <div className={styles["filter-row"]}>
        <div className="field">
          <label htmlFor="chord-search">Search chords</label>
          <input
            id="chord-search"
            type="search"
            className={styles["control"]}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Chord name"
          />
        </div>
        <div className="field">
          <label htmlFor="chord-root-filter">Root</label>
          <select
            id="chord-root-filter"
            className={styles["control"]}
            value={root}
            onChange={(event) => setRoot(event.target.value)}
          >
            <option value="">All roots</option>
            {ALL_ROOT_NOTES.map((note) => (
              <option key={note} value={note}>{note}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="chord-quality-filter">Quality</label>
          <select
            id="chord-quality-filter"
            className={styles["control"]}
            value={quality}
            onChange={(event) => setQuality(event.target.value)}
          >
            <option value="">All qualities</option>
            {CHORD_QUALITIES.map((qualityOption) => (
              <option key={qualityOption} value={qualityOption}>{qualityOption}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="notice error" role="alert">{error}</p> : null}

      {loading && page === 1 ? (
        <p className="helper-text">Loading chords…</p>
      ) : !loading && chords.length === 0 && !error ? (
        <p className="helper-text">No chords match your search.</p>
      ) : (
        <div className={styles["chord-grid"]} aria-busy={loading}>
          {chords.map((chord) => (
            <ChordTile key={chord.id} chord={chord} />
          ))}
        </div>
      )}

      {hasMore ? (
        <button
          type="button"
          className={cx("btn", "btn-secondary", styles["control"], styles["load-more"])}
          onClick={() => setPage((current) => current + 1)}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load more chords"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Chart list plus a read-only detail view of one chart's ordered chords.
 */
function ChordChartsBrowser(): ReactElement {
  const router = useRouter();
  const [charts, setCharts] = useState<StudentChordChart[] | null>(null);
  const [chartsError, setChartsError] = useState("");

  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [chartDetail, setChartDetail] = useState<StudentChordChartDetail | null>(null);
  const [chartDetailLoading, setChartDetailLoading] = useState(false);
  const [chartDetailError, setChartDetailError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setChartsError("");
      const response = await fetch("/api/student/chord-charts", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/student/login");
        router.refresh();
        return;
      }
      if (cancelled) return;
      if (!response.ok) {
        setChartsError("Unable to load chord charts right now.");
        return;
      }
      const payload = (await response.json().catch(() => null)) as { charts: StudentChordChart[] } | null;
      if (cancelled) return;
      setCharts(payload?.charts ?? []);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedChartId) {
      setChartDetail(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setChartDetailLoading(true);
      setChartDetailError("");
      const response = await fetch(`/api/student/chord-charts/${selectedChartId}`, { cache: "no-store" });
      if (response.status === 401) {
        router.push("/student/login");
        router.refresh();
        return;
      }
      if (cancelled) return;
      if (!response.ok) {
        setChartDetailLoading(false);
        setChartDetailError("Unable to load this chart right now.");
        return;
      }
      const payload = (await response.json().catch(() => null)) as { chart: StudentChordChartDetail } | null;
      if (cancelled) return;
      setChartDetail(payload?.chart ?? null);
      setChartDetailLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedChartId, router]);

  if (selectedChartId) {
    return (
      <div className={cx("admin-card", styles["panel"])}>
        <button
          type="button"
          className={cx("btn", "btn-secondary", styles["control"])}
          onClick={() => setSelectedChartId(null)}
        >
          Back to charts
        </button>

        {chartDetailError ? <p className="notice error" role="alert">{chartDetailError}</p> : null}
        {chartDetailLoading ? <p className="helper-text">Loading chart…</p> : null}

        {!chartDetailLoading && chartDetail ? (
          <>
            <h2 className={styles["chart-title"]}>{chartDetail.title}</h2>
            {chartDetail.description ? <p className="helper-text">{chartDetail.description}</p> : null}
            {chartDetail.items.length === 0 ? (
              <p className="helper-text">This chart has no chords yet.</p>
            ) : (
              <ChordChartPlayer items={chartDetail.items} key={chartDetail.id} />
            )}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cx("admin-card", styles["panel"])}>
      {chartsError ? <p className="notice error" role="alert">{chartsError}</p> : null}
      {charts === null && !chartsError ? <p className="helper-text">Loading chord charts…</p> : null}
      {charts && charts.length === 0 ? <p className="helper-text">No chord charts are available yet.</p> : null}
      {charts && charts.length > 0 ? (
        <ul className={styles["chart-list"]}>
          {charts.map((chart) => (
            <li key={chart.id}>
              <button
                type="button"
                className={cx(styles["chart-row"], styles["control"])}
                onClick={() => setSelectedChartId(chart.id)}
              >
                <strong>{chart.title}</strong>
                {chart.description ? <span className="helper-text">{chart.description}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Read-only chart progression player (AC-8, AC-10): walks a chart's chords
 * in sortOrder at a client-only tempo/bars-per-chord, with a loop range and
 * a gradual speed-up ramp, highlighting whichever chord is currently
 * sounding. Keyed by chart id at the call site, so switching charts remounts
 * (and therefore cleanly stops) any playback in progress.
 *
 * Scheduling deliberately uses plain `setTimeout` per step rather than
 * scheduling the whole progression ahead on Tone's audio clock: a `stop()`
 * only has to bump a generation token and clear pending timeouts, so
 * cancellation on unmount/chart-switch/Stop can never leave an
 * already-queued future note that fires after playback should have ended.
 */
function ChordChartPlayer({ items }: { items: StudentChordChartItem[] }): ReactElement {
  const sortedItems = useMemo(() => [...items].sort((a, b) => a.sortOrder - b.sortOrder), [items]);
  const lastIndex = sortedItems.length - 1;

  const [tempoBpm, setTempoBpm] = useState(120);
  const [barsPerChord, setBarsPerChord] = useState(1);
  const [loopStartIndex, setLoopStartIndex] = useState(0);
  const [loopEndIndex, setLoopEndIndex] = useState(lastIndex);
  const [speedUpEnabled, setSpeedUpEnabled] = useState(false);
  const [targetTempoBpm, setTargetTempoBpm] = useState(160);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  // `playToken` invalidates any in-flight setTimeout callbacks the moment
  // stop() runs, even if clearTimeout somehow missed one; pendingTimeoutIds
  // is the actual cancellation mechanism.
  const playTokenRef = useRef(0);
  const pendingTimeoutIdsRef = useRef<number[]>([]);
  const passIndexRef = useRef(0);

  const stop = useCallback(() => {
    playTokenRef.current += 1;
    pendingTimeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
    pendingTimeoutIdsRef.current = [];
    setIsPlaying(false);
    setCurrentIndex(null);
    stopAllChordSound();
  }, []);

  // Stop cleanly on unmount — covers navigating away and (via the `key` at
  // the call site) switching to a different chart.
  useEffect(() => {
    return () => stop();
  }, [stop]);

  const play = useCallback(() => {
    stop();
    const token = ++playTokenRef.current;
    passIndexRef.current = 0;
    setIsPlaying(true);

    const runPass = () => {
      if (token !== playTokenRef.current) return;

      const bpm = speedUpEnabled
        ? tempoForLoopPass(
            { startBpm: tempoBpm, targetBpm: targetTempoBpm, incrementBpm: SPEED_UP_INCREMENT_BPM },
            passIndexRef.current
          )
        : tempoBpm;

      const schedule = buildChordProgressionSchedule(sortedItems, { bpm, barsPerChord });
      const loopRange = chordRangeToLoopTime(schedule, loopStartIndex, loopEndIndex);
      if (!loopRange) {
        stop();
        return;
      }

      schedule
        .filter((step) => step.startTime >= loopRange.startTime && step.startTime < loopRange.endTime)
        .forEach((step) => {
          const delayMs = (step.startTime - loopRange.startTime) * 1000;
          const id = window.setTimeout(() => {
            if (token !== playTokenRef.current) return;
            setCurrentIndex(step.index);
            void triggerChordSound(step.item.chord.diagram);
          }, delayMs);
          pendingTimeoutIdsRef.current.push(id);
        });

      const passDurationMs = (loopRange.endTime - loopRange.startTime) * 1000;
      const nextPassId = window.setTimeout(() => {
        if (token !== playTokenRef.current) return;
        passIndexRef.current += 1;
        runPass();
      }, passDurationMs);
      pendingTimeoutIdsRef.current.push(nextPassId);
    };

    runPass();
  }, [stop, speedUpEnabled, tempoBpm, targetTempoBpm, sortedItems, barsPerChord, loopStartIndex, loopEndIndex]);

  const currentItem = currentIndex !== null ? sortedItems[currentIndex] : null;

  return (
    <div className={styles["player"]}>
      <div className={styles["player-controls"]}>
        <div className="field">
          <label htmlFor="chart-tempo">Tempo (BPM)</label>
          <input
            id="chart-tempo"
            type="number"
            className={styles["control"]}
            min={MIN_TEMPO_BPM}
            max={MAX_TEMPO_BPM}
            value={tempoBpm}
            onChange={(event) => setTempoBpm(Number(event.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="chart-bars-per-chord">Bars per chord</label>
          <input
            id="chart-bars-per-chord"
            type="number"
            className={styles["control"]}
            min={MIN_BARS_PER_CHORD}
            max={MAX_BARS_PER_CHORD}
            value={barsPerChord}
            onChange={(event) => setBarsPerChord(Number(event.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="chart-loop-start">Loop from</label>
          <select
            id="chart-loop-start"
            className={styles["control"]}
            value={loopStartIndex}
            onChange={(event) => setLoopStartIndex(Number(event.target.value))}
          >
            {sortedItems.map((item, index) => (
              <option key={item.chordId} value={index}>{index + 1}. {item.chord.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="chart-loop-end">Loop to</label>
          <select
            id="chart-loop-end"
            className={styles["control"]}
            value={loopEndIndex}
            onChange={(event) => setLoopEndIndex(Number(event.target.value))}
          >
            {sortedItems.map((item, index) => (
              <option key={item.chordId} value={index}>{index + 1}. {item.chord.name}</option>
            ))}
          </select>
        </div>
      </div>

      <label className={styles["speed-up-row"]}>
        <input
          type="checkbox"
          checked={speedUpEnabled}
          onChange={(event) => setSpeedUpEnabled(event.target.checked)}
        />
        Gradually speed up
        {speedUpEnabled ? (
          <span className="field">
            <label htmlFor="chart-target-tempo">Target BPM</label>
            <input
              id="chart-target-tempo"
              type="number"
              className={styles["control"]}
              min={tempoBpm}
              max={MAX_TEMPO_BPM}
              value={targetTempoBpm}
              onChange={(event) => setTargetTempoBpm(Number(event.target.value))}
            />
          </span>
        ) : null}
      </label>

      <button
        type="button"
        className={cx("btn", isPlaying ? "btn-danger" : "btn-primary", styles["control"])}
        onClick={() => (isPlaying ? stop() : play())}
      >
        {isPlaying ? "Stop" : "Play"}
      </button>

      <p className={styles["player-status"]} role="status">
        {currentItem ? `Now playing: ${currentIndex! + 1} of ${sortedItems.length} — ${currentItem.chord.name}` : "Not playing"}
      </p>

      <ol className={styles["chart-item-list"]}>
        {sortedItems.map((item, index) => (
          <li className={styles["chart-item-row"]} key={item.chordId}>
            {item.annotation ? <span className={styles["chart-item-annotation"]}>{item.annotation}</span> : null}
            <ChordTile chord={item.chord} isActive={index === currentIndex} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Renders one chord's SVG diagram via the shared, student/admin-agnostic
 * chord-svg renderer plus a text name for accessibility and searchability.
 * Clicking (or Enter/Space) auditions the chord (AC-7).
 */
function ChordTile({ chord, isActive }: { chord: StudentChord; isActive?: boolean }): ReactElement {
  const svg = renderChordSvg(chord.diagram, { showTitle: true, showNoteNames: true });

  return (
    <div
      className={cx(styles["chord-tile"], isActive && styles["chord-tile-active"])}
      role="button"
      tabIndex={0}
      aria-label={`Play ${chord.name}`}
      onClick={() => void triggerChordSound(chord.diagram)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void triggerChordSound(chord.diagram);
        }
      }}
    >
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <span className={styles["chord-tile-name"]}>{chord.name}</span>
    </div>
  );
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
