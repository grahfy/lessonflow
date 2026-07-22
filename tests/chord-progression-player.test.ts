// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  buildChordProgressionSchedule,
  chordRangeToLoopTime,
  DEFAULT_BARS_PER_CHORD,
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_TEMPO_BPM,
  tempoForLoopPass,
  type ChordTiming
} from "@/lib/chords/progression-player";

describe("buildChordProgressionSchedule", () => {
  it("returns an empty schedule for an empty progression", () => {
    expect(buildChordProgressionSchedule([], { bpm: 120 })).toEqual([]);
  });

  it("returns an empty schedule for a missing item list", () => {
    expect(buildChordProgressionSchedule(undefined as unknown as string[], { bpm: 120 })).toEqual([]);
  });

  it("schedules a single-chord progression at bar 0 with the default bars/beats", () => {
    const schedule = buildChordProgressionSchedule(["C"], { bpm: 120 });
    // 4 beats/bar * 1 bar/chord * 60/120 s/beat = 2s
    expect(schedule).toEqual([{ item: "C", index: 0, startTime: 0, duration: 2 }]);
  });

  it("schedules chords back-to-back with no gaps, in order", () => {
    const schedule = buildChordProgressionSchedule(["C", "G", "Am", "F"], { bpm: 120 });
    expect(schedule.map((entry) => entry.item)).toEqual(["C", "G", "Am", "F"]);
    expect(schedule.map((entry) => entry.startTime)).toEqual([0, 2, 4, 6]);
    expect(schedule.every((entry) => entry.duration === 2)).toBe(true);
  });

  it("honors a custom tempo and bars-per-chord", () => {
    const schedule = buildChordProgressionSchedule(["C", "G"], { bpm: 60, beatsPerBar: 3, barsPerChord: 2 });
    // 3 beats/bar * 2 bars/chord * 60/60 s/beat = 6s per chord
    expect(schedule).toEqual([
      { item: "C", index: 0, startTime: 0, duration: 6 },
      { item: "G", index: 1, startTime: 6, duration: 6 }
    ]);
  });

  it("falls back to the default tempo for zero or negative BPM", () => {
    const zero = buildChordProgressionSchedule(["C"], { bpm: 0 });
    const negative = buildChordProgressionSchedule(["C"], { bpm: -100 });
    const expectedDuration = (60 / DEFAULT_TEMPO_BPM) * DEFAULT_BEATS_PER_BAR * DEFAULT_BARS_PER_CHORD;
    expect(zero[0].duration).toBe(expectedDuration);
    expect(negative[0].duration).toBe(expectedDuration);
  });

  it("falls back to the default tempo for a non-finite BPM", () => {
    const schedule = buildChordProgressionSchedule(["C"], { bpm: Number.NaN });
    expect(schedule[0].duration).toBe((60 / DEFAULT_TEMPO_BPM) * DEFAULT_BEATS_PER_BAR * DEFAULT_BARS_PER_CHORD);
  });

  it("falls back to default beats-per-bar and bars-per-chord when invalid", () => {
    const schedule = buildChordProgressionSchedule(["C"], { bpm: 120, beatsPerBar: 0, barsPerChord: -1 });
    expect(schedule[0].duration).toBe((60 / 120) * DEFAULT_BEATS_PER_BAR * DEFAULT_BARS_PER_CHORD);
  });

  it("total schedule duration equals items x bars x beats x (60/bpm)", () => {
    const bpm = 90;
    const beatsPerBar = 4;
    const barsPerChord = 2;
    const items = ["C", "G", "Am", "F", "Dm"];
    const schedule = buildChordProgressionSchedule(items, { bpm, beatsPerBar, barsPerChord });

    const last = schedule[schedule.length - 1];
    const totalDuration = last.startTime + last.duration;
    const expected = items.length * barsPerChord * beatsPerBar * (60 / bpm);
    expect(totalDuration).toBeCloseTo(expected);
  });
});

