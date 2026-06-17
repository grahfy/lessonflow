/**
 * Lesson credits domain logic
 *
 * Prepaid lesson credits are owned by a customer in `LessonCreditBatch` rows.
 * A batch is GRANTED when a package invoice is paid (or by an admin manual
 * grant / voucher) and CONSUMED FIFO when a matching booking is created.
 *
 * Two invariants drive every helper here:
 *  - GRANT is idempotent per source invoice (keyed on `sourceInvoiceId`) so the
 *    mark_paid path and the Stripe webhook can both call it without double
 *    granting on a retry/duplicate delivery.
 *  - CONSUME is atomic: the decrement is guarded by `remainingQuantity > 0` via
 *    `updateMany` so two concurrent bookings can never over-consume one batch.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logError, logEvent } from "@/lib/observability";

/** Prisma transaction client or the base client — both expose the model API. */
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Validates the packageId on each draft line item before an invoice is created
 * or edited. A line may omit packageId; when present it must reference a package
 * that exists and is active, because that linkage is what triggers a prepaid
 * lesson-credit grant when the invoice is paid.
 *
 * @returns a human-readable error message if any packageId is invalid, else null.
 */
export async function assertPackageLinesAreValid(
  lineItems: Array<{ packageId?: string | null }>,
  db: Db = prisma
): Promise<string | null> {
  const packageIds = Array.from(
    new Set(
      lineItems
        .map((line) => line.packageId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

  if (packageIds.length === 0) {
    return null;
  }

  const found = await db.lessonPackage.findMany({
    where: { id: { in: packageIds }, isActive: true },
    select: { id: true }
  });
  const activeIds = new Set(found.map((row) => row.id));
  const missing = packageIds.filter((id) => !activeIds.has(id));

  if (missing.length > 0) {
    return "One or more selected packages no longer exist or are inactive.";
  }

  return null;
}

/**
 * Grants lesson credits for every package line item on a freshly-paid invoice.
 *
 * Idempotent: a batch is only created for a (invoiceId, packageId, lineItemId)
 * triple that has not already produced one. We key the dedupe on
 * `sourceInvoiceId` + `packageId` + `note` (the line item id is embedded in the
 * note) so a duplicate webhook delivery or a re-mark-paid is a no-op.
 *
 * The dedupe is enforced by a UNIQUE INDEX on (sourceInvoiceId, packageId,
 * note) — NOT just the findFirst pre-check below. The pre-check is a fast path
 * for the common re-run case, but two processes (mark_paid + the Stripe
 * webhook) can both pass it concurrently (TOCTOU); the unique index makes the
 * create atomic, so the loser hits a P2002 conflict that we swallow as a no-op.
 *
 * Best-effort by contract of its callers: invoked AFTER the paid transition so
 * a failure here must never roll back the payment. Callers wrap in try/catch.
 *
 * @returns number of credit batches created.
 */
export async function grantCreditsForPaidInvoice(
  invoiceId: string,
  db: Db = prisma
): Promise<number> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      customerId: true,
      lineItems: {
        where: { packageId: { not: null } },
        select: {
          id: true,
          packageId: true,
          quantity: true,
          package: {
            select: {
              id: true,
              lessonCount: true,
              durationMinutes: true,
              validityDays: true
            }
          }
        }
      }
    }
  });

  if (!invoice) {
    logError(
      "lesson_credits.grant_invoice_not_found",
      new Error("Invoice not found for credit grant"),
      { invoiceId }
    );
    return 0;
  }

  if (!invoice.customerId) {
    // No customer to own the credits; nothing to grant. Not an error: a package
    // can be billed to an ad-hoc invoice without a linked customer.
    return 0;
  }

  const packageLines = invoice.lineItems.filter((line) => line.packageId && line.package);
  if (packageLines.length === 0) {
    return 0;
  }

  let created = 0;

  for (const line of packageLines) {
    const pkg = line.package!;
    // Embed the originating line item id in the note so the idempotency check is
    // unique per line (an invoice can carry the same package on multiple lines).
    const dedupeNote = `lineItem:${line.id}`;

    // Idempotency guard: skip if a batch already exists for this invoice+line.
    const existing = await db.lessonCreditBatch.findFirst({
      where: {
        sourceInvoiceId: invoice.id,
        packageId: pkg.id,
        note: dedupeNote
      },
      select: { id: true }
    });
    if (existing) {
      continue;
    }

    // A package line with quantity N grants N * lessonCount credits.
    const quantity = Math.max(1, line.quantity) * pkg.lessonCount;
    const expiresAt = pkg.validityDays && pkg.validityDays > 0
      ? new Date(Date.now() + pkg.validityDays * 24 * 60 * 60 * 1000)
      : null;

    try {
      await db.lessonCreditBatch.create({
        data: {
          customerId: invoice.customerId,
          durationMinutes: pkg.durationMinutes,
          initialQuantity: quantity,
          remainingQuantity: quantity,
          source: "package_purchase",
          sourceInvoiceId: invoice.id,
          packageId: pkg.id,
          note: dedupeNote,
          expiresAt
        }
      });

      created += 1;
    } catch (error) {
      // A concurrent caller (mark_paid + Stripe webhook) won the race to create
      // the same grant. The unique index on (sourceInvoiceId, packageId, note)
      // rejects the duplicate with P2002; treat it as an idempotent no-op.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  if (created > 0) {
    logEvent("lesson_credits.granted_for_invoice", {
      invoiceId,
      customerId: invoice.customerId,
      batches: created
    });
  }

  return created;
}

