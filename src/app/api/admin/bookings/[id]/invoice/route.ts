import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { findActiveInvoiceLinksForBookingIds } from "@/lib/invoices/booking-links";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { type BookingInvoiceCandidateSummary, type BookingInvoiceResolveResponse, createBookingInvoiceSchema } from "@/lib/invoices/schema";
import { getDefaultDueAt, createInvoiceRecord } from "@/lib/invoices/persistence";
import { customerSnapshotFromBooking } from "@/lib/invoices/snapshots";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ResolverCandidateInvoice = {
  id: string;
  invoiceNumber: string;
  status: "draft" | "sent" | "paid" | "void";
  issuedAt: Date;
  dueAt: Date;
  totalCents: number;
  currency: string;
  notes: string | null;
  lineItems: Array<{
    kind: string;
    description: string;
  }>;
};

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getBookingDateTokens(startAt: Date, timezone: string) {
  const isoDate = startAt.toISOString().slice(0, 10);
  const localDate = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(startAt);

  return Array.from(new Set([isoDate, localDate].filter(Boolean))).map((value) => value.toLowerCase());
}

function getCandidateSummary(invoice: ResolverCandidateInvoice, bookingDateTokens: string[], bookingStartAt: Date) {
  const notes = normalizeSearchText(invoice.notes);
  const lineDescriptions = invoice.lineItems.map((lineItem) => normalizeSearchText(lineItem.description));
  const lessonLineCount = invoice.lineItems.filter((lineItem) => lineItem.kind === "lesson_fee").length;
  const bookingDateMention = bookingDateTokens.find((token) => notes.includes(token) || lineDescriptions.some((value) => value.includes(token))) ?? null;
  const dayDistance = Math.abs(Math.round((invoice.issuedAt.getTime() - bookingStartAt.getTime()) / (24 * 60 * 60 * 1000)));

  if (bookingDateMention) {
    const location = notes.includes(bookingDateMention) ? "notes" : "line items";
    return {
      priority: 0,
      dayDistance,
      summary: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        issuedAt: invoice.issuedAt.toISOString(),
        dueAt: invoice.dueAt.toISOString(),
        totalCents: invoice.totalCents,
        currency: invoice.currency,
        matchReason: `Mentions booking date in ${location}.`
      } satisfies BookingInvoiceCandidateSummary
    };
  }

  if (lessonLineCount > 0 && dayDistance <= 30) {
    return {
      priority: 1,
      dayDistance,
      summary: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        issuedAt: invoice.issuedAt.toISOString(),
        dueAt: invoice.dueAt.toISOString(),
        totalCents: invoice.totalCents,
        currency: invoice.currency,
        matchReason: `Nearby lesson invoice (${dayDistance} day${dayDistance === 1 ? "" : "s"} from booking date).`
      } satisfies BookingInvoiceCandidateSummary
    };
  }

  return null;
}

function rankBookingInvoiceCandidates(invoices: ResolverCandidateInvoice[], bookingStartAt: Date, timezone: string) {
  const bookingDateTokens = getBookingDateTokens(bookingStartAt, timezone);
  const exactMatches: Array<{ dayDistance: number; summary: BookingInvoiceCandidateSummary }> = [];
  const nearbyLessonMatches: Array<{ dayDistance: number; summary: BookingInvoiceCandidateSummary }> = [];

  for (const invoice of invoices) {
    const candidate = getCandidateSummary(invoice, bookingDateTokens, bookingStartAt);
    if (!candidate) {
      continue;
    }

    if (candidate.priority === 0) {
      exactMatches.push({ dayDistance: candidate.dayDistance, summary: candidate.summary });
      continue;
    }

    nearbyLessonMatches.push({ dayDistance: candidate.dayDistance, summary: candidate.summary });
  }

  exactMatches.sort((a, b) => a.dayDistance - b.dayDistance || a.summary.invoiceNumber.localeCompare(b.summary.invoiceNumber));
  nearbyLessonMatches.sort((a, b) => a.dayDistance - b.dayDistance || a.summary.invoiceNumber.localeCompare(b.summary.invoiceNumber));

  return [
    ...exactMatches.map((candidate) => candidate.summary),
    ...nearbyLessonMatches.slice(0, 3).map((candidate) => candidate.summary)
  ];
}