describe("chordRangeToLoopTime", () => {
  const SCHEDULE: ChordTiming[] = [
    { startTime: 0, duration: 2 }, // item 0: 0..2
    { startTime: 2, duration: 2 }, // item 1: 2..4
    { startTime: 4, duration: 2 }, // item 2: 4..6
    { startTime: 6, duration: 2 } // item 3: 6..8
  ];

  it("builds a range covering the whole chart", () => {
    expect(chordRangeToLoopTime(SCHEDULE, 0, SCHEDULE.length - 1)).toEqual({ startTime: 0, endTime: 8 });
  });

  it("builds a one-item loop range", () => {
    expect(chordRangeToLoopTime(SCHEDULE, 2, 2)).toEqual({ startTime: 4, endTime: 6 });
  });

  it("builds a normal multi-item range", () => {
    expect(chordRangeToLoopTime(SCHEDULE, 1, 2)).toEqual({ startTime: 2, endTime: 6 });
  });

  it("swaps inverted bounds", () => {
    expect(chordRangeToLoopTime(SCHEDULE, 3, 1)).toEqual({ startTime: 2, endTime: 8 });
  });

  it("clamps an out-of-range end index", () => {
    expect(chordRangeToLoopTime(SCHEDULE, 0, 999)).toEqual({ startTime: 0, endTime: 8 });
  });

  it("clamps an out-of-range negative start index", () => {
    expect(chordRangeToLoopTime(SCHEDULE, -5, 0)).toEqual({ startTime: 0, endTime: 2 });
  });

  it("clamps a non-finite index to 0", () => {
    expect(chordRangeToLoopTime(SCHEDULE, Number.NaN, 1)).toEqual({ startTime: 0, endTime: 4 });
  });

  it("returns null for an empty schedule", () => {
    expect(chordRangeToLoopTime([], 0, 0)).toBeNull();
  });

  it("returns null for a missing schedule", () => {
    expect(chordRangeToLoopTime(undefined as unknown as ChordTiming[], 0, 0)).toBeNull();
  });
});

describe("tempoForLoopPass", () => {
  it("stays at the start tempo for the first holdPasses passes", () => {
    const config = { startBpm: 60, targetBpm: 100, incrementBpm: 10, holdPasses: 2 };
    expect(tempoForLoopPass(config, 0)).toBe(60);
    expect(tempoForLoopPass(config, 1)).toBe(60);
  });

  it("steps up on the exact pass the hold count is satisfied", () => {
    const config = { startBpm: 60, targetBpm: 100, incrementBpm: 10, holdPasses: 2 };
    expect(tempoForLoopPass(config, 2)).toBe(70);
    expect(tempoForLoopPass(config, 3)).toBe(70);
    expect(tempoForLoopPass(config, 4)).toBe(80);
  });

  it("defaults holdPasses to 1, stepping every pass", () => {
    const config = { startBpm: 60, targetBpm: 100, incrementBpm: 10 };
    expect(tempoForLoopPass(config, 0)).toBe(60);
    expect(tempoForLoopPass(config, 1)).toBe(70);
    expect(tempoForLoopPass(config, 2)).toBe(80);
  });

  it("clamps at the target tempo instead of overshooting", () => {
    const config = { startBpm: 60, targetBpm: 100, incrementBpm: 10, holdPasses: 1 };
    expect(tempoForLoopPass(config, 4)).toBe(100); // exact boundary: 60 + 4*10 = 100
    expect(tempoForLoopPass(config, 5)).toBe(100); // would overshoot to 110 - clamped
    expect(tempoForLoopPass(config, 1000)).toBe(100); // runs away otherwise
  });

  it("holds at startBpm when incrementBpm is zero or negative", () => {
    expect(tempoForLoopPass({ startBpm: 60, targetBpm: 100, incrementBpm: 0 }, 10)).toBe(60);
    expect(tempoForLoopPass({ startBpm: 60, targetBpm: 100, incrementBpm: -5 }, 10)).toBe(60);
  });

  it("holds at startBpm when targetBpm is at or below startBpm", () => {
    expect(tempoForLoopPass({ startBpm: 80, targetBpm: 80, incrementBpm: 10 }, 10)).toBe(80);
    expect(tempoForLoopPass({ startBpm: 80, targetBpm: 50, incrementBpm: 10 }, 10)).toBe(80);
  });

  it("falls back to the default tempo for a non-finite or non-positive startBpm", () => {
    expect(tempoForLoopPass({ startBpm: 0, targetBpm: 200, incrementBpm: 10 }, 0)).toBe(DEFAULT_TEMPO_BPM);
    expect(tempoForLoopPass({ startBpm: Number.NaN, targetBpm: 200, incrementBpm: 10 }, 0)).toBe(DEFAULT_TEMPO_BPM);
  });

  it("treats a non-finite or negative passIndex as pass 0", () => {
    const config = { startBpm: 60, targetBpm: 100, incrementBpm: 10, holdPasses: 1 };
    expect(tempoForLoopPass(config, Number.NaN)).toBe(60);
    expect(tempoForLoopPass(config, -5)).toBe(60);
  });

  it("falls back to holding for 1 pass for a non-positive holdPasses", () => {
    const config = { startBpm: 60, targetBpm: 100, incrementBpm: 10, holdPasses: 0 };
    expect(tempoForLoopPass(config, 1)).toBe(70);
  });
});
