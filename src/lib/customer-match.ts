import { BookingRequestInput } from "@/lib/booking-rules";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("61")) {
    return `0${digits.slice(2)}`;
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

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

export function customerSnapshotFromInput(input: CustomerSnapshotInput) {
  return {
    fullName: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    normalizedEmail: normalizeEmail(input.email),
    normalizedPhone: normalizePhone(input.phone),
    skillLevel: input.skillLevel,
    lessonMode: input.lessonMode,
    unitNumber: input.unitNumber ?? null,
    houseNumber: input.houseNumber.trim(),
    streetName: input.streetName.trim(),
    streetType: input.streetType.trim(),
    suburb: input.suburb.trim(),
    state: input.state,
    postcode: input.postcode.trim()
  };
}
