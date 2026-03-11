import type { SendEmailResult } from "@/lib/admin/use-email-history";

export const STREET_TYPES = [
  "Street",
  "Road",
  "Avenue",
  "Drive",
  "Lane",
  "Court",
  "Crescent",
  "Place",
  "Boulevard",
  "Terrace",
  "Parade",
  "Close"
] as const;

export const CAPTCHA_ERROR_CODES = [
  "CAPTCHA_REQUIRED",
  "CAPTCHA_INVALID",
  "CAPTCHA_EXPIRED",
  "CAPTCHA_RATE_LIMITED"
] as const;

export function isCaptchaErrorResult(result: SendEmailResult): boolean {
  return Boolean(
    result.errorCode &&
      CAPTCHA_ERROR_CODES.includes(result.errorCode as (typeof CAPTCHA_ERROR_CODES)[number])
  );
}
