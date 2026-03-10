/**
 * Customer Normalization & Deduplication Logic
 * 
 * Provides centralized utilities for reconciling disparate customer data points.
 * 
 * DESIGN RATIONALE:
 * 1. Data Integrity: Prevents fragmented student records (e.g. creating two 
 *    student profiles for the same person because they formatted their 
 *    phone number differently).
 * 2. Australian Telecom Standards: Implements normalization for AU mobile 
 *    conventions (converting +614... and 04... into a stable 10-digit basis).
 * 3. Search Optimization: Generates 'Search Tokens' and 'Full Name Hashes' 
 *    at ingest time to allow for high-speed lookup in the Admin Console.
 * 4. Snapshot Pattern: Encapsulates all contact and address details into a 
 *    version-less snapshot, ensuring that even if a student changes their 
 *    email in the future, the historical record attached to a specific 
 *    booking remains accurate to the time of request.
 */

import { BookingRequestInput } from "@/lib/booking-rules";
import { buildNameSearchTokens, normalizeFullNameForLookup } from "@/lib/student-portal/credentials";

/**
 * Normalizes email addresses to a stable matching basis.
 * RATIONALE: Prevents "john@abc.com" and "John@abc.com" from being 
 * treated as separate entities.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Normalizes Australian phone numbers to a flat digit string.
 * logic:
 * 1. Strips all non-digit formatting characters.
 * 2. Normalizes +61 prefix to standard 04 mobile prefix.
 * 3. Slices to the last 10 digits to ensure consistency.
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Convert AU international to local form
  if (digits.length === 11 && digits.startsWith("61")) {
    return `0${digits.slice(2)}`;
  }
  // Clamp to standard length
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

/** Interface for building a customer record from a booking event. */
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
> & {
  firstName?: string;
  lastName?: string;
};

/**
 * Transforms raw form input into a structured customer snapshot.
 * 
 * DESIGN RATIONALE: We calculate 'normalizedFullName' and 'nameSearchTokens' 
 * here so that Database-level lookups can be performant without 
 * requiring the DB engine to perform expensive string manipulation 
 * during every query.
 * 
 * @param input - Data from a booking request or admin form
 */
export function customerSnapshotFromInput(input: CustomerSnapshotInput) {
  let fullName = input.name.trim();
  
  // Prefer split name components if available (standard in new flows)
  if (input.firstName && input.lastName) {
    fullName = `${input.firstName.trim()} ${input.lastName.trim()}`;
  }

  return {
    firstName: input.firstName?.trim() ?? "",
    lastName: input.lastName?.trim() ?? "",
    fullName,
    // Database search optimizations
    normalizedFullName: normalizeFullNameForLookup(fullName),
    nameSearchTokens: buildNameSearchTokens(fullName),
    // Contact components
    email: input.email.trim(),
    phone: input.phone.trim(),
    normalizedEmail: normalizeEmail(input.email),
    normalizedPhone: normalizePhone(input.phone),
    // Business preferences
    skillLevel: input.skillLevel,
    lessonMode: input.lessonMode,
    // Address components
    unitNumber: input.unitNumber ?? null,
    houseNumber: input.houseNumber.trim(),
    streetName: input.streetName.trim(),
    streetType: input.streetType.trim(),
    suburb: input.suburb.trim(),
    state: input.state,
    postcode: input.postcode.trim()
  };
}
