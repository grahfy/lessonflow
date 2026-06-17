import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { redeemVoucherToAccountCredit } from "@/lib/vouchers/redeem";

export const dynamic = "force-dynamic";

const redeemSchema = z.object({
  code: z.string().trim().min(1).max(64),
  customerId: z.string().trim().min(1),
});

/**
 * Owner-only: redeem a voucher code into a chosen customer's account credit.
 *
 * Even though this is an authenticated owner action (not a brute-force surface
 * like the public/student redeem), it still uses the single-redemption-safe
 * core (atomic status flip + ledger grant). The customer must exist before we
 * redeem so the credit cannot be stranded on a non-existent customer.
 */
export async function POST(request: NextRequest) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = redeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: parsed.data.customerId },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const result = await redeemVoucherToAccountCredit({
    rawCode: parsed.data.code,
    customerId: customer.id,
    actorId: admin.id,
  });

  if (!result.ok) {
    // Admins get a slightly more specific message than the public oracle-free
    // surface, but still no distinction beyond "could not redeem" for the
    // not_found/not_active/expired cases to keep it simple.
    return NextResponse.json(
      { error: "This voucher could not be redeemed (invalid, already used, or expired)." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    redeemed: {
      voucherId: result.voucherId,
      valueCents: result.valueCents,
      newBalanceCents: result.newBalanceCents,
    },
  });
}
