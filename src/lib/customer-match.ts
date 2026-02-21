/**
 * @fileoverview Customer matching and normalization utilities
 * @description Provides functions for normalizing customer contact information
 * (email, phone) and creating searchable customer snapshots for deduplication.
 * This module is critical for the customer matching logic that prevents
 * duplicate bookings and links students to their existing records.
 * 
 * @security - Phone normalization strips non-digits to prevent format variations
 * from causing duplicate customer records (e.g., "+61 412 345 678" vs "0412345678")
 * - Email is lowercased and trimmed to ensure consistent matching regardless
 * of how the customer entered their email (JOHN@Example.com vs john@example.com)
 */

import { BookingRequestInput } from "@/lib/booking-rules";
import { buildNameSearchTokens, normalizeFullNameForLookup } from "@/lib/student-portal/credentials";

/**
 * Normalizes an email address for consistent storage and matching.
 * @param value - Raw email address from user input
 * @returns Lowercase, trimmed email address
 * @security - Case-insensitive comparison prevents duplicate customers with same email
 * but different capitalization (e.g., John@Example.com vs john@example.com)
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Normalizes an Australian phone number to a standard format.
 * @param value - Raw phone number input (may include spaces, +61, etc.)
 * @returns Normalized phone number in 04XX XXX XXX format
 * @logic - Handles Australian format conversion:
 *   - +61 412 345 678 → 0412 345 678
 *   - 61412345678 → 0412 345 678
 *   - Extracts last 10 digits for over-long inputs
 * @security - Strips all non-digit characters to prevent format-based duplicates
 */
export function normalizePhone(value: string): string {
  // Remove all non-digit characters for consistent storage
  const digits = value.replace(/\D/g, "");
  // Convert +61 format (11 digits starting with 61) to Australian mobile format (04)
  if (digits.length === 11 && digits.startsWith("61")) {
    return `0${digits.slice(2)}`;
  }
  // For other over-long numbers, take the last 10 digits
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Type definition for input required to create a customer snapshot.
 * @description Picks specific fields from the booking request input that are
 * needed for customer identification and matching. Excludes fields like
 * lesson details, notes, and referral source that are not part of identity.
 */
export type CustomerSnapshotInput = Pick<
  BookingRequestInput,
  | "name"
  | "email"
  | "phone"
  | "skillLevel"
  | "lessonMode"
  | "unitNumber"
  | "houseNumber"
  | "streetName"
  | "streetType"
  | "suburb"
  | "state"
  | "postcode"
>;

/**
 * Creates a complete customer snapshot from booking input data.
 * @param input - Customer information from booking form
 * @returns Normalized snapshot with search-optimized fields for matching
 * @logic - This snapshot is stored with each booking and used to:
 *   1. Match new bookings against existing customers
 *   2. Provide fallback matching if email/phone exact match fails
 *   3. Allow fuzzy name-based searching for customer lookup
 * @ui - The normalized fields are displayed in admin panels for consistent appearance
 */
export function customerSnapshotFromInput(input: CustomerSnapshotInput) {
  return {
    // Raw values trimmed for display consistency
    fullName: input.name.trim(),
    // Optimized for fuzzy name matching in student portal
    normalizedFullName: normalizeFullNameForLookup(input.name),
    // Tokenized for name search (splits "John Smith" into ["John", "Smith", "John Smith"])
    nameSearchTokens: buildNameSearchTokens(input.name),
    // Original email for display
    email: input.email.trim(),
    // Original phone for display
    phone: input.phone.trim(),
    // Normalized for matching (case-insensitive, trimmed)
    normalizedEmail: normalizeEmail(input.email),
    // Normalized for matching (Australian standard format)
    normalizedPhone: normalizePhone(input.phone),
    // Booking preferences stored with customer for reference
    skillLevel: input.skillLevel,
    lessonMode: input.lessonMode,
    // Address components (unit can be null)
    unitNumber: input.unitNumber ?? null,
    houseNumber: input.houseNumber.trim(),
    streetName: input.streetName.trim(),
    streetType: input.streetType.trim(),
    suburb: input.suburb.trim(),
    state: input.state,
    postcode: input.postcode.trim()
  };
}
