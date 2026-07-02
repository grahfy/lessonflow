"use client";

/**
 * PracticeAudioPlayer — a custom audio transport built for practising along.
 *
 * Replaces the native `<audio controls>` element used for learning-material
 * previews. Beyond play / pause / seek it adds the two things a student drilling
 * a passage actually needs:
 *
 *   1. An A–B section loop. Set point A and point B on the timeline and the
 *      clip repeats just that passage. With the loop on but no A–B set, the whole
 *      track repeats.
 *   2. A fine speed control. Steps in 5% increments from 100% down to 50% and
 *      preserves pitch, so a slowed-down riff stays in tune.
 *
 * The A–B region is drawn directly onto the scrubber as a highlighted "practice
 * zone" so the passage being repeated is always visible.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Pause, Play, Minus, Plus, Repeat } from "lucide-react";

import styles from "./practice-audio-player.module.css";

type PracticeAudioPlayerProps = {
  src: string;
  className?: string;
};

const MIN_RATE = 0.5;
const MAX_RATE = 1;
const RATE_STEP = 0.05;

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

/** Formats seconds as m:ss, guarding against NaN before metadata loads. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Rounds a rate to a clean 5% step and clamps it to the allowed range. */
function clampRate(rate: number): number {
  const stepped = Math.round(rate / RATE_STEP) * RATE_STEP;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, Number(stepped.toFixed(2))));
}

