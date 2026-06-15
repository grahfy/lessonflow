/**
 * Soft-delete conventions
 *
 * Records in this codebase are retired in three different ways depending on the
 * model. There is intentionally NO single shared column name — renaming the
 * financial `Invoice.isDeleted` flag (used by the Stripe webhook, payment, and
 * reporting paths) is higher risk than the value of uniformity, so we document
 * and centralize the convention here instead.
 *
 *   - `isArchived` (Boolean) — soft-archive flag on Customer, LessonPlanTemplate,
 *     LessonSeriesTemplate, Chord, ChordChart (and StudentMaterialFolder /
 *     LessonSeries). Archived rows are hidden from default lists but retained.
 *   - `isDeleted` (Boolean) — soft-delete flag on Invoice ONLY. Kept distinct
 *     because invoices must be recoverable and auditable for tax compliance.
 *   - `cancelledAt` (DateTime?) — semantic timestamp on Booking. NOT a generic
 *     soft-delete flag: it records *when* a booking was cancelled and is read as
 *     business state, so it is deliberately excluded from these helpers.
 *
 * Use these helpers when building `where` clauses so the intent ("only the live
 * rows") is explicit and greppable, rather than sprinkling bare
 * `{ isArchived: false }` / `{ isDeleted: false }` literals across the codebase.
 *
 * Each helper returns a partial `where` fragment to spread into a Prisma query:
 *
 *   prisma.customer.findMany({ where: { ...excludeArchived(), email } })
 *   prisma.invoice.findMany({ where: { ...excludeDeleted(), customerId } })
 */

/**
 * `where` fragment that excludes archived rows (`isArchived` models).
 */
export function excludeArchived(): { isArchived: false } {
  return { isArchived: false };
}

/**
 * `where` fragment that excludes soft-deleted invoices (`isDeleted` model:
 * Invoice). Named distinctly from {@link excludeArchived} so call sites make the
 * column they target unambiguous.
 */
export function excludeDeleted(): { isDeleted: false } {
  return { isDeleted: false };
}

/**
 * Generic alias for "only the active/live rows" on `isArchived` models. Provided
 * for readability at call sites that talk in terms of activeness rather than
 * archival; identical to {@link excludeArchived}.
 */
export function activeWhere(): { isArchived: false } {
  return excludeArchived();
}
