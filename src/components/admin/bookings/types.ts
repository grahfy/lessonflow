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
