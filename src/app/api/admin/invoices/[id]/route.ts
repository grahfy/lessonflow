import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { applyInvoiceTaxMode, calculateInvoiceTotals } from "@/lib/invoices/calculate";
import { findActiveInvoiceLinksForBookingIds } from "@/lib/invoices/booking-links";
import { assertPackageLinesAreValid, grantCreditsForPaidInvoice } from "@/lib/credits/lesson-credits";
import { logError } from "@/lib/observability";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { resolveInvoicePaymentDetails, withResolvedInvoicePaymentDetails } from "@/lib/invoices/payment-details";
import { updateInvoiceSchema } from "@/lib/invoices/schema";
import { allowedStatusesForAction, canApplyInvoiceAction, type InvoiceLifecycleAction, type InvoiceLifecycleStatus } from "@/lib/invoices/transitions";
import { getInvoiceCurrency } from "@/lib/invoices/tax-profile";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";
import { APP_TIMEZONE, dateTimeLocalToDate, toDateKey } from "@/lib/time";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Returns one invoice record with line items for detail views.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lineItems: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });
  if (!invoice || invoice.isDeleted) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  return NextResponse.json({ invoice: withResolvedInvoicePaymentDetails(invoice) });
}

/**
 * Applies invoice edits and lifecycle transitions with explicit audit records.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invoice payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lineItems: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  if (existing.isDeleted && parsed.data.action !== "restore") {
    return NextResponse.json({ error: "Deleted invoices can only be restored." }, { status: 400 });
  }

  if (existing.documentType === "credit_note" && parsed.data.action === "edit" && parsed.data.lineItems?.length) {
    // RATIONALE: Credit notes are accounting corrections that should preserve
    // their original financial breakdown. Admins may still adjust notes/due
    // date metadata, but not rewrite the credited line items after issuance.
    return NextResponse.json(
      { error: "Credit-note line items are immutable. Update notes or due date only." },
      { status: 400 }
    );
  }

  if (parsed.data.action === "restore") {
    const bookingLinks = await prisma.invoiceBookingLink.findMany({
      where: {
        invoiceId: id
      },
      select: {
        bookingId: true
      }
    });
    const linkedBookingIds = Array.from(
      new Set([
        ...bookingLinks.map((link) => link.bookingId),
        ...(existing.bookingId ? [existing.bookingId] : [])
      ])
    );
    if (linkedBookingIds.length > 0) {
      const activeLinks = await prisma.$transaction((tx) =>
        findActiveInvoiceLinksForBookingIds(
          tx,
          linkedBookingIds,
          { excludeInvoiceId: id }
        )
      );
      if (activeLinks.length > 0) {
        return NextResponse.json(
          { error: "Invoice cannot be restored because one or more linked bookings are now billed on another active invoice." },
          { status: 409 }
        );
      }
    }

    const restored = await prisma.invoice.update({
      where: { id },
      data: {
        isDeleted: false,
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "restored",
            actorId: admin.id,
            details: "Invoice restored"
          }
        }
      },
      include: {
        lineItems: {
          orderBy: {
            sortOrder: "asc"
          }
        }
      }
    });
    return NextResponse.json({ invoice: withResolvedInvoicePaymentDetails(restored) });
  }

  if (parsed.data.action === "edit" && (existing.status === "paid" || existing.status === "void")) {
    return NextResponse.json(
      { error: "Paid or void invoices cannot be edited directly." },
      { status: 400 }
    );
  }

  if (parsed.data.action === "mark_paid" || parsed.data.action === "mark_unpaid" || parsed.data.action === "void") {
    const action: InvoiceLifecycleAction = parsed.data.action;
    const currentStatus = existing.status as InvoiceLifecycleStatus;
    // NOTE: Transition rules live in the shared invoices domain module so UI and
    // API agree on what lifecycle actions are legal from each status.
    if (!canApplyInvoiceAction(currentStatus, action)) {
      return NextResponse.json(
        {
          error: "Invalid invoice transition.",
          details: {
            action,
            status: existing.status,
            allowedFrom: allowedStatusesForAction(action)
          }
        },
        { status: 400 }
      );
    }
  }

  if (parsed.data.action === "mark_paid") {
    // Admins may backdate the payment date (e.g. recording a payment that was
    // actually collected earlier via a legacy system); reports bucket revenue
    // by `paidAt`, so this directly affects those figures. Default to now
    // when no date is supplied.
    let paidAt: Date;
    if (parsed.data.paidAt) {
      // The date picker sends a date-only string ("2026-07-04"); `new Date(...)`
      // would parse that as UTC midnight, which lands on the previous calendar
      // day for negative-offset zones. Resolve date-only values at midday in
      // APP_TIMEZONE so the calendar day is stable; full ISO datetimes (which
      // already carry an offset) are parsed as-is.
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.paidAt);
      const resolved = isDateOnly
        ? dateTimeLocalToDate(`${parsed.data.paidAt}T12:00`, APP_TIMEZONE)
        : new Date(parsed.data.paidAt);
      if (!resolved || Number.isNaN(resolved.getTime())) {
        return NextResponse.json({ error: "Invalid payment date." }, { status: 400 });
      }
      paidAt = resolved;
    } else {
      paidAt = new Date();
    }

    // A payment cannot have happened in the future; a future `paidAt` would
    // corrupt revenue report bucketing. Reject anything past the end of today in
    // APP_TIMEZONE.
    const endOfTodayLocal = dateTimeLocalToDate(`${toDateKey(new Date(), APP_TIMEZONE)}T23:59`, APP_TIMEZONE);
    if (endOfTodayLocal && paidAt.getTime() > endOfTodayLocal.getTime()) {
      return NextResponse.json({ error: "Payment date cannot be in the future." }, { status: 400 });
    }

    const paid = await prisma.invoice.update({
      where: { id },
      data: {
        status: "paid",
        paidAt,
        paidVia: "manual",
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "marked_paid",
            actorId: admin.id,
            details: "Invoice marked as paid"
          }
        }
      },
      include: {
        lineItems: {
          orderBy: {
            sortOrder: "asc"
          }
        }
      }
    });

    // Grant any prepaid lesson credits for package line items on this invoice.
    // Best-effort + idempotent (keyed on sourceInvoiceId): a failure here must
    // not roll back the already-committed paid transition.
    try {
      await grantCreditsForPaidInvoice(paid.id);
    } catch (creditError) {
      logError("lesson_credits.grant_failed_mark_paid", creditError, { invoiceId: paid.id });
    }

    return NextResponse.json({ invoice: withResolvedInvoicePaymentDetails(paid) });
  }

  if (parsed.data.action === "mark_unpaid") {
    // Reverting paid -> unpaid must also undo the lesson-credit grant that
    // mark_paid / the Stripe webhook produced for this invoice, otherwise the
    // customer keeps prepaid credits for a payment that no longer exists.
    //
    // SAFETY: we only delete batches that are still fully intact
    // (remainingQuantity === initialQuantity). If ANY credit from a batch has
    // already been consumed by a booking, we cannot cleanly un-consume it
    // (bookings hold a SetNull FK to the batch and revoking would orphan a
    // confirmed booking's credit), so we block the transition with a clear
    // error and let the operator resolve the bookings first. The check and the
    // revoke run inside the same transaction as the status flip so they cannot
    // diverge.
    try {
      const unpaid = await prisma.$transaction(async (tx) => {
        const grantedBatches = await tx.lessonCreditBatch.findMany({
          where: { sourceInvoiceId: id },
          select: { id: true, initialQuantity: true, remainingQuantity: true }
        });

        const consumed = grantedBatches.some(
          (batch) => batch.remainingQuantity < batch.initialQuantity
        );
        if (consumed) {
          // Sentinel error caught below and surfaced as a 409 so the operator
          // knows why the transition was refused.
          throw new Error("CREDITS_CONSUMED");
        }

        if (grantedBatches.length > 0) {
          await tx.lessonCreditBatch.deleteMany({
            where: { id: { in: grantedBatches.map((batch) => batch.id) } }
          });
        }

        return tx.invoice.update({
          where: { id },
          data: {
            status: existing.sentAt ? "sent" : "draft",
            paidAt: null,
            updatedById: admin.id,
            auditLogs: {
              create: {
                action: "marked_unpaid",
                actorId: admin.id,
                details: "Invoice marked as unpaid"
              }
            }
          },
          include: {
            lineItems: {
              orderBy: {
                sortOrder: "asc"
              }
            }
          }
        });
      });

      return NextResponse.json({ invoice: withResolvedInvoicePaymentDetails(unpaid) });
    } catch (error) {
      if (error instanceof Error && error.message === "CREDITS_CONSUMED") {
        return NextResponse.json(
          {
            error:
              "This invoice's prepaid lesson credits have already been used for a booking and cannot be revoked. Resolve the affected bookings before marking it unpaid."
          },
          { status: 409 }
        );
      }
      throw error;
    }
  }

  if (parsed.data.action === "void") {
    const voided = await prisma.invoice.update({
      where: { id },
      data: {
        status: "void",
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "voided",
            actorId: admin.id,
            details: "Invoice voided"
          }
        }
      },
      include: {
        lineItems: {
          orderBy: {
            sortOrder: "asc"
          }
        }
      }
    });
    return NextResponse.json({ invoice: withResolvedInvoicePaymentDetails(voided) });
  }

  const lineItemsProvided = Boolean(parsed.data.lineItems?.length);
  const sourceLineItems = lineItemsProvided && parsed.data.lineItems ? parsed.data.lineItems : existing.lineItems;
  // RATIONALE: Tax-mode changes must be applied against the full working set of
  // line items, even when the admin only toggles GST behavior and leaves the
  // descriptions/quantities untouched.
  const baseLineDrafts: InvoiceLineItemDraft[] = sourceLineItems.map((lineItem, index) => ({
    description: lineItem.description,
    quantity: lineItem.quantity,
    unitPriceCents: lineItem.unitPriceCents,
    taxMode: lineItem.taxMode,
    kind: lineItem.kind as InvoiceLineItemDraft["kind"],
    sortOrder: lineItem.sortOrder ?? index,
    discountKind: lineItem.discountKind ?? null,
    discountValue: lineItem.discountValue ?? null,
    // packageId survives an edit whether the line came from the client payload or
    // the existing persisted rows (a tax-mode-only edit reuses existing lines).
    packageId: lineItem.packageId ?? null
  }));

  // SECURITY: When the admin sends a new line-item set, any package linkage must
  // reference an existing, active package before we persist (it auto-grants
  // credits on payment). Existing persisted packageIds are trusted as-is.
  if (lineItemsProvided) {
    const packageError = await assertPackageLinesAreValid(baseLineDrafts);
    if (packageError) {
      return NextResponse.json({ error: packageError }, { status: 400 });
    }
  }

  const currency = getInvoiceCurrency(parsed.data.currency ?? existing.currency);
  const resolvedTaxMode = parsed.data.taxMode ?? existing.taxMode ?? getDefaultInvoiceTaxModeForCurrencyValue(currency);
  const resolvedPaymentDetailsSource = parsed.data.paymentDetailsSource ?? existing.paymentDetailsSource;
  const effectiveExistingPaymentDetails = resolveInvoicePaymentDetails(existing);
  const normalizedLines = parsed.data.taxMode
    ? applyInvoiceTaxMode(baseLineDrafts, resolvedTaxMode)
    : baseLineDrafts;
  const calculation = calculateInvoiceTotals(normalizedLines, {
    discountKind: parsed.data.discountKind === undefined ? existing.discountKind : parsed.data.discountKind,
    discountValue: parsed.data.discountValue === undefined ? existing.discountValue : parsed.data.discountValue
  }, {
    currency
  });

  const updated = await prisma.$transaction(async (tx) => {
    if (lineItemsProvided || parsed.data.taxMode || parsed.data.currency) {
      // RATIONALE: Replacing the line-item set inside one transaction keeps the
      // invoice totals and stored line rows in sync. Partial updates here would
      // risk stale totals or mismatched tax calculations.
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLineItem.createMany({
        data: calculation.lineItems.map((lineItem) => ({
          invoiceId: id,
          kind: lineItem.kind,
          description: lineItem.description,
          quantity: lineItem.quantity,
          unitPriceCents: lineItem.unitPriceCents,
          taxMode: lineItem.taxMode,
          discountKind: lineItem.discountKind ?? null,
          discountValue: lineItem.discountValue ?? null,
          lineDiscountCents: lineItem.lineDiscountCents,
          lineSubtotalCents: lineItem.lineSubtotalCents,
          lineGstCents: lineItem.lineGstCents,
          lineTotalCents: lineItem.lineTotalCents,
          sortOrder: lineItem.sortOrder,
          packageId: lineItem.packageId ?? null
        }))
      });
    }

    return tx.invoice.update({
      where: { id },
      data: {
        customerFirstName: parsed.data.customerFirstName ?? existing.customerFirstName,
        customerLastName: parsed.data.customerLastName ?? existing.customerLastName,
        customerName: parsed.data.customerName ?? existing.customerName,
        customerEmail: parsed.data.customerEmail ?? existing.customerEmail,
        customerPhone: parsed.data.customerPhone ?? existing.customerPhone,
        customerAddress: parsed.data.customerAddress ?? existing.customerAddress,
        paymentDetailsSource: resolvedPaymentDetailsSource,
        bankName: resolvedPaymentDetailsSource === "custom"
          ? parsed.data.bankName ?? effectiveExistingPaymentDetails.bankName
          : existing.bankName,
        bankBsb: resolvedPaymentDetailsSource === "custom"
          ? parsed.data.bankBsb ?? effectiveExistingPaymentDetails.bankBsb
          : existing.bankBsb,
        bankAccountName: resolvedPaymentDetailsSource === "custom"
          ? parsed.data.bankAccountName ?? effectiveExistingPaymentDetails.bankAccountName
          : existing.bankAccountName,
        bankAccountNumber: resolvedPaymentDetailsSource === "custom"
          ? parsed.data.bankAccountNumber ?? effectiveExistingPaymentDetails.bankAccountNumber
          : existing.bankAccountNumber,
        currency,
        taxMode: resolvedTaxMode,
        discountKind: parsed.data.discountKind === undefined ? existing.discountKind : parsed.data.discountKind,
        discountValue: parsed.data.discountValue === undefined ? existing.discountValue : parsed.data.discountValue,
        discountCents: calculation.totals.discountCents,
        notes: parsed.data.notes === null ? null : parsed.data.notes ?? existing.notes,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : existing.dueAt,
        subtotalCents: calculation.totals.subtotalCents,
        gstCents: calculation.totals.gstCents,
        totalCents: calculation.totals.totalCents,
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "edited",
            actorId: admin.id,
            details: "Invoice edited"
          }
        }
      },
      include: {
        lineItems: {
          orderBy: {
            sortOrder: "asc"
          }
        }
      }
    });
  });

  return NextResponse.json({ invoice: withResolvedInvoicePaymentDetails(updated) });
}

/**
 * Soft-deletes an invoice so it no longer appears in default admin views.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  // Owner override for the sent/paid guard. Absent this flag the default guard
  // stands so an issued invoice can never be deleted by accident.
  const force = request.nextUrl.searchParams.get("force") === "true";
  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const isIssuedInvoice =
    existing.documentType === "invoice" && (existing.status === "sent" || existing.status === "paid");

  if (isIssuedInvoice && !force) {
    // RATIONALE: Issued financial documents should remain part of the audit
    // trail. Operators must correct them with credit notes rather than hiding
    // them via delete once they have been sent or paid. Owners may override with
    // an explicit `force` confirmation (handled below).
    return NextResponse.json(
      { error: "Sent or paid invoices cannot be deleted. Create a credit note instead." },
      { status: 400 }
    );
  }

  const auditDetails = isIssuedInvoice
    ? `Invoice force-deleted (${existing.status} override)`
    : "Invoice soft-deleted";

  // A force-deleted PAID invoice may have granted prepaid lesson credits. Mirror
  // the mark_unpaid safety: revoke batches that are still fully intact, and
  // refuse the delete if any credit was already consumed by a booking (revoking
  // it would orphan a confirmed booking's credit). The revoke and the soft-delete
  // run in one transaction so they cannot diverge.
  if (force && existing.status === "paid") {
    try {
      await prisma.$transaction(async (tx) => {
        const grantedBatches = await tx.lessonCreditBatch.findMany({
          where: { sourceInvoiceId: id },
          select: { id: true, initialQuantity: true, remainingQuantity: true }
        });

        const consumed = grantedBatches.some(
          (batch) => batch.remainingQuantity < batch.initialQuantity
        );
        if (consumed) {
          throw new Error("CREDITS_CONSUMED");
        }

        if (grantedBatches.length > 0) {
          await tx.lessonCreditBatch.deleteMany({
            where: { id: { in: grantedBatches.map((batch) => batch.id) } }
          });
        }

        await tx.invoice.update({
          where: { id },
          data: {
            isDeleted: true,
            updatedById: admin.id,
            auditLogs: {
              create: {
                action: "deleted",
                actorId: admin.id,
                details: `${auditDetails}; prepaid credits revoked`
              }
            }
          }
        });
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === "CREDITS_CONSUMED") {
        return NextResponse.json(
          {
            error:
              "This invoice's prepaid lesson credits have already been used for a booking and cannot be revoked. Resolve the affected bookings before deleting it."
          },
          { status: 409 }
        );
      }
      throw error;
    }
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      isDeleted: true,
      updatedById: admin.id,
      auditLogs: {
        create: {
          action: "deleted",
          actorId: admin.id,
          details: auditDetails
        }
      }
    }
  });

  return NextResponse.json({ ok: true });
}
