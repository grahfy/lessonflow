/**
 * DB-backed integration tests for lesson credits (phase1-leftovers, workstream B).
 *
 * Drives REAL prisma against the test DB to exercise the actual grant/consume/
 * summary wiring in src/lib/credits/lesson-credits.ts plus the auto-invoice
 * "skip credit-covered booking" behaviour.
 *
 * Coverage:
 *  - grantCreditsForPaidInvoice: grants quantity * lessonCount per package line;
 *    IDEMPOTENT (second call does not double-grant); skips invoices with no
 *    package line / no customer.
 *  - consumeLessonCredit: FIFO soonest-expiry; duration match (exact OR
 *    null=any); excludes expired / drained batches; ATOMIC decrement so
 *    concurrent/duplicate consumes never over-consume below zero.
 *  - getLessonCreditSummary: totals only non-expired, remaining-bearing batches.
 *  - auto-invoice skips a booking whose lessonCreditBatchId is set.
 *
 * Every seeded row uses the `lcred_test_` prefix and is removed in
 * beforeEach/afterEach so reruns are deterministic and the rows never collide
 * with the other DB-backed suites running under the single shared runner.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  consumeLessonCredit,
  getLessonCreditSummary,
  grantCreditsForPaidInvoice
} from "@/lib/credits/lesson-credits";
import { autoCreateDraftInvoicesForApproval } from "@/lib/invoices/auto-invoice";

const PREFIX = "lcred_test_";
const ADMIN_ID = `${PREFIX}admin`;

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedAdmin() {
  await prisma.adminUser.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      email: `${PREFIX}admin@example.com`,
      displayName: "Lesson Credit Admin",
      passwordHash: "x"
    }
  });
}

async function seedCustomer(id: string) {
  await prisma.customer.create({
    data: {
      id,
      fullName: "Credit Customer",
      email: `${id}@example.com`,
      phone: "0400000000",
      normalizedEmail: `${id}@example.com`,
      normalizedPhone: "0400000000"
    }
  });
}

async function seedPackage(input: {
  id: string;
  lessonCount: number;
  durationMinutes?: number | null;
  validityDays?: number | null;
}) {
  await prisma.lessonPackage.create({
    data: {
      id: input.id,
      label: `Package ${input.id}`,
      lessonCount: input.lessonCount,
      durationMinutes: input.durationMinutes ?? null,
      priceCents: 10000,
      validityDays: input.validityDays ?? null,
      isActive: true,
      sortOrder: 0
    }
  });
}

/**
 * Seed a paid invoice with `quantity` of a package line. Mirrors the minimal
 * required Invoice + InvoiceLineItem field set (line totals are not asserted on
 * here — only the package linkage drives credit granting).
 */
async function seedPackageInvoice(input: {
  id: string;
  invoiceNumber: string;
  customerId: string;
  packageId: string;
  quantity: number;
}) {
  await prisma.invoice.create({
    data: {
      id: input.id,
      invoiceNumber: input.invoiceNumber,
      status: "paid",
      customerId: input.customerId,
      customerName: "Credit Customer",
      customerEmail: `${input.customerId}@example.com`,
      customerPhone: "0400000000",
      customerAddress: "1 Test Street",
      sellerBusinessName: "Melbourne Guitar School",
      sellerAbn: "12345678901",
      bankName: "Test Bank",
      bankBsb: "000-000",
      bankAccountName: "MGS",
      bankAccountNumber: "12345678",
      subtotalCents: 10000,
      gstCents: 0,
      totalCents: 10000,
      issuedAt: new Date(),
      dueAt: new Date(Date.now() + 14 * DAY_MS),
      createdById: ADMIN_ID,
      lineItems: {
        create: {
          kind: "other",
          description: "Lesson package",
          quantity: input.quantity,
          unitPriceCents: 10000,
          taxMode: "gst_free",
          lineSubtotalCents: 10000,
          lineGstCents: 0,
          lineTotalCents: 10000,
          sortOrder: 0,
          packageId: input.packageId
        }
      }
    }
  });
}

