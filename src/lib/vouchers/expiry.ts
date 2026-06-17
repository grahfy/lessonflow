/**
 * Voucher validity window. The public Terms already state vouchers are "valid
 * for six months", so the default is six calendar months from issue. Kept here
 * as the single source of truth so the buy flow, comp-issue flow, and any future
 * "mark expired" job agree.
 */
export const VOUCHER_VALIDITY_MONTHS = 6;

/**
 * Computes a voucher's expiry from an issue date by adding the validity window
 * in calendar months. Uses calendar-month arithmetic (not a fixed day count) so
 * "six months" lands on the same day-of-month, matching how a customer reads it.
 */
export function voucherExpiryFrom(issuedAt: Date = new Date()): Date {
  const expiry = new Date(issuedAt);
  expiry.setMonth(expiry.getMonth() + VOUCHER_VALIDITY_MONTHS);
  return expiry;
}
