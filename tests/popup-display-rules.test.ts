// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  isRepeatAllowed,
  isWithinSchedule,
  matchesTargetPath,
  selectMostRecentPopup,
  selectPopupToShow,
  shouldShowPopup,
  type Popup,
  type PopupViewState
} from "@/lib/popups/display-rules";

const NOW = new Date("2026-07-22T12:00:00.000Z");

const basePopup: Popup = {
  id: "popup-1",
  enabled: true,
  startAt: null,
  endAt: null,
  targetPaths: null,
  delaySeconds: 0,
  repeatPolicy: "always",
  repeatDays: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("isWithinSchedule", () => {
  it("shows when both startAt and endAt are null (AC-37)", () => {
    expect(isWithinSchedule(basePopup, NOW)).toBe(true);
  });

  it("shows exactly at the start boundary (closed interval)", () => {
    expect(isWithinSchedule({ ...basePopup, startAt: NOW, endAt: null }, NOW)).toBe(true);
  });

  it("shows exactly at the end boundary (closed interval)", () => {
    expect(isWithinSchedule({ ...basePopup, startAt: null, endAt: NOW }, NOW)).toBe(true);
  });

  it("does not show before the start (AC-36)", () => {
    const startAt = new Date(NOW.getTime() + 1000);
    expect(isWithinSchedule({ ...basePopup, startAt, endAt: null }, NOW)).toBe(false);
  });

  it("does not show after the end (AC-36)", () => {
    const endAt = new Date(NOW.getTime() - 1000);
    expect(isWithinSchedule({ ...basePopup, startAt: null, endAt }, NOW)).toBe(false);
  });

  it("never shows when disabled, even inside the window (AC-38)", () => {
    expect(isWithinSchedule({ ...basePopup, enabled: false }, NOW)).toBe(false);
  });
});

describe("matchesTargetPath", () => {
  it("matches every path when targetPaths is null", () => {
    expect(matchesTargetPath({ targetPaths: null }, "/anything")).toBe(true);
  });

  it("matches every path when targetPaths is empty", () => {
    expect(matchesTargetPath({ targetPaths: [] }, "/anything")).toBe(true);
  });

  it("matches an exact path", () => {
    expect(matchesTargetPath({ targetPaths: ["/blog"] }, "/blog")).toBe(true);
  });

  it("ignores a trailing slash on the visited path", () => {
    expect(matchesTargetPath({ targetPaths: ["/blog"] }, "/blog/")).toBe(true);
  });

  it("ignores a query string on the visited path", () => {
    expect(matchesTargetPath({ targetPaths: ["/blog"] }, "/blog?ref=ad")).toBe(true);
  });

  it("does not match an unlisted path", () => {
    expect(matchesTargetPath({ targetPaths: ["/blog"] }, "/other")).toBe(false);
  });

  it("matches a trailing-wildcard pattern for a nested path", () => {
    expect(matchesTargetPath({ targetPaths: ["/blog/*"] }, "/blog/post-1")).toBe(true);
  });

  it("matches a trailing-wildcard pattern at its own root", () => {
    expect(matchesTargetPath({ targetPaths: ["/blog/*"] }, "/blog")).toBe(true);
  });

  it("does not let a trailing-wildcard pattern match an unrelated prefix", () => {
    expect(matchesTargetPath({ targetPaths: ["/blog/*"] }, "/blogging")).toBe(false);
  });
});

describe("isRepeatAllowed", () => {
  it("once: allows the first view", () => {
    const view: PopupViewState = { lastSeenAt: null, seenThisSession: false };
    expect(isRepeatAllowed({ repeatPolicy: "once", repeatDays: null }, view, NOW)).toBe(true);
  });

  it("once: never allows again after any prior view", () => {
    const view: PopupViewState = { lastSeenAt: new Date("2020-01-01"), seenThisSession: false };
    expect(isRepeatAllowed({ repeatPolicy: "once", repeatDays: null }, view, NOW)).toBe(false);
  });

  it("session: allows when not yet seen this session", () => {
    const view: PopupViewState = { lastSeenAt: new Date("2020-01-01"), seenThisSession: false };
    expect(isRepeatAllowed({ repeatPolicy: "session", repeatDays: null }, view, NOW)).toBe(true);
  });

  it("session: disallows once seen this session", () => {
    const view: PopupViewState = { lastSeenAt: NOW, seenThisSession: true };
    expect(isRepeatAllowed({ repeatPolicy: "session", repeatDays: null }, view, NOW)).toBe(false);
  });

  it("days: allows when never seen before", () => {
    const view: PopupViewState = { lastSeenAt: null, seenThisSession: false };
    expect(isRepeatAllowed({ repeatPolicy: "days", repeatDays: 3 }, view, NOW)).toBe(true);
  });

  it("days: allows exactly at the N-day boundary", () => {
    const lastSeenAt = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
    const view: PopupViewState = { lastSeenAt, seenThisSession: false };
    expect(isRepeatAllowed({ repeatPolicy: "days", repeatDays: 3 }, view, NOW)).toBe(true);
  });

  it("days: disallows a second short of the N-day boundary", () => {
    const lastSeenAt = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000 + 1000);
    const view: PopupViewState = { lastSeenAt, seenThisSession: false };
    expect(isRepeatAllowed({ repeatPolicy: "days", repeatDays: 3 }, view, NOW)).toBe(false);
  });

  it("days: treats a missing repeatDays as no waiting period", () => {
    const view: PopupViewState = { lastSeenAt: NOW, seenThisSession: false };
    expect(isRepeatAllowed({ repeatPolicy: "days", repeatDays: null }, view, NOW)).toBe(true);
  });

  it("always: allows regardless of prior view", () => {
    const view: PopupViewState = { lastSeenAt: NOW, seenThisSession: true };
    expect(isRepeatAllowed({ repeatPolicy: "always", repeatDays: null }, view, NOW)).toBe(true);
  });
});

