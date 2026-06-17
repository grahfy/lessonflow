/**
 * DB-backed integration tests for monetary account credit (phase1-leftovers,
 * workstream C). Exercises the real ledger + apply-to-invoice logic in
 * src/lib/vouchers/account-credit.ts and src/lib/vouchers/apply-credit.ts.
 *
 * Coverage:
 *  - appendCreditLedgerEntry: running balance accumulates; a debit larger than
 *    the balance throws rather than writing a negative ledger row.
 *  - applyAccountCreditToInvoice: applies min(balance, invoice room) as an
 *    "amount" discount, debits the ledger by exactly that amount, never drives
 *    the balance negative, caps at the invoice total (no negative invoice), and
 *    refuses paid/void invoices and percent-discount invoices.
 *
 * Seeded rows use the `acred_test_` prefix; cleaned before/after each test.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  appendCreditLedgerEntry,
  appendCreditLedgerEntrySafe,
  getAccountCreditBalanceCents
} from "@/lib/vouchers/account-credit";
import { applyAccountCreditToInvoice } from "@/lib/vouchers/apply-credit";

const PREFIX = "acred_test_";
const ADMIN_ID = `${PREFIX}admin`;
const DAY_MS = 24 * 60 * 60 * 1000;

async function seedAdmin() {
  await prisma.adminUser.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      email: `${PREFIX}admin@example.com`,
      displayName: "Account Credit Admin",
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

/** Grant `cents` of account credit to a customer via a single ledger entry. */
async function grantCredit(customerId: string, cents: number) {
  await prisma.$transaction((tx) =>
    appendCreditLedgerEntry(
      { customerId, amountCents: cents, reason: "admin_adjustment", note: "test grant" },
      tx
    )
  );
}

/**
 * Seed an invoice with a single taxable lesson_fee line. Totals are computed for
 * a GST-free line to keep the math simple (total === subtotal === unitPrice).
 */
async function seedInvoice(input: {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  totalCents: number;
  status?: "draft" | "sent" | "paid" | "void";
  discountKind?: "amount" | "percent" | null;
  discountValue?: number | null;
}) {
  await prisma.invoice.create({
    data: {
      id: input.id,
      invoiceNumber: input.invoiceNumber,
      status: input.status ?? "draft",
      // GST-free at the invoice level so the apply-credit recompute keeps
      // total === subtotal === line price; that makes the applied-amount and
      // remaining-room math exact and easy to assert on.
      taxMode: "gst_free",
      customerId: input.customerId,
      customerName: "Credit Customer",
      customerEmail: "credit@example.com",
      customerPhone: "0400000000",
      customerAddress: "1 Test Street",
      sellerBusinessName: "MGS",
      sellerAbn: "12345678901",
      bankName: "Test Bank",
      bankBsb: "000-000",
      bankAccountName: "MGS",
      bankAccountNumber: "12345678",
      subtotalCents: input.totalCents,
      gstCents: 0,
      totalCents: input.totalCents,
      discountKind: input.discountKind ?? null,
      discountValue: input.discountValue ?? null,
      discountCents: 0,
      issuedAt: new Date(),
      dueAt: new Date(Date.now() + 14 * DAY_MS),
      createdById: ADMIN_ID,
      lineItems: {
        create: {
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: input.totalCents,
          taxMode: "gst_free",
          lineSubtotalCents: input.totalCents,
          lineGstCents: 0,
          lineTotalCents: input.totalCents,
          sortOrder: 0
        }
      }
    }
  });
}

async function getInvoice(id: string) {
  return prisma.invoice.findUniqueOrThrow({ where: { id } });
}

async function cleanup() {
  await prisma.invoiceAuditLog.deleteMany({ where: { invoice: { id: { startsWith: PREFIX } } } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: { startsWith: PREFIX } } });
  await prisma.invoice.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.customerCreditLedger.deleteMany({ where: { customerId: { startsWith: PREFIX } } });
  await prisma.customer.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { id: ADMIN_ID } });
}

