import { NextRequest, NextResponse } from "next/server";
import { evaluatePublicGeoblocking } from "@/lib/geoblocking-settings";

/**
 * API Route: /api/geo
 * Description: Resolves the user's country and active geoblocking decision.
 * 
 * Rationale: This is used by the booking form to restrict submissions
 * to Australian residents only, preventing international spam or
 * unqualified leads.
 * 
 * Logic:
 * 1. Resolves the request country via trusted edge headers or IP lookup.
 * 2. Applies the current shared geoblocking policy used by public submissions.
 */
export async function GET(request: NextRequest) {
  const evaluation = await evaluatePublicGeoblocking(request.headers);

  return NextResponse.json({
    country: evaluation.country,
    allowed: evaluation.allowed,
    reason: evaluation.reason
  });
}
