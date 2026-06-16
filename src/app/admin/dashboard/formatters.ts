import { APP_TIMEZONE } from "@/lib/time";

/**
 * Date formatters for the admin dashboard schedule lists.
 *
 * Kept in a sibling module (not page.tsx) because a Next.js route module may
 * only export the framework's reserved keys (default/metadata/etc.) — exporting
 * helpers from the page itself fails the generated page-type check.
 */

export function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE,
    timeStyle: "short"
  }).format(value);
}

// Compact weekday + time for the week list (e.g. "Mon 3:00 pm").
// NB: timeStyle/dateStyle cannot be combined with individual component options
// (weekday/hour/minute) — doing so throws "Invalid option". Use explicit
// component fields.
export function formatWeekdayTime(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}