describe("shouldShowPopup", () => {
  it("combines schedule, path and repeat gates into one decision", () => {
    const view: PopupViewState = { lastSeenAt: null, seenThisSession: false };
    expect(shouldShowPopup(basePopup, { now: NOW, path: "/", view })).toBe(true);
  });

  it("fails the overall decision if any single gate fails", () => {
    const view: PopupViewState = { lastSeenAt: null, seenThisSession: false };
    expect(shouldShowPopup({ ...basePopup, enabled: false }, { now: NOW, path: "/", view })).toBe(
      false
    );
  });
});

describe("selectMostRecentPopup", () => {
  it("returns null for an empty list", () => {
    expect(selectMostRecentPopup([])).toBeNull();
  });

  it("picks the most recently created popup", () => {
    const older: Popup = { ...basePopup, id: "a", createdAt: new Date("2026-01-01") };
    const newer: Popup = { ...basePopup, id: "b", createdAt: new Date("2026-02-01") };
    expect(selectMostRecentPopup([older, newer])).toBe(newer);
  });

  it("breaks a same-millisecond createdAt tie on the lexicographically greater id", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const popupA: Popup = { ...basePopup, id: "aaa", createdAt };
    const popupB: Popup = { ...basePopup, id: "zzz", createdAt };
    expect(selectMostRecentPopup([popupA, popupB])).toBe(popupB);
    expect(selectMostRecentPopup([popupB, popupA])).toBe(popupB);
  });
});

describe("selectPopupToShow", () => {
  it("returns the one qualifying popup", () => {
    const view: PopupViewState = { lastSeenAt: null, seenThisSession: false };
    const result = selectPopupToShow([{ popup: basePopup, view }], { now: NOW, path: "/" });
    expect(result).toBe(basePopup);
  });

  it("returns null when nothing qualifies", () => {
    const view: PopupViewState = { lastSeenAt: null, seenThisSession: false };
    const disabled: Popup = { ...basePopup, enabled: false };
    const result = selectPopupToShow([{ popup: disabled, view }], { now: NOW, path: "/" });
    expect(result).toBeNull();
  });

  it("picks the most recently created among several qualifying popups", () => {
    const view: PopupViewState = { lastSeenAt: null, seenThisSession: false };
    const older: Popup = { ...basePopup, id: "a", createdAt: new Date("2026-01-01") };
    const newer: Popup = { ...basePopup, id: "b", createdAt: new Date("2026-02-01") };
    const result = selectPopupToShow(
      [
        { popup: older, view },
        { popup: newer, view }
      ],
      { now: NOW, path: "/" }
    );
    expect(result).toBe(newer);
  });
});
