import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getDefaultCurrency } from "@/lib/branding";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { logEvent } from "@/lib/observability";
import { generateUniqueVoucherCode } from "@/lib/vouchers/code";
import { voucherExpiryFrom } from "@/lib/vouchers/expiry";

export const dynamic = "force-dynamic";

/**
 * Masks a bearer voucher code for the list view. A voucher code is a bearer
 * credential — anyone who reads it can redeem the value — so the management
 * list (which loads up to 500 at once and is the most exposed surface) must not
 * leak the full code. We reveal only the last group and dot out the rest; the
 * full code is available on demand via the per-voucher detail GET below.
 *
 * Codes are grouped like `ABCD-EFGH-JKLM`. We keep the final group and replace
 * earlier characters with bullets so the admin can still eyeball-match a code a
 * customer reads back without exposing enough to redeem from the list alone.
 */
function maskVoucherCode(code: string): string {
  const groups = code.split("-");
  if (groups.length <= 1) {
    // Ungrouped code: reveal the last 4 chars only.
    const tail = code.slice(-4);
    const hidden = "•".repeat(Math.max(0, code.length - tail.length));
    return `${hidden}${tail}`;
  }
  const last = groups[groups.length - 1];
  const maskedLead = groups
    .slice(0, -1)
    .map((group) => "•".repeat(group.length))
    .join("-");
  return `${maskedLead}-${last}`;
}

/**
 * Owner-only: list vouchers (newest first) for the admin management table.
 *
 * The live `code` is MASKED here (bearer credential). The UI reveals the full
 * code on demand by fetching the per-voucher detail endpoint (GET below).
 */
export async function GET(request: NextRequest) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const vouchers = await prisma.voucher.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      code: true,
      valueCents: true,
      currency: true,
      status: true,
      purchaserName: true,
      purchaserEmail: true,
      recipientName: true,
      recipientEmail: true,
      paidVia: true,
      expiresAt: true,
      redeemedAt: true,
      redeemedByCustomerId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    vouchers: vouchers.map(({ code, ...voucher }) => ({
      ...voucher,
      // Bearer credential: never return the full code in the list. The detail
      // endpoint reveals it on demand.
      codeMasked: maskVoucherCode(code),
      expiresAt: voucher.expiresAt.toISOString(),
      redeemedAt: voucher.redeemedAt ? voucher.redeemedAt.toISOString() : null,
      createdAt: voucher.createdAt.toISOString(),
    })),
  });
}

/** Validates the comp-voucher issue form. Amount is integer cents, > 0. */
const issueVoucherSchema = z.object({
  valueCents: z.number().int().positive().max(1_000_000),
  recipientName: z.string().trim().max(200).optional(),
  recipientEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Owner-only: issue a complimentary voucher (status active, no payment). The
 * code is generated server-side; admins never set their own code. Activated
 * immediately since there is no Stripe payment to await.
 */
export async function POST(request: NextRequest) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = issueVoucherSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid voucher data." }, { status: 400 });
  }

  const code = await generateUniqueVoucherCode();
  const recipientEmail = parsed.data.recipientEmail?.trim() || null;

  const voucher = await prisma.voucher.create({
    data: {
      code,
      valueCents: parsed.data.valueCents,
      currency: getDefaultCurrency(),
      status: "active",
      recipientName: parsed.data.recipientName?.trim() || null,
      recipientEmail,
      message: parsed.data.note?.trim() || null,
      issuedById: admin.id,
      paidVia: "comp",
      expiresAt: voucherExpiryFrom(),
    },
    select: {
      id: true,
      code: true,
      valueCents: true,
      currency: true,
      status: true,
      recipientName: true,
      recipientEmail: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  logEvent("voucher.comp_issued", {
    voucherId: voucher.id,
    valueCents: voucher.valueCents,
    actorId: admin.id,
  });

  return NextResponse.json({
    voucher: {
      ...voucher,
      expiresAt: voucher.expiresAt.toISOString(),
      createdAt: voucher.createdAt.toISOString(),
    },
  });
}
