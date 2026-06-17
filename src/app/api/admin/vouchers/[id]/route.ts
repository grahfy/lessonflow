import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { logEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Owner-only: reveal a single voucher's FULL bearer code on demand.
 *
 * The list endpoint masks `code` so the management table never leaks redeemable
 * credentials in bulk; this per-voucher GET is the deliberate, owner-gated path
 * to read the full code (e.g. to re-share it with a recipient). Returns the
 * full record including `code`.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const voucher = await prisma.voucher.findUnique({
    where: { id },
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

  if (!voucher) {
    return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
  }

  logEvent("voucher.code_revealed", { voucherId: voucher.id, actorId: admin.id });

  return NextResponse.json({
    voucher: {
      ...voucher,
      expiresAt: voucher.expiresAt.toISOString(),
      redeemedAt: voucher.redeemedAt ? voucher.redeemedAt.toISOString() : null,
      createdAt: voucher.createdAt.toISOString(),
    },
  });
}

const updateVoucherSchema = z.object({
  action: z.literal("void"),
});

/**
 * Owner-only voucher lifecycle action. Currently supports voiding a voucher.
 *
 * A voucher can only be voided from `pending` or `active`; a `redeemed` voucher
 * has already been converted to account credit and must not be voided (that
 * would not claw back the granted credit). The flip is guarded by status so the
 * action is idempotent and cannot void an already-redeemed voucher.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = updateVoucherSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { id } = await params;

  const existing = await prisma.voucher.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
  }

  if (existing.status === "redeemed") {
    return NextResponse.json(
      { error: "A redeemed voucher cannot be voided." },
      { status: 409 },
    );
  }
  if (existing.status === "void") {
    return NextResponse.json({ voucher: { id, status: "void" } });
  }

  // Guarded transition: only void from pending/active. Concurrent redemption of
  // an active voucher races on the status guard, so we never void a voucher that
  // was redeemed in between.
  const result = await prisma.voucher.updateMany({
    where: { id, status: { in: ["pending", "active"] } },
    data: { status: "void" },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Voucher can no longer be voided." },
      { status: 409 },
    );
  }

  logEvent("voucher.voided", { voucherId: id, actorId: admin.id });

  return NextResponse.json({ voucher: { id, status: "void" } });
}