/** Some browsers namespace the pitch-preservation flag; set whichever exists. */
function keepPitch(el: HTMLAudioElement): void {
  const anyEl = el as HTMLAudioElement & {
    preservesPitch?: boolean;
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  anyEl.preservesPitch = true;
  anyEl.mozPreservesPitch = true;
  anyEl.webkitPreservesPitch = true;
}

export function PracticeAudioPlayer({ src, className }: PracticeAudioPlayerProps): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const speedLabelId = useId();

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);

  const hasDuration = Number.isFinite(duration) && duration > 0;

  // Keep the audio element's playbackRate in sync (and hold pitch steady).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    keepPitch(audio);
    audio.playbackRate = rate;
  }, [rate]);

  // Sync any state the element already holds by mount. A local/cached file can
  // fire `loadedmetadata` before React attaches its listeners (hydration race),
  // which would otherwise leave the transport stuck at 0:00 with play disabled.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }
    setCurrentTime(audio.currentTime);
    setIsPlaying(!audio.paused);
  }, []);

  // The A–B loop needs the latest points inside the timeupdate handler without
  // re-binding the listener on every seek, so read them from a ref.
  const loopRef = useRef({ loopEnabled, pointA, pointB });
  loopRef.current = { loopEnabled, pointA, pointB };

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const { loopEnabled: on, pointA: a, pointB: b } = loopRef.current;
    if (on && a != null && b != null && b > a && audio.currentTime >= b) {
      audio.currentTime = a;
      setCurrentTime(a);
      return;
    }
    setCurrentTime(audio.currentTime);
  }, []);

  const handleEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const { loopEnabled: on, pointA: a } = loopRef.current;
    if (on) {
      audio.currentTime = a ?? 0;
      void audio.play();
      return;
    }
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const seekTo = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio || !hasDuration) return;
      const clamped = Math.min(duration, Math.max(0, time));
      audio.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [duration, hasDuration]
  );

  // Pointer-based scrubbing on the custom timeline.
  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = scrubberRef.current;
      if (!el || !hasDuration) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      seekTo(ratio * duration);
    },
    [duration, hasDuration, seekTo]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      seekFromPointer(event.clientX);
    },
    [seekFromPointer]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        seekFromPointer(event.clientX);
      }
    },
    [seekFromPointer]
  );

  const handleScrubberKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!hasDuration) return;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowUp":
          event.preventDefault();
          seekTo(currentTime + 5);
          break;
        case "ArrowLeft":
        case "ArrowDown":
          event.preventDefault();
          seekTo(currentTime - 5);
          break;
        case "Home":
          event.preventDefault();
          seekTo(0);
          break;
        case "End":
          event.preventDefault();
          seekTo(duration);
          break;
        default:
          break;
      }
    },
    [currentTime, duration, hasDuration, seekTo]
  );

  const setA = useCallback(() => {
    setPointA(currentTime);
    // Keep B ahead of A; drop it if the new A overtakes it.
    setPointB((prev) => (prev != null && prev <= currentTime ? null : prev));
  }, [currentTime]);

  const setB = useCallback(() => {
    if (pointA == null) {
      // Anchor A first so B always has something to loop back to.
      setPointA(0);
      setPointB(currentTime > 0 ? currentTime : null);
      return;
    }
    if (currentTime > pointA) {
      setPointB(currentTime);
    }
  }, [currentTime, pointA]);

  const clearLoopPoints = useCallback(() => {
    setPointA(null);
    setPointB(null);
  }, []);

  const changeRate = useCallback((delta: number) => {
    setRate((prev) => clampRate(prev + delta));
  }, []);

  const progressPct = hasDuration ? (currentTime / duration) * 100 : 0;
  const aPct = hasDuration && pointA != null ? (pointA / duration) * 100 : null;
  const bPct = hasDuration && pointB != null ? (pointB / duration) * 100 : null;
  const zoneActive = loopEnabled && aPct != null && bPct != null;
  const speedPct = Math.round(rate * 100);

  return (
    <div className={cx(styles.player, className)} data-testid="practice-audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          keepPitch(audio);
          audio.playbackRate = rate;
          setDuration(audio.duration);
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
      />

      <div className={styles.transport}>
        <button
          type="button"
          className={styles.playButton}
          onClick={togglePlay}
          disabled={!hasDuration}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>

        <div
          ref={scrubberRef}
          className={styles.scrubber}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onKeyDown={handleScrubberKeyDown}
        >
          <div className={styles.track}>
            {aPct != null && bPct != null ? (
              <div
                className={cx(styles.zone, zoneActive && styles.zoneActive)}
                style={{ left: `${aPct}%`, width: `${Math.max(0, bPct - aPct)}%` }}
              />
            ) : null}
            <div className={styles.fill} style={{ width: `${progressPct}%` }} />
            {aPct != null ? (
              <span className={styles.flag} style={{ left: `${aPct}%` }} aria-hidden="true">
                A
              </span>
            ) : null}
            {bPct != null ? (
              <span className={cx(styles.flag, styles.flagB)} style={{ left: `${bPct}%` }} aria-hidden="true">
                B
              </span>
            ) : null}
            <span className={styles.playhead} style={{ left: `${progressPct}%` }} aria-hidden="true" />
          </div>
        </div>

        <span className={styles.time}>
          {formatTime(currentTime)}
          <span className={styles.sep}>/</span>
          {formatTime(duration)}
        </span>
      </div>

      <div className={styles.controls}>
        <div className={styles.loopGroup}>
          <button
            type="button"
            className={cx(styles.ctrl, styles.loopToggle, loopEnabled && styles.active)}
            onClick={() => setLoopEnabled((prev) => !prev)}
            aria-pressed={loopEnabled}
            title={
              pointA != null && pointB != null
                ? "Repeat the A–B section"
                : "Repeat the whole track"
            }
          >
            <Repeat size={13} />
            Loop
          </button>
          <button
            type="button"
            className={cx(styles.ctrl, pointA != null && styles.setActive)}
            onClick={setA}
            disabled={!hasDuration}
            title="Set the loop start to the current position"
          >
            {pointA != null ? `A ${formatTime(pointA)}` : "Set A"}
          </button>
          <button
            type="button"
            className={cx(styles.ctrl, pointB != null && styles.setActive)}
            onClick={setB}
            disabled={!hasDuration}
            title="Set the loop end to the current position"
          >
            {pointB != null ? `B ${formatTime(pointB)}` : "Set B"}
          </button>
          <button
            type="button"
            className={styles.ctrl}
            onClick={clearLoopPoints}
            disabled={pointA == null && pointB == null}
            title="Clear the A–B loop"
          >
            Clear
          </button>
        </div>

        <div className={styles.speedGroup}>
          <span className={styles.srOnly} id={speedLabelId}>
            Playback speed
          </span>
          <div className={styles.speedStepper} role="group" aria-labelledby={speedLabelId}>
            <button
              type="button"
              className={styles.speedBtn}
              onClick={() => changeRate(-RATE_STEP)}
              disabled={rate <= MIN_RATE}
              aria-label="Slow down"
            >
              <Minus size={14} />
            </button>
            <span
              className={cx(styles.speedValue, rate < 1 && styles.slowed)}
              aria-live="polite"
            >
              {speedPct}%
            </span>
            <button
              type="button"
              className={styles.speedBtn}
              onClick={() => changeRate(RATE_STEP)}
              disabled={rate >= MAX_RATE}
              aria-label="Speed up"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PracticeAudioPlayer;
