import { NextResponse } from "next/server";

import { createCaptchaChallenge } from "@/lib/captcha";

/**
 * Issues a fresh image CAPTCHA challenge for public-facing forms and login screens.
 *
 * The response is intentionally non-cacheable so every fetch returns a new challenge.
 */
export async function GET() {
  const challenge = createCaptchaChallenge();
  return NextResponse.json(challenge, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

