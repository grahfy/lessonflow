export type BookingRowData = Record<string, unknown> & {
  customerId?: string | null;
  customerName?: string | null;
  notes?: string | null;
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
};
