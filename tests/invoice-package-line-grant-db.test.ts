/**
 * DB-backed integration test for the package-on-invoice-line gap-fill
 * (phase1-leftovers, gap-fill task #10 item 1).
 *
 * The foundation added InvoiceLineItem.packageId and grantCreditsForPaidInvoice
 * reads it, but until this gap-fill NOTHING set packageId through the invoice
 * create/edit path. This suite proves the wiring that closes the
 * sell-a-package-via-invoice loop end-to-end:
 *
 *  1. createInvoiceRecord persists packageId from an InvoiceLineItemDraft (the
 *     same draft the create/edit API now builds from the package selector), so
 *     the calculation engine carries it through onto the stored line.
 *  2. Paying that invoice (the mark_paid / Stripe webhook both call
 *     grantCreditsForPaidInvoice) grants quantity * lessonCount credits to the
 *     customer, with the package's validity window applied.
 *  3. The grant is idempotent — a re-run (mark_paid retry + Stripe webhook) does
 *     NOT double-grant.
 *  4. assertPackageLinesAreValid (the server-side guard the three create/edit
 *     routes call) rejects an unknown/inactive packageId and accepts a valid one.
 *
 * This complements tests/lesson-credits-db.test.ts (which seeds the line row
 * directly): here the packageId travels through the real persistence path that
 * the gap-fill added, not a hand-inserted row.
 *
 * Every seeded row uses the `pkgline_test_` prefix and is removed in
 * beforeEach/afterEach so reruns are deterministic and rows never collide with
 * the other DB-backed suites running under the single shared runner.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  assertPackageLinesAreValid,
  grantCreditsForPaidInvoice
} from "@/lib/credits/lesson-credits";
import { createInvoiceRecord } from "@/lib/invoices/persistence";
import type { InvoiceCustomerSnapshot, InvoiceLineItemDraft } from "@/lib/invoices/types";

const PREFIX = "pkgline_test_";
const ADMIN_ID = `${PREFIX}admin`;
const DAY_MS = 24 * 60 * 60 * 1000;

async function seedAdmin() {
  await prisma.adminUser.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      email: `${PREFIX}admin@example.com`,
      displayName: "Package Line Admin",
      passwordHash: "x"
    }
  });
}

async function seedCustomer(id: string) {
  await prisma.customer.create({
    data: {
      id,
      fullName: "Package Customer",
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
  isActive?: boolean;
}) {
  await prisma.lessonPackage.create({
    data: {
      id: input.id,
      label: `Package ${input.id}`,
      lessonCount: input.lessonCount,
      durationMinutes: input.durationMinutes ?? null,
      priceCents: 12000,
      validityDays: input.validityDays ?? null,
      isActive: input.isActive ?? true,
      sortOrder: 0
    }
  });
}

const SNAPSHOT: InvoiceCustomerSnapshot = {
  customerFirstName: "Package",
  customerLastName: "Customer",
  customerName: "Package Customer",
  customerEmail: `${PREFIX}cust@example.com`,
  customerPhone: "0400000000",
  customerAddress: "1 Test Street"
};

/**
 * Create a draft invoice through the REAL persistence service with a package
 * line, mirroring the InvoiceLineItemDraft the create/edit API now builds from
 * the package selector. Returns the created invoice (with line items).
 */
function makePackageLineDraft(input: {
  packageId: string;
  quantity: number;
}): InvoiceLineItemDraft {
  return {
    description: "Lesson package",
    quantity: input.quantity,
    unitPriceCents: 12000,
    taxMode: "gst_free",
    kind: "custom",
    sortOrder: 0,
    discountKind: null,
    discountValue: null,
    packageId: input.packageId
  };
}

async function createInvoiceWithPackageLine(input: {
  customerId: string;
  packageId: string;
  quantity: number;
}) {
  return prisma.$transaction((tx) =>
    createInvoiceRecord({
      tx,
      adminId: ADMIN_ID,
      currency: "AUD",
      taxMode: "gst_free",
      customerId: input.customerId,
      customerSnapshot: { ...SNAPSHOT, customerEmail: `${input.customerId}@example.com` },
      lineItems: [makePackageLineDraft({ packageId: input.packageId, quantity: input.quantity })],
      issuedAt: new Date(),
      dueAt: new Date(Date.now() + 14 * DAY_MS)
    })
  );
}

