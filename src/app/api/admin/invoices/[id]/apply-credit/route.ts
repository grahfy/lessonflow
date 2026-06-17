import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { withResolvedInvoicePaymentDetails } from "@/lib/invoices/payment-details";
import { logError } from "@/lib/observability";
import { getAccountCreditBalanceCents } from "@/lib/vouchers/account-credit";
import { applyAccountCreditToInvoice } from "@/lib/vouchers/apply-credit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Owner-only: reports the available account-credit balance for the invoice's
 * customer so the invoice UI can show "Account credit: $X" and an apply button.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, customerId: true, isDeleted: true },
  });
  if (!invoice || invoice.isDeleted) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const balanceCents = invoice.customerId
    ? await getAccountCreditBalanceCents(invoice.customerId)
    : 0;

  return NextResponse.json({ balanceCents, hasCustomer: Boolean(invoice.customerId) });
}

/**
 * Owner-only one-click action: apply the customer's available account credit to
 * this invoice as an amount discount and debit the ledger. Returns the updated
 * invoice plus the applied amount and new balance.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let result;
  try {
    result = await applyAccountCreditToInvoice({ invoiceId: id, actorId: admin.id });
  } catch (error) {
    logError("account_credit.apply_failed", error, { invoiceId: id });
    return NextResponse.json({ error: "Unable to apply account credit." }, { status: 500 });
  }

  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      not_found: "Invoice not found.",
      no_customer: "This invoice has no linked customer.",
      not_editable: "Only draft or sent invoices can receive account credit.",
      percent_discount: "Remove the percentage discount before applying account credit.",
      no_credit: "This customer has no account credit available.",
      nothing_to_apply: "There is nothing to apply (invoice already fully discounted).",
    };
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: messages[result.reason] }, { status });
  }

  const updated = await prisma.invoice.findUnique({
    where: { id },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json({
    invoice: updated ? withResolvedInvoicePaymentDetails(updated) : null,
    appliedCents: result.appliedCents,
    newBalanceCents: result.newBalanceCents,
  });
}