/**
 * Attempts to consume one matching lesson credit for a booking, atomically.
 *
 * Selection: the customer's non-expired batches with `remainingQuantity > 0`
 * whose `durationMinutes` matches the booking duration (or is NULL = any
 * duration), ordered FIFO by soonest expiry (NULLs last), then oldest first.
 *
 * The decrement is guarded by `updateMany WHERE id=batch AND remainingQuantity>0`
 * so a concurrent booking that already drained the batch causes a zero-row
 * update; we then retry the next candidate. This prevents over-consumption.
 *
 * @returns the id of the batch a credit was drawn from, or null if none matched.
 */
export async function consumeLessonCredit(input: {
  tx: Prisma.TransactionClient;
  customerId: string;
  durationMinutes: number;
  now?: Date;
}): Promise<string | null> {
  const { tx, customerId, durationMinutes } = input;
  const now = input.now ?? new Date();

  const candidateWhere = {
    customerId,
    remainingQuantity: { gt: 0 },
    OR: [{ durationMinutes }, { durationMinutes: null }],
    AND: [
      {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      }
    ]
  } satisfies Prisma.LessonCreditBatchWhereInput;

  // Bound the candidate fetch so a customer with a pathological number of open
  // batches can't load an unbounded result set on every booking. The FIFO order
  // is stable, so a capped page is the soonest-to-expire batches; if every
  // candidate in a page is drained out from under us by concurrent consumers we
  // fetch the next page rather than give up while usable credits remain.
  const PAGE_SIZE = 50;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    // Candidate batches: matching duration (exact or any), non-expired, with
    // credits left. FIFO by soonest expiry then creation order.
    const candidates = await tx.lessonCreditBatch.findMany({
      where: candidateWhere,
      orderBy: [
        // soonest expiry first; NULL expiry sorts last so dated credits burn first.
        { expiresAt: "asc" },
        { createdAt: "asc" }
      ],
      select: { id: true },
      skip: offset,
      take: PAGE_SIZE
    });

    if (candidates.length === 0) {
      return null;
    }

    for (const candidate of candidates) {
      // Atomic guarded decrement. If a concurrent consumer already took the last
      // credit, this updates 0 rows and we fall through to the next candidate.
      const result = await tx.lessonCreditBatch.updateMany({
        where: { id: candidate.id, remainingQuantity: { gt: 0 } },
        data: { remainingQuantity: { decrement: 1 } }
      });

      if (result.count === 1) {
        return candidate.id;
      }
    }

    // Every batch in this page was drained by a concurrent consumer. If the page
    // was full there may be more candidates beyond it; otherwise we've exhausted
    // them. NOTE: drained rows still satisfy remainingQuantity>0? No — they now
    // have 0 remaining, so they drop out of the filter and the next page's
    // `skip` would step over still-usable rows. Re-query from offset 0 instead.
    if (candidates.length < PAGE_SIZE) {
      return null;
    }
    offset = -PAGE_SIZE; // becomes 0 after the loop's += PAGE_SIZE
  }
}

/**
 * Summarises a customer's currently-usable lesson credits (non-expired, with
 * remaining quantity) for portal/admin display. Returns the total remaining
 * count plus a per-batch breakdown.
 */
export async function getLessonCreditSummary(
  customerId: string,
  db: Db = prisma,
  now: Date = new Date()
): Promise<{
  totalRemaining: number;
  batches: Array<{
    id: string;
    durationMinutes: number | null;
    remainingQuantity: number;
    initialQuantity: number;
    expiresAt: Date | null;
    source: string;
    createdAt: Date;
  }>;
}> {
  const batches = await db.lessonCreditBatch.findMany({
    where: {
      customerId,
      remainingQuantity: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      durationMinutes: true,
      remainingQuantity: true,
      initialQuantity: true,
      expiresAt: true,
      source: true,
      createdAt: true
    }
  });

  const totalRemaining = batches.reduce((sum, b) => sum + b.remainingQuantity, 0);

  return { totalRemaining, batches };
}