async function cleanup() {
  await prisma.lessonCreditBatch.deleteMany({ where: { customerId: { startsWith: PREFIX } } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoice: { customerId: { startsWith: PREFIX } } } });
  await prisma.invoice.deleteMany({ where: { customerId: { startsWith: PREFIX } } });
  await prisma.lessonPackage.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.customer.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { id: ADMIN_ID } });
}

describe("package-on-invoice-line grant (DB-backed)", () => {
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

  it("persists packageId through createInvoiceRecord onto the stored line", async () => {
    await seedCustomer(`${PREFIX}cust1`);
    await seedPackage({ id: `${PREFIX}pkg5`, lessonCount: 5, durationMinutes: 30, validityDays: 90 });

    const invoice = await createInvoiceWithPackageLine({
      customerId: `${PREFIX}cust1`,
      packageId: `${PREFIX}pkg5`,
      quantity: 1
    });

    const line = await prisma.invoiceLineItem.findFirst({
      where: { invoiceId: invoice.id },
      select: { packageId: true }
    });
    expect(line?.packageId).toBe(`${PREFIX}pkg5`);
  });

  it("grants quantity * lessonCount credits when a package-line invoice is paid", async () => {
    await seedCustomer(`${PREFIX}cust1`);
    await seedPackage({ id: `${PREFIX}pkg5`, lessonCount: 5, durationMinutes: 30, validityDays: 90 });

    // A package line with quantity 2 -> 2 * 5 = 10 credits.
    const invoice = await createInvoiceWithPackageLine({
      customerId: `${PREFIX}cust1`,
      packageId: `${PREFIX}pkg5`,
      quantity: 2
    });

    const created = await grantCreditsForPaidInvoice(invoice.id);
    expect(created).toBe(1);

    const batches = await prisma.lessonCreditBatch.findMany({
      where: { sourceInvoiceId: invoice.id }
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].initialQuantity).toBe(10);
    expect(batches[0].remainingQuantity).toBe(10);
    expect(batches[0].durationMinutes).toBe(30);
    expect(batches[0].source).toBe("package_purchase");
    expect(batches[0].packageId).toBe(`${PREFIX}pkg5`);
    // validityDays=90 -> a future expiry was set.
    expect(batches[0].expiresAt).not.toBeNull();
    expect(batches[0].expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("is idempotent: mark_paid retry + Stripe webhook do not double-grant", async () => {
    await seedCustomer(`${PREFIX}cust1`);
    await seedPackage({ id: `${PREFIX}pkg5`, lessonCount: 5, durationMinutes: 30, validityDays: 90 });

    const invoice = await createInvoiceWithPackageLine({
      customerId: `${PREFIX}cust1`,
      packageId: `${PREFIX}pkg5`,
      quantity: 1
    });

    const first = await grantCreditsForPaidInvoice(invoice.id);
    const second = await grantCreditsForPaidInvoice(invoice.id);
    expect(first).toBe(1);
    expect(second).toBe(0);

    const batches = await prisma.lessonCreditBatch.findMany({
      where: { sourceInvoiceId: invoice.id }
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].remainingQuantity).toBe(5);
  });

  describe("assertPackageLinesAreValid", () => {
    it("returns null when every packageId references an active package", async () => {
      await seedPackage({ id: `${PREFIX}pkgActive`, lessonCount: 5 });
      const error = await assertPackageLinesAreValid([
        { packageId: `${PREFIX}pkgActive` },
        { packageId: null },
        {}
      ]);
      expect(error).toBeNull();
    });

    it("rejects an unknown packageId", async () => {
      const error = await assertPackageLinesAreValid([{ packageId: `${PREFIX}missing` }]);
      expect(error).not.toBeNull();
    });

    it("rejects an inactive packageId", async () => {
      await seedPackage({ id: `${PREFIX}pkgInactive`, lessonCount: 5, isActive: false });
      const error = await assertPackageLinesAreValid([{ packageId: `${PREFIX}pkgInactive` }]);
      expect(error).not.toBeNull();
    });
  });
});
