/**
 * Promo popup display-rule evaluation (promo-popup-system — AC-36..AC-41).
 *
 * Pure, framework-free predicates deciding whether a given popup should show
 * to a given visitor right now, and which one wins when several qualify.
 *
 * DELIBERATELY has no dependency on Prisma, the DOM, `localStorage`, or
 * `Date.now()`: callers own persistence (Prisma rows, cookies/localStorage
 * for view history) and pass plain data in; `now` is always an injected
 * parameter so every rule here stays deterministic and unit-testable.
 */

/** How often a popup that has already been seen may show again. */
export type RepeatPolicy = "once" | "session" | "days" | "always";

/** The subset of a `SitePopup` row this module needs to decide on. */
export interface Popup {
  id: string;
  enabled: boolean;
  /** Schedule window start. `null` means "no lower bound". */
  startAt: Date | null;
  /** Schedule window end. `null` means "no upper bound". */
  endAt: Date | null;
  /** Public paths this popup is restricted to. Empty or `null` means all pages. */
  targetPaths: string[] | null;
  delaySeconds: number;
  repeatPolicy: RepeatPolicy;
  /** Minimum days between repeat views. Only meaningful for `repeatPolicy: "days"`. */
  repeatDays: number | null;
  createdAt: Date;
}

/** A visitor's prior-view history for one popup. */
export interface PopupViewState {
  /** When this visitor last saw this popup, or `null` if never. */
  lastSeenAt: Date | null;
  /** Whether this popup has already been shown during the current browsing session. */
  seenThisSession: boolean;
}

/** Everything besides the popup itself needed to evaluate a single show/hide decision. */
export interface PopupShowContext {
  now: Date;
  /** The current public path, e.g. `/lessons?ref=ad` or `/blog/post-1/`. */
  path: string;
  view: PopupViewState;
}

/**
 * AC-36/37/38 — schedule + enabled gate.
 *
 * LOGIC:
 * - Disabled always returns `false`, regardless of the schedule (AC-38).
 * - Both `startAt` and `endAt` null means always-on while enabled (AC-37).
 * - The window is treated as CLOSED on both ends: `now >= startAt` and
 *   `now <= endAt`. A popup scheduled to start "now" or end "now" is still
 *   showing at that instant — the boundary belongs to the popup, not the gap
 *   around it. Only a `null` bound is unconstrained on that side.
 */
export function isWithinSchedule(
  popup: Pick<Popup, "enabled" | "startAt" | "endAt">,
  now: Date
): boolean {
  if (!popup.enabled) {
    return false;
  }
  const nowMs = now.getTime();
  if (popup.startAt !== null && nowMs < popup.startAt.getTime()) {
    return false;
  }
  if (popup.endAt !== null && nowMs > popup.endAt.getTime()) {
    return false;
  }
  return true;
}

/** Strips a query/hash suffix and a trailing slash (except for the root path) for consistent path comparison. */
function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery.length > 0 ? withoutQuery : "/";
}

/**
 * AC-39 — target-page matching.
 *
 * LOGIC:
 * - `targetPaths` empty or `null` means "all public pages" — always matches.
 * - Comparison is on paths only: query strings and hashes are stripped, and a
 *   trailing slash is ignored (`/blog` and `/blog/` are the same page), on
 *   both the visited path and each configured pattern.
 * - A pattern ending in `/*` is a trailing wildcard: it matches that exact
 *   path plus anything nested under it (`/blog/*` matches `/blog` and
 *   `/blog/post-1`, not `/blogging`). Every other pattern is an exact match.
 */
export function matchesTargetPath(popup: Pick<Popup, "targetPaths">, path: string): boolean {
  if (!popup.targetPaths || popup.targetPaths.length === 0) {
    return true;
  }
  const visited = normalizePath(path);
  return popup.targetPaths.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = normalizePath(pattern.slice(0, -2)) || "/";
      return visited === prefix || visited.startsWith(prefix === "/" ? "/" : `${prefix}/`);
    }
    return visited === normalizePath(pattern);
  });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * AC-40 — repeat-policy gate.
 *
 * LOGIC:
 * - `once`: allowed only if never seen before (`lastSeenAt === null`).
 * - `session`: allowed unless already shown this session; prior sessions
 *   (`lastSeenAt` from before today) don't matter.
 * - `days`: allowed if never seen, or at least `repeatDays` days have
 *   elapsed since `lastSeenAt`. The boundary is inclusive (`>=`): exactly
 *   `repeatDays * 24h` later counts as allowed. A missing/non-positive
 *   `repeatDays` is treated as no waiting period (same as `always`) rather
 *   than blocking forever on a misconfigured popup.
 * - `always`: always allowed.
 */
export function isRepeatAllowed(
  popup: Pick<Popup, "repeatPolicy" | "repeatDays">,
  view: PopupViewState,
  now: Date
): boolean {
  switch (popup.repeatPolicy) {
    case "once":
      return view.lastSeenAt === null;
    case "session":
      return !view.seenThisSession;
    case "days": {
      if (view.lastSeenAt === null) {
        return true;
      }
      if (!popup.repeatDays || popup.repeatDays <= 0) {
        return true;
      }
      const elapsedMs = now.getTime() - view.lastSeenAt.getTime();
      return elapsedMs >= popup.repeatDays * MS_PER_DAY;
    }
    case "always":
      return true;
  }
}

/** Composes the schedule, target-path and repeat-policy gates into one show/hide decision for a single popup. */
export function shouldShowPopup(popup: Popup, ctx: PopupShowContext): boolean {
  return (
    isWithinSchedule(popup, ctx.now) &&
    matchesTargetPath(popup, ctx.path) &&
    isRepeatAllowed(popup, ctx.view, ctx.now)
  );
}

/**
 * AC-41 — selection among popups that already passed their individual rules.
 *
 * LOGIC: picks the most recently created (`createdAt` descending). Ties
 * (identical `createdAt`, e.g. two popups created in the same seed/migration
 * millisecond) are broken by the lexicographically greater `id`, so the
 * result is deterministic without depending on input array order. Returns
 * `null` for an empty list.
 */
export function selectMostRecentPopup(popups: Popup[]): Popup | null {
  if (popups.length === 0) {
    return null;
  }
  return popups.reduce((winner, candidate) => {
    const winnerMs = winner.createdAt.getTime();
    const candidateMs = candidate.createdAt.getTime();
    if (candidateMs > winnerMs) {
      return candidate;
    }
    if (candidateMs === winnerMs && candidate.id > winner.id) {
      return candidate;
    }
    return winner;
  });
}

/**
 * One-call entry point: evaluates every popup against `ctx` (each with its
 * own view history) and returns the single popup that should show, or `null`.
 */
export function selectPopupToShow(
  candidates: Array<{ popup: Popup; view: PopupViewState }>,
  ctx: Omit<PopupShowContext, "view">
): Popup | null {
  const qualifying = candidates
    .filter(({ popup, view }) => shouldShowPopup(popup, { ...ctx, view }))
    .map(({ popup }) => popup);
  return selectMostRecentPopup(qualifying);
}
