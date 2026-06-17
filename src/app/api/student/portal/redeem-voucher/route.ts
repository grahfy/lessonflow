import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { consumeRateLimit, getRequestIpFromHeaders } from "@/lib/rate-limit";
import { requireStudentFromRequest } from "@/lib/student-portal/session";
import { redeemVoucherToAccountCredit } from "@/lib/vouchers/redeem";

export const dynamic = "force-dynamic";

const redeemSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

/**
 * Student self-service voucher redemption into their own account credit.
 *
 * SECURITY (real money):
 * - Scoped to the authenticated student's own session; the credit always lands
 *   on the logged-in customer (the code's value cannot be redirected to another
 *   account).
 * - Per-IP rate limited (`voucher-redeem:${ip}`) to blunt code brute-forcing.
 * - NO VALIDITY ORACLE: every failure (unknown code, already used, expired,
 *   wrong status) returns the same generic message + status so an attacker
 *   cannot distinguish "no such code" from "already redeemed".
 * - Single-redemption / no double-spend is enforced atomically inside
 *   redeemVoucherToAccountCredit.
 */
export async function POST(request: NextRequest) {
  const student = await requireStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = consumeRateLimit({
    key: `voucher-redeem:${getRequestIpFromHeaders(request.headers)}`,
    limit: 5,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  const parsed = redeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Same generic message as a redemption failure: do not reveal that the code
    // shape itself was the problem versus an invalid/used code.
    return NextResponse.json(
      { error: "This voucher code could not be redeemed." },
      { status: 400 },
    );
  }

  const result = await redeemVoucherToAccountCredit({
    rawCode: parsed.data.code,
    customerId: student.id,
    actorId: null,
  });

  if (!result.ok) {
    // Oracle-free: identical response for not_found / not_active / expired / error.
    return NextResponse.json(
      { error: "This voucher code could not be redeemed." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    redeemed: {
      valueCents: result.valueCents,
      newBalanceCents: result.newBalanceCents,
    },
  });
}