/** Insert a credit batch directly for consume/summary tests. */
async function seedBatch(input: {
  id: string;
  customerId: string;
  durationMinutes: number | null;
  remaining: number;
  expiresAt?: Date | null;
  createdAt?: Date;
}) {
  await prisma.lessonCreditBatch.create({
    data: {
      id: input.id,
      customerId: input.customerId,
      durationMinutes: input.durationMinutes,
      initialQuantity: input.remaining,
      remainingQuantity: input.remaining,
      source: "admin_grant",
      expiresAt: input.expiresAt ?? null,
      createdAt: input.createdAt ?? new Date()
    }
  });
}

async function batchRemaining(id: string): Promise<number> {
  const b = await prisma.lessonCreditBatch.findUnique({
    where: { id },
    select: { remainingQuantity: true }
  });
  return b?.remainingQuantity ?? -1;
}

async function cleanup() {
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: { startsWith: PREFIX } } });
  await prisma.invoice.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.invoice.deleteMany({ where: { customerId: { startsWith: PREFIX } } });
  await prisma.lessonCreditBatch.deleteMany({ where: { customerId: { startsWith: PREFIX } } });
  await prisma.booking.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.lessonPackage.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.lessonPricingOption.deleteMany({ where: { durationMinutes: { in: [30, 60] } } });
  await prisma.customer.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { id: ADMIN_ID } });
}

