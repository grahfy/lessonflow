import type { JSONContent } from "@tiptap/react";

export type BookingRowData = Record<string, unknown> & {
  customerId?: string | null;
  customerName?: string | null;
  assignedTeacherId?: string | null;
  assignedTeacherName?: string | null;
  notes?: string | null;
  notesContent?: JSONContent | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  unitNumber?: string | null;
  houseNumber?: string | null;
  streetName?: string | null;
  streetType?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  lessonMode?: string | null;
  skillLevel?: string | null;
  lessonDuration?: string | null;
  customDurationMinutes?: string | number | null;
  hasActiveInvoice?: boolean;
};

export type BookingDialogForm = {
  notes: string;
  notesContent: JSONContent | null;
  linkedCustomerId: string;
  startAtLocal: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  unitNumber: string;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
  lessonMode: string;
  skillLevel: string;
  assignedTeacherId: string;
  durationChoice: string;
  customDurationMinutes: string;
};

// Drop blank optional fields so the server-side Zod `min`/`email`/regex checks
// on the edit schema don't reject untouched values the form always carries as strings.
export function sanitizeBookingEditPayload(form: BookingDialogForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const optionalStringKeys: Array<keyof BookingDialogForm> = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "houseNumber",
    "streetName",
    "streetType",
    "suburb",
    "state",
    "postcode",
    "lessonMode",
    "skillLevel",
    "assignedTeacherId",
    "notes"
  ];
  for (const key of optionalStringKeys) {
    const raw = form[key];
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        out[key] = trimmed;
      }
    }
  }
  const unit = form.unitNumber?.trim() ?? "";
  out.unitNumber = unit.length > 0 ? unit : null;
  if (form.notesContent !== undefined) {
    out.notesContent = form.notesContent;
  }
  return out;
}

export type BookingMatchedCustomer = {
  id: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone: string;
  unitNumber?: string | null;
  houseNumber?: string | null;
  streetName?: string | null;
  streetType?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  skillLevel?: string | null;
  lessonMode?: string | null;
  primaryTeacherId?: string | null;
};

export type BookingCustomerLookupState = {
  status: "idle" | "loading" | "linked" | "exact_match" | "possible_match" | "no_match" | "error";
  customers: BookingMatchedCustomer[];
  message?: string;
};