async function requireOwnerAdmin(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    } as const;
  }
  if (!isOwnerAdmin(admin)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    } as const;
  }

  return {
    admin
  } as const;
}

async function loadBooking(id: string) {
  return prisma.booking.findUnique({
    where: { id }
  });
}

/**
 * Resolves whether booking billing should open an existing invoice, show likely
 * candidates, or proceed to creating a new booking-linked draft.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireOwnerAdmin(request);
    if ("error" in auth) {
      return auth.error;
    }

    const { id } = await params;
    const booking = await loadBooking(id);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const activeLinks = await prisma.$transaction((tx) => findActiveInvoiceLinksForBookingIds(tx, [booking.id]));
    if (activeLinks.length > 0) {
      const response: BookingInvoiceResolveResponse = {
        outcome: "open_existing",
        invoiceId: activeLinks[0].invoice.id
      };
      return NextResponse.json(response);
    }

    if (!booking.customerId) {
      const response: BookingInvoiceResolveResponse = { outcome: "create_new" };
      return NextResponse.json(response);
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        customerId: booking.customerId,
        documentType: "invoice",
        isDeleted: false,
        status: {
          not: "void"
        }
      },
      orderBy: {
        issuedAt: "desc"
      },
      take: 25,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        issuedAt: true,
        dueAt: true,
        totalCents: true,
        currency: true,
        notes: true,
        lineItems: {
          select: {
            kind: true,
            description: true
          }
        }
      }
    });

    const candidates = rankBookingInvoiceCandidates(invoices, booking.startAt, booking.timezone);
    if (candidates.length > 0) {
      const response: BookingInvoiceResolveResponse = {
        outcome: "choose_candidate",
        candidates
      };
      return NextResponse.json(response);
    }

    const response: BookingInvoiceResolveResponse = { outcome: "create_new" };
    return NextResponse.json(response);
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to resolve booking invoice.");
  }
}

/**
 * Creates a draft invoice from a selected booking dialog action.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireOwnerAdmin(request);
    if ("error" in auth) {
      return auth.error;
    }
    const { admin } = auth;

    const { id } = await params;
    const booking = await loadBooking(id);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const activeLinks = await prisma.$transaction((tx) => findActiveInvoiceLinksForBookingIds(tx, [booking.id]));
    if (activeLinks.length > 0) {
      return NextResponse.json({ error: "Booking is already linked to an active invoice." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createBookingInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invoice payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const taxMode = parsed.data.taxMode ?? getDefaultInvoiceTaxModeForCurrencyValue(parsed.data.currency);
    const lineItems: InvoiceLineItemDraft[] = parsed.data.lineItems.map((item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      taxMode: item.taxMode || taxMode,
      kind: item.kind,
      sortOrder: item.sortOrder ?? index,
      discountKind: item.discountKind ?? null,
      discountValue: item.discountValue ?? null
    }));

    const issuedAt = new Date();
    const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : getDefaultDueAt(issuedAt);
    const invoice = await prisma.$transaction((tx) =>
      createInvoiceRecord({
        tx,
        adminId: admin.id,
        currency: parsed.data.currency,
        taxMode,
        customerId: booking.customerId,
        bookingId: booking.id,
        bookingIds: [booking.id],
        customerSnapshot: customerSnapshotFromBooking(booking),
        invoiceDiscount: {
          discountKind: parsed.data.discountKind ?? null,
          discountValue: parsed.data.discountValue ?? null
        },
        lineItems,
        notes: parsed.data.notes,
        issuedAt,
        dueAt
      })
    );

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create invoice.");
  }
}