describe("account credit (DB-backed)", () => {
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

  describe("appendCreditLedgerEntry", () => {
    it("accumulates a running balance across entries", async () => {
      await seedCustomer(`${PREFIX}c1`);
      await grantCredit(`${PREFIX}c1`, 5000);
      await grantCredit(`${PREFIX}c1`, 3000);
      expect(await getAccountCreditBalanceCents(`${PREFIX}c1`)).toBe(8000);

      await prisma.$transaction((tx) =>
        appendCreditLedgerEntry(
          { customerId: `${PREFIX}c1`, amountCents: -2000, reason: "invoice_application", note: "debit" },
          tx
        )
      );
      expect(await getAccountCreditBalanceCents(`${PREFIX}c1`)).toBe(6000);
    });

    it("lands both of two concurrent same-customer grants (no lost credit)", async () => {
      // Regression for the ledger balance race: appendCreditLedgerEntry reads
      // the prior balance then writes balanceAfterCents. Two grants fired at
      // once must NOT both read balance 0 and have the loser overwrite the
      // winner — the Serializable transaction in appendCreditLedgerEntrySafe
      // forces them to serialize, so the final balance is the SUM of both.
      await seedCustomer(`${PREFIX}c1`);

      // appendCreditLedgerEntrySafe opens its own Serializable tx; under
      // contention the DB aborts the loser, so we retry on serialization
      // failure (this is the documented caller contract).
      async function grantWithRetry(cents: number) {
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await appendCreditLedgerEntrySafe({
              customerId: `${PREFIX}c1`,
              amountCents: cents,
              reason: "admin_adjustment",
              note: "concurrent grant"
            });
          } catch (error) {
            if (attempt >= 5) throw error;
            // Brief backoff before retrying a serialization abort.
            await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
          }
        }
      }

      await Promise.all([grantWithRetry(5000), grantWithRetry(3000)]);

      // Both grants landed: balance is the sum, and the ledger holds exactly two
      // positive rows whose balanceAfterCents are 5000-then-8000 in some order.
      expect(await getAccountCreditBalanceCents(`${PREFIX}c1`)).toBe(8000);

      const rows = await prisma.customerCreditLedger.findMany({
        where: { customerId: `${PREFIX}c1` },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { amountCents: true, balanceAfterCents: true }
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.amountCents).sort((a, b) => a - b)).toEqual([3000, 5000]);
      // The final running balance equals the sum; no row understated it.
      expect(Math.max(...rows.map((r) => r.balanceAfterCents))).toBe(8000);
    });

    it("throws rather than writing a negative balance", async () => {
      await seedCustomer(`${PREFIX}c1`);
      await grantCredit(`${PREFIX}c1`, 1000);

      await expect(
        prisma.$transaction((tx) =>
          appendCreditLedgerEntry(
            { customerId: `${PREFIX}c1`, amountCents: -5000, reason: "invoice_application" },
            tx
          )
        )
      ).rejects.toThrow(/negative/i);

      // Balance is unchanged; no negative row was persisted.
      expect(await getAccountCreditBalanceCents(`${PREFIX}c1`)).toBe(1000);
    });
  });

  describe("applyAccountCreditToInvoice", () => {
    it("applies the full balance when it fits under the invoice total", async () => {
      await seedCustomer(`${PREFIX}c1`);
      await grantCredit(`${PREFIX}c1`, 4000);
      await seedInvoice({ id: `${PREFIX}inv1`, invoiceNumber: `${PREFIX}INV1`, customerId: `${PREFIX}c1`, totalCents: 10000 });

      const result = await applyAccountCreditToInvoice({ invoiceId: `${PREFIX}inv1`, actorId: ADMIN_ID });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.appliedCents).toBe(4000);
        expect(result.newBalanceCents).toBe(0);
        expect(result.newTotalCents).toBe(6000);
      }

      const invoice = await getInvoice(`${PREFIX}inv1`);
      expect(invoice.discountKind).toBe("amount");
      expect(invoice.discountValue).toBe(4000);
      expect(invoice.totalCents).toBe(6000);
      expect(await getAccountCreditBalanceCents(`${PREFIX}c1`)).toBe(0);
    });

    it("caps the applied amount at the invoice total (no negative invoice)", async () => {
      await seedCustomer(`${PREFIX}c1`);
      // Balance exceeds the invoice total.
      await grantCredit(`${PREFIX}c1`, 25000);
      await seedInvoice({ id: `${PREFIX}inv1`, invoiceNumber: `${PREFIX}INV1`, customerId: `${PREFIX}c1`, totalCents: 10000 });

      const result = await applyAccountCreditToInvoice({ invoiceId: `${PREFIX}inv1`, actorId: ADMIN_ID });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Only the invoice room (10000) is applied, not the full 25000 balance.
        expect(result.appliedCents).toBe(10000);
        expect(result.newTotalCents).toBe(0);
        expect(result.newBalanceCents).toBe(15000);
      }
      const invoice = await getInvoice(`${PREFIX}inv1`);
      expect(invoice.totalCents).toBe(0);
      // Remaining credit stays on the customer's balance.
      expect(await getAccountCreditBalanceCents(`${PREFIX}c1`)).toBe(15000);
    });

    it("debits the ledger by exactly the applied amount", async () => {
      await seedCustomer(`${PREFIX}c1`);
      await grantCredit(`${PREFIX}c1`, 8000);
      await seedInvoice({ id: `${PREFIX}inv1`, invoiceNumber: `${PREFIX}INV1`, customerId: `${PREFIX}c1`, totalCents: 5000 });

      await applyAccountCreditToInvoice({ invoiceId: `${PREFIX}inv1`, actorId: ADMIN_ID });

      const debit = await prisma.customerCreditLedger.findFirst({
        where: { customerId: `${PREFIX}c1`, reason: "invoice_application" }
      });
      expect(debit?.amountCents).toBe(-5000);
      expect(debit?.balanceAfterCents).toBe(3000);
      expect(debit?.sourceInvoiceId).toBe(`${PREFIX}inv1`);
    });

    it("refuses a paid invoice", async () => {
      await seedCustomer(`${PREFIX}c1`);
      await grantCredit(`${PREFIX}c1`, 5000);
      await seedInvoice({ id: `${PREFIX}inv1`, invoiceNumber: `${PREFIX}INV1`, customerId: `${PREFIX}c1`, totalCents: 10000, status: "paid" });

      const result = await applyAccountCreditToInvoice({ invoiceId: `${PREFIX}inv1`, actorId: ADMIN_ID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("not_editable");
      }
      // No credit consumed.
      expect(await getAccountCreditBalanceCents(`${PREFIX}c1`)).toBe(5000);
    });

    it("refuses a void invoice", async () => {
      await seedCustomer(`${PREFIX}c1`);
      await grantCredit(`${PREFIX}c1`, 5000);
      await seedInvoice({ id: `${PREFIX}inv1`, invoiceNumber: `${PREFIX}INV1`, customerId: `${PREFIX}c1`, totalCents: 10000, status: "void" });

      const result = await applyAccountCreditToInvoice({ invoiceId: `${PREFIX}inv1`, actorId: ADMIN_ID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("not_editable");
      }
      expect(await getAccountCreditBalanceCents(`${PREFIX}c1`)).toBe(5000);
    });

    it("refuses an invoice with a percent discount", async () => {
      await seedCustomer(`${PREFIX}c1`);
      await grantCredit(`${PREFIX}c1`, 5000);
      await seedInvoice({
        id: `${PREFIX}inv1`,
        invoiceNumber: `${PREFIX}INV1`,
        customerId: `${PREFIX}c1`,
        totalCents: 10000,
        discountKind: "percent",
        discountValue: 10
      });

      const result = await applyAccountCreditToInvoice({ invoiceId: `${PREFIX}inv1`, actorId: ADMIN_ID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("percent_discount");
      }
      expect(await getAccountCreditBalanceCents(`${PREFIX}c1`)).toBe(5000);
    });

    it("returns no_credit when the customer has no balance", async () => {
      await seedCustomer(`${PREFIX}c1`);
      await seedInvoice({ id: `${PREFIX}inv1`, invoiceNumber: `${PREFIX}INV1`, customerId: `${PREFIX}c1`, totalCents: 10000 });

      const result = await applyAccountCreditToInvoice({ invoiceId: `${PREFIX}inv1`, actorId: ADMIN_ID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("no_credit");
      }
    });
  });
});