describe("lesson credits (DB-backed)", () => {
  beforeEach(async () => {
    await cleanup();
    await seedAdmin();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("grantCreditsForPaidInvoice", () => {
    it("grants quantity * lessonCount credits for a package line", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedPackage({ id: `${PREFIX}pkg5`, lessonCount: 5, durationMinutes: 30, validityDays: 90 });
      await seedPackageInvoice({
        id: `${PREFIX}inv1`,
        invoiceNumber: `${PREFIX}INV1`,
        customerId: `${PREFIX}cust1`,
        packageId: `${PREFIX}pkg5`,
        quantity: 2
      });

      const created = await grantCreditsForPaidInvoice(`${PREFIX}inv1`);
      expect(created).toBe(1);

      const batches = await prisma.lessonCreditBatch.findMany({
        where: { customerId: `${PREFIX}cust1` }
      });
      expect(batches).toHaveLength(1);
      // quantity 2 * lessonCount 5 = 10 credits.
      expect(batches[0].initialQuantity).toBe(10);
      expect(batches[0].remainingQuantity).toBe(10);
      expect(batches[0].durationMinutes).toBe(30);
      expect(batches[0].source).toBe("package_purchase");
      expect(batches[0].sourceInvoiceId).toBe(`${PREFIX}inv1`);
      expect(batches[0].expiresAt).not.toBeNull();
    });

    it("is idempotent: a second call does not double-grant", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedPackage({ id: `${PREFIX}pkg5`, lessonCount: 5, durationMinutes: 30 });
      await seedPackageInvoice({
        id: `${PREFIX}inv1`,
        invoiceNumber: `${PREFIX}INV1`,
        customerId: `${PREFIX}cust1`,
        packageId: `${PREFIX}pkg5`,
        quantity: 1
      });

      const first = await grantCreditsForPaidInvoice(`${PREFIX}inv1`);
      const second = await grantCreditsForPaidInvoice(`${PREFIX}inv1`);
      expect(first).toBe(1);
      expect(second).toBe(0);

      const batches = await prisma.lessonCreditBatch.findMany({
        where: { customerId: `${PREFIX}cust1` }
      });
      expect(batches).toHaveLength(1);
      expect(batches[0].remainingQuantity).toBe(5);
    });

    it("does not double-grant under two concurrent calls (P2002 no-op)", async () => {
      // Regression for the grant TOCTOU: mark_paid and the Stripe webhook can
      // both pass the findFirst pre-check and race to create the same batch.
      // The unique index on (sourceInvoiceId, packageId, note) rejects the
      // duplicate with P2002, which grantCreditsForPaidInvoice swallows as a
      // no-op — so exactly one batch exists no matter the interleaving.
      await seedCustomer(`${PREFIX}cust1`);
      await seedPackage({ id: `${PREFIX}pkg5`, lessonCount: 5, durationMinutes: 30 });
      await seedPackageInvoice({
        id: `${PREFIX}inv1`,
        invoiceNumber: `${PREFIX}INV1`,
        customerId: `${PREFIX}cust1`,
        packageId: `${PREFIX}pkg5`,
        quantity: 1
      });

      const [a, b] = await Promise.all([
        grantCreditsForPaidInvoice(`${PREFIX}inv1`),
        grantCreditsForPaidInvoice(`${PREFIX}inv1`)
      ]);

      // Exactly one caller created the batch; the other was a no-op.
      expect(a + b).toBe(1);

      const batches = await prisma.lessonCreditBatch.findMany({
        where: { customerId: `${PREFIX}cust1` }
      });
      expect(batches).toHaveLength(1);
      expect(batches[0].remainingQuantity).toBe(5);
    });

    it("grants nothing for an invoice with no package line", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await prisma.invoice.create({
        data: {
          id: `${PREFIX}invNo`,
          invoiceNumber: `${PREFIX}INVNO`,
          status: "paid",
          customerId: `${PREFIX}cust1`,
          customerName: "Credit Customer",
          customerEmail: `${PREFIX}cust1@example.com`,
          customerPhone: "0400000000",
          customerAddress: "1 Test Street",
          sellerBusinessName: "MGS",
          sellerAbn: "1",
          bankName: "B",
          bankBsb: "0",
          bankAccountName: "MGS",
          bankAccountNumber: "1",
          subtotalCents: 9000,
          gstCents: 0,
          totalCents: 9000,
          issuedAt: new Date(),
          dueAt: new Date(),
          createdById: ADMIN_ID,
          lineItems: {
            create: {
              kind: "lesson_fee",
              description: "Lesson fee",
              quantity: 1,
              unitPriceCents: 9000,
              taxMode: "gst_free",
              lineSubtotalCents: 9000,
              lineGstCents: 0,
              lineTotalCents: 9000,
              sortOrder: 0
            }
          }
        }
      });

      const created = await grantCreditsForPaidInvoice(`${PREFIX}invNo`);
      expect(created).toBe(0);
      expect(
        await prisma.lessonCreditBatch.count({ where: { customerId: `${PREFIX}cust1` } })
      ).toBe(0);
    });

    it("grants nothing for a missing invoice", async () => {
      const created = await grantCreditsForPaidInvoice(`${PREFIX}does_not_exist`);
      expect(created).toBe(0);
    });
  });

  describe("consumeLessonCredit", () => {
    it("consumes FIFO by soonest expiry first", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      const soon = new Date(Date.now() + 10 * DAY_MS);
      const later = new Date(Date.now() + 90 * DAY_MS);
      await seedBatch({ id: `${PREFIX}bLater`, customerId: `${PREFIX}cust1`, durationMinutes: 30, remaining: 1, expiresAt: later });
      await seedBatch({ id: `${PREFIX}bSoon`, customerId: `${PREFIX}cust1`, durationMinutes: 30, remaining: 1, expiresAt: soon });

      const used = await prisma.$transaction((tx) =>
        consumeLessonCredit({ tx, customerId: `${PREFIX}cust1`, durationMinutes: 30 })
      );
      // The soonest-expiry batch is drawn first.
      expect(used).toBe(`${PREFIX}bSoon`);
      expect(await batchRemaining(`${PREFIX}bSoon`)).toBe(0);
      expect(await batchRemaining(`${PREFIX}bLater`)).toBe(1);
    });

    it("matches a null-duration (any) batch when no exact-duration batch exists", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedBatch({ id: `${PREFIX}bAny`, customerId: `${PREFIX}cust1`, durationMinutes: null, remaining: 1 });

      const used = await prisma.$transaction((tx) =>
        consumeLessonCredit({ tx, customerId: `${PREFIX}cust1`, durationMinutes: 60 })
      );
      expect(used).toBe(`${PREFIX}bAny`);
      expect(await batchRemaining(`${PREFIX}bAny`)).toBe(0);
    });

    it("does not match a batch of a different fixed duration", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedBatch({ id: `${PREFIX}b30`, customerId: `${PREFIX}cust1`, durationMinutes: 30, remaining: 1 });

      const used = await prisma.$transaction((tx) =>
        consumeLessonCredit({ tx, customerId: `${PREFIX}cust1`, durationMinutes: 60 })
      );
      expect(used).toBeNull();
      expect(await batchRemaining(`${PREFIX}b30`)).toBe(1);
    });

    it("excludes an expired batch", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedBatch({
        id: `${PREFIX}bExpired`,
        customerId: `${PREFIX}cust1`,
        durationMinutes: 30,
        remaining: 5,
        expiresAt: new Date(Date.now() - DAY_MS)
      });

      const used = await prisma.$transaction((tx) =>
        consumeLessonCredit({ tx, customerId: `${PREFIX}cust1`, durationMinutes: 30 })
      );
      expect(used).toBeNull();
      expect(await batchRemaining(`${PREFIX}bExpired`)).toBe(5);
    });

    it("returns null when the customer has no matching credits", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      const used = await prisma.$transaction((tx) =>
        consumeLessonCredit({ tx, customerId: `${PREFIX}cust1`, durationMinutes: 30 })
      );
      expect(used).toBeNull();
    });

    it("never over-consumes a single-credit batch under duplicate consume", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      // One batch with a single credit. Two sequential consumes inside one
      // transaction each: the first drains it, the second must find nothing and
      // must NOT push remainingQuantity below zero.
      await seedBatch({ id: `${PREFIX}bOne`, customerId: `${PREFIX}cust1`, durationMinutes: 30, remaining: 1 });

      const first = await prisma.$transaction((tx) =>
        consumeLessonCredit({ tx, customerId: `${PREFIX}cust1`, durationMinutes: 30 })
      );
      const second = await prisma.$transaction((tx) =>
        consumeLessonCredit({ tx, customerId: `${PREFIX}cust1`, durationMinutes: 30 })
      );

      expect(first).toBe(`${PREFIX}bOne`);
      expect(second).toBeNull();
      // Guarded decrement: remaining floored at 0, never negative.
      expect(await batchRemaining(`${PREFIX}bOne`)).toBe(0);
    });

    it("two concurrent consumes against a 1-credit batch never over-consume", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedBatch({ id: `${PREFIX}bRace`, customerId: `${PREFIX}cust1`, durationMinutes: 30, remaining: 1 });

      // Under true concurrency the MariaDB adapter detects the conflicting write
      // and aborts the losing transaction ("Record has changed"), so a consume
      // either returns a batch id, returns null (no credit), or throws (lost the
      // optimistic-lock race). The invariant being asserted is the safety one:
      // AT MOST one consumer succeeds and the credit can never go below zero.
      const attempt = () =>
        prisma
          .$transaction((tx) =>
            consumeLessonCredit({ tx, customerId: `${PREFIX}cust1`, durationMinutes: 30 })
          )
          .catch(() => "conflict" as const);

      const [a, b] = await Promise.all([attempt(), attempt()]);

      const successes = [a, b].filter((r) => typeof r === "string" && r === `${PREFIX}bRace`);
      // The guarded updateMany + adapter conflict detection together ensure the
      // single credit is drawn at most once — never twice.
      expect(successes.length).toBeLessThanOrEqual(1);
      // Whatever the interleaving, remaining is either 1 (both lost/aborted) or 0
      // (one committed) — crucially NEVER negative: no over-consumption.
      const remaining = await batchRemaining(`${PREFIX}bRace`);
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(remaining).toBe(successes.length === 1 ? 0 : 1);
    });
  });

  describe("getLessonCreditSummary", () => {
    it("totals only non-expired, remaining-bearing batches", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      await seedBatch({ id: `${PREFIX}sA`, customerId: `${PREFIX}cust1`, durationMinutes: 30, remaining: 3 });
      await seedBatch({ id: `${PREFIX}sB`, customerId: `${PREFIX}cust1`, durationMinutes: null, remaining: 2, expiresAt: new Date(Date.now() + 30 * DAY_MS) });
      // Excluded: drained.
      await seedBatch({ id: `${PREFIX}sDrained`, customerId: `${PREFIX}cust1`, durationMinutes: 30, remaining: 0 });
      // Excluded: expired.
      await seedBatch({ id: `${PREFIX}sExp`, customerId: `${PREFIX}cust1`, durationMinutes: 30, remaining: 5, expiresAt: new Date(Date.now() - DAY_MS) });

      const summary = await getLessonCreditSummary(`${PREFIX}cust1`);
      expect(summary.totalRemaining).toBe(5);
      expect(summary.batches.map((b) => b.id).sort()).toEqual([`${PREFIX}sA`, `${PREFIX}sB`].sort());
    });

    it("returns zero for a customer with no credits", async () => {
      await seedCustomer(`${PREFIX}cust1`);
      const summary = await getLessonCreditSummary(`${PREFIX}cust1`);
      expect(summary.totalRemaining).toBe(0);
      expect(summary.batches).toHaveLength(0);
    });
  });

  describe("auto-invoice skips credit-covered bookings", () => {
    it("does not create an invoice for a booking with lessonCreditBatchId set", async () => {
      await prisma.lessonPricingOption.createMany({
        data: [{ durationMinutes: 30, priceCents: 5000, isActive: true, sortOrder: 0 }]
      });
      await seedCustomer(`${PREFIX}cust1`);
      await seedBatch({ id: `${PREFIX}covBatch`, customerId: `${PREFIX}cust1`, durationMinutes: 30, remaining: 5 });

      const now = new Date();
      await prisma.booking.create({
        data: {
          id: `${PREFIX}bkCov`,
          status: "approved",
          firstName: "Cred",
          lastName: "Cover",
          name: "Cred Cover",
          email: `${PREFIX}bkCov@example.com`,
          phone: "0400000000",
          address: "1 Test Street",
          lessonMode: "in_person",
          skillLevel: "beginner",
          lessonDuration: "min30",
          startAt: now,
          endAt: new Date(now.getTime() + 30 * 60 * 1000),
          timezone: "Australia/Melbourne",
          customerId: `${PREFIX}cust1`,
          lessonCreditBatchId: `${PREFIX}covBatch`
        }
      });

      const created = await autoCreateDraftInvoicesForApproval({
        bookings: [
          {
            id: `${PREFIX}bkCov`,
            customerId: `${PREFIX}cust1`,
            lessonDuration: "min30",
            customDurationMinutes: null,
            firstName: "Cred",
            lastName: "Cover",
            name: "Cred Cover",
            email: `${PREFIX}bkCov@example.com`,
            phone: "0400000000",
            address: "1 Test Street",
            lessonCreditBatchId: `${PREFIX}covBatch`
          }
        ],
        adminId: ADMIN_ID,
        requestId: `${PREFIX}reqCov`
      });

      expect(created).toBe(0);
      const invoices = await prisma.invoice.findMany({
        where: { bookingLinks: { some: { bookingId: `${PREFIX}bkCov` } } }
      });
      expect(invoices).toHaveLength(0);
    });
  });
});
