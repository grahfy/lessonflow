/**
 * The single path every `Booking` row is created through (AC-56).
 *
 * Before this existed there was NO conflict detection anywhere: the admin
 * create route and the request-approval helper both called `tx.booking.create`
 * directly, and nothing stopped a teacher being double-booked. The guard lives
 * here, in the create wrapper, rather than in each route — a new caller (the
 * student booking tab) inherits it by construction instead of by remembering.
 *
 * ATOMICITY (AC-59): a read-then-write check cannot survive two concurrent
 * approvals of the same slot, so each check does two things inside the caller's
 * transaction, in this order:
 *  1. Takes an exclusive row lock on the teacher's `AdminUser` row. A second
 *     transaction for the same teacher blocks here until the first commits, so
 *     the check-then-insert pair is serialised per teacher (and only per
 *     teacher — bookings for different teachers never contend).
 *  2. Runs the overlap query as a LOCKING read (`FOR UPDATE`). This matters
 *     under MySQL's default REPEATABLE READ: a plain read would answer from the
 *     transaction's snapshot and could miss the booking the winner just
 *     committed. A locking read always sees the latest committed rows.
 * Interval overlap is not expressible as a unique key, so no schema change is
 * involved. See the report notes if a slot-grid column is ever revisited.
 */

import type { Prisma } from "@/generated/prisma/client";
import { BookingStatus } from "@/generated/prisma/client";

import { toDateKey, toTimeKey } from "@/lib/time";

import { findOverlaps, type IdentifiedInterval } from "./overlap";

/** The subset of a clashing booking the owner needs to identify it. */
export interface ConflictingBooking extends IdentifiedInterval {
  name: string;
}

/** Thrown when a booking would overlap an existing one for the same teacher. */
export class BookingConflictError extends Error {
  readonly conflict: ConflictingBooking;

  constructor(conflict: ConflictingBooking) {
    super(
      `That time is already booked for this teacher: ${conflict.name} on ` +
        `${toDateKey(conflict.startAt)} ${toTimeKey(conflict.startAt)}-${toTimeKey(conflict.endAt)} ` +
        `(booking ${conflict.id}).`
    );
    this.name = "BookingConflictError";
    this.conflict = conflict;
  }
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Throws `BookingConflictError` if `[startAt, endAt)` collides with a
 * non-cancelled booking already held by `assignedTeacherId`.
 *
 * Bookings with no assigned teacher are not guarded: there is no teacher whose
 * calendar could clash, and no row to serialise on. Every route that creates
 * bookings resolves a teacher first, so this is the unassigned-backfill case.
 */
async function assertTeacherSlotFree(
  tx: Prisma.TransactionClient,
  teacherId: string | null | undefined,
  startAt: Date,
  endAt: Date
): Promise<void> {
  if (!teacherId) {
    return;
  }

  // Serialise concurrent creates for this teacher (step 1 above).
  await tx.$queryRaw`SELECT id FROM AdminUser WHERE id = ${teacherId} FOR UPDATE`;

  // Coarse half-open prefilter in SQL; `findOverlaps` makes the final call so
  // the boundary semantics live in exactly one place.
  const candidates = await tx.$queryRaw<ConflictingBooking[]>`
    SELECT id, name, startAt, endAt
    FROM Booking
    WHERE assignedTeacherId = ${teacherId}
      AND status <> ${BookingStatus.cancelled}
      AND startAt < ${endAt}
      AND endAt > ${startAt}
    FOR UPDATE`;

  const [conflict] = findOverlaps({ startAt, endAt }, candidates);
  if (conflict) {
    throw new BookingConflictError(conflict);
  }
}

/**
 * Creates a booking, rejecting it if the teacher is already booked for any part
 * of `[startAt, endAt)`. Use this instead of `tx.booking.create` everywhere.
 *
 * Must be called inside a transaction: the guard's locks are only held for the
 * life of the surrounding transaction, and a create outside one would leave the
 * check-then-insert pair racy.
 *
 * Recurring series call this once per generated date. A conflict on ANY date
 * throws, which rolls the caller's transaction back and rejects the WHOLE
 * series — a half-created series would leave the owner reconciling which weeks
 * landed. Rows created earlier in the same transaction are visible to its own
 * locking read, so a series that collides with itself is caught too.
 */
export async function createBookingChecked(
  tx: Prisma.TransactionClient,
  data: Prisma.BookingUncheckedCreateInput
) {
  // `Prisma.TransactionClient` is an `Omit<>` of the full client, so the
  // `prisma` singleton is structurally assignable here and TypeScript will not
  // catch the mistake. Outside a transaction every statement auto-commits: the
  // teacher lock would be released before the overlap query even runs, and two
  // concurrent creates would both see a free slot and both insert. Checked at
  // runtime via `$connect`, which the transaction client does NOT expose —
  // `$transaction` is NOT a valid discriminator, this Prisma version defines it
  // on both (verified, contrary to the `ITXClientDenyList` type).
  if (typeof (tx as { $connect?: unknown }).$connect === "function") {
    throw new Error(
      "createBookingChecked must be called with a transaction client, e.g. prisma.$transaction((tx) => createBookingChecked(tx, data)). " +
        "The overlap guard is not race-safe outside a transaction."
    );
  }

  await assertTeacherSlotFree(
    tx,
    data.assignedTeacherId,
    toDate(data.startAt),
    toDate(data.endAt)
  );

  return tx.booking.create({ data });
}
