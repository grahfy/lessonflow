import { prisma } from "@/lib/db";
import {
  applyInvoiceTaxMode,
  calculateInvoiceTotals,
  resolveDiscountCents,
} from "@/lib/invoices/calculate";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { getInvoiceCurrency } from "@/lib/invoices/tax-profile";
import type { InvoiceLineItemDraft } from "@/lib/invoices/types";
import { logEvent } from "@/lib/observability";
import { appendCreditLedgerEntry, getAccountCreditBalanceCents } from "@/lib/vouchers/account-credit";

export type ApplyCreditResult =
  | {
      ok: true;
      appliedCents: number;
      newDiscountValueCents: number;
      newTotalCents: number;
      newBalanceCents: number;
    }
  | { ok: false; reason: "not_found" | "no_customer" | "not_editable" | "percent_discount" | "no_credit" | "nothing_to_apply" };

/**
 * Applies a customer's available account credit to an invoice as an "amount"
 * discount, debiting the ledger by the applied amount. One-click admin action.
 *
 * MODEL: the invoice discount engine represents a fixed discount as
 * discountKind="amount" + discountValue (cents). Account credit is layered on
 * top of any existing fixed discount by INCREASING discountValue. A percent
 * discount is refused (mixing percent + credit-as-amount is ambiguous; the
 * admin should switch to an amount discount first).
 *
 * SECURITY / INVARIANTS (real money):
 * - The applied amount is min(availableBalance, remaining invoice total). It can
 *   never exceed the balance (no phantom credit) nor the invoice total (no
 *   negative invoice).
 * - The ledger debit and the invoice discount update happen in ONE transaction,
 *   with the balance re-read inside the transaction, so concurrent applications
 *   cannot both spend the same credit. appendCreditLedgerEntry additionally
 *   throws if the balance would go negative.
 */
export async function applyAccountCreditToInvoice(input: {
  invoiceId: string;
  actorId: string;
}): Promise<ApplyCreditResult> {
  // Serializable isolation so two concurrent applications against the same
  // customer's balance cannot both read the same balance and double-spend the
  // credit (unlike voucher redemption, there is no single status-flip guard to
  // serialize on here). The loser is aborted by the DB and can be retried.
  return prisma.$transaction(
    async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    if (!invoice || invoice.isDeleted) {
      return { ok: false, reason: "not_found" } as const;
    }
    if (!invoice.customerId) {
      return { ok: false, reason: "no_customer" } as const;
    }
    // Only an unpaid, working invoice may receive credit (draft/sent). A paid or
    // void invoice must not be retro-discounted.
    if (invoice.status !== "draft" && invoice.status !== "sent") {
      return { ok: false, reason: "not_editable" } as const;
    }
    if (invoice.discountKind === "percent") {
      return { ok: false, reason: "percent_discount" } as const;
    }

    const balance = await getAccountCreditBalanceCents(invoice.customerId, tx);
    if (balance <= 0) {
      return { ok: false, reason: "no_credit" } as const;
    }

    const currency = getInvoiceCurrency(invoice.currency);

    // Recompute the pre-discount base from the line items so we know how much
    // "room" the invoice has for a discount (the discount engine caps at base).
    const baseLineDrafts: InvoiceLineItemDraft[] = invoice.lineItems.map((lineItem, index) => ({
      description: lineItem.description,
      quantity: lineItem.quantity,
      unitPriceCents: lineItem.unitPriceCents,
      taxMode: lineItem.taxMode,
      kind: lineItem.kind as InvoiceLineItemDraft["kind"],
      sortOrder: lineItem.sortOrder ?? index,
      discountKind: lineItem.discountKind ?? null,
      discountValue: lineItem.discountValue ?? null,
    }));
    const resolvedTaxMode = invoice.taxMode ?? getDefaultInvoiceTaxModeForCurrencyValue(currency);
    const normalizedLines = applyInvoiceTaxMode(baseLineDrafts, resolvedTaxMode);

    // Base before any invoice-level discount: compute with no discount.
    const baseCalc = calculateInvoiceTotals(normalizedLines, { discountKind: null, discountValue: null }, { currency });
    const baseCents = baseCalc.totals.totalCents;

    const existingDiscountValue = invoice.discountKind === "amount" ? (invoice.discountValue ?? 0) : 0;
    // How much discount room remains (the engine caps total discount at base).
    const alreadyDiscounted = resolveDiscountCents(baseCents, {
      discountKind: "amount",
      discountValue: existingDiscountValue,
    });
    const remainingRoom = Math.max(0, baseCents - alreadyDiscounted);

    const appliedCents = Math.min(balance, remainingRoom);
    if (appliedCents <= 0) {
      return { ok: false, reason: "nothing_to_apply" } as const;
    }

    const newDiscountValue = existingDiscountValue + appliedCents;

    const calculation = calculateInvoiceTotals(
      normalizedLines,
      { discountKind: "amount", discountValue: newDiscountValue },
      { currency },
    );

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        discountKind: "amount",
        discountValue: newDiscountValue,
        discountCents: calculation.totals.discountCents,
        subtotalCents: calculation.totals.subtotalCents,
        gstCents: calculation.totals.gstCents,
        totalCents: calculation.totals.totalCents,
        updatedById: input.actorId,
        auditLogs: {
          create: {
            action: "edited",
            actorId: input.actorId,
            details: `Applied account credit of ${appliedCents} cents`,
          },
        },
      },
    });

    const newBalanceCents = await appendCreditLedgerEntry(
      {
        customerId: invoice.customerId,
        amountCents: -appliedCents,
        reason: "invoice_application",
        sourceInvoiceId: invoice.id,
        note: "Account credit applied to invoice",
        createdById: input.actorId,
      },
      tx,
    );

    logEvent("account_credit.applied_to_invoice", {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      appliedCents,
      actorId: input.actorId,
    });

    return {
      ok: true,
      appliedCents,
      newDiscountValueCents: newDiscountValue,
      newTotalCents: calculation.totals.totalCents,
      newBalanceCents,
    } as const;
    },
    { isolationLevel: "Serializable" },
  );
}
