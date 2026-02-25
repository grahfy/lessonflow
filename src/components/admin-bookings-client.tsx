"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminBookingCalendar, AdminCalendarEvent } from "@/components/admin-booking-calendar";
import { animateIn, animateOut } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";

type CalendarView = "day" | "week" | "month";
type AuState = "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA";
type DurationChoice = "min30" | "min60" | "custom";
type ManualStep = "customer" | "lesson" | "schedule";
const AU_STATES: AuState[] = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
const MANUAL_STEP_ORDER: ManualStep[] = ["customer", "lesson", "schedule"];
const MANUAL_STEP_LABEL: Record<ManualStep, string> = {
  customer: "Customer",
  lesson: "Lesson",
  schedule: "Schedule & Confirm"
};

const PHONE_PATTERN = /^\d{10}$/;
const POSTCODE_PATTERN = /^\d{4}$/;
const LEARNING_MATERIAL_ACCEPT = ".pdf,.mp3,.m4a,.wav,.ogg,.webm,.aac,.flac,application/pdf,audio/*";

type BookingRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  unitNumber: string | null;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
  lessonMode: "in_person" | "video";
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
  status: "approved" | "cancelled";
  startAt: string;
  notes: string | null;
  seriesId: string | null;
  customerId: string | null;
};

type BookingRequestRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  unitNumber: string | null;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
  lessonMode: "in_person" | "video";
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
  status: "pending" | "rejected" | "approved" | "cancelled";
  requestedStartAt: string;
  notes: string | null;
};

type CustomerRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonMode: "in_person" | "video";
  unitNumber: string | null;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
  isArchived: boolean;
  portalCredential?: {
    id: string;
    generatedAt: string;
    rotatedAt: string | null;
    isActive: boolean;
  } | null;
};

type CustomerPortalCredentialResponse = {
  password: string;
  credential: {
    id: string;
    generatedAt: string;
    rotatedAt: string | null;
    isActive: boolean;
  };
  created?: boolean;
};

type LearningMaterialBooking = {
  id: string;
  startAt: string;
  endAt: string;
  status: "approved" | "cancelled";
  lessonMode: "in_person" | "video";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
};

type LearningMaterialRow = {
  id: string;
  title: string;
  bookingId: string | null;
  materialType: "audio" | "pdf";
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  previewUrl?: string;
  downloadUrl?: string;
};

type CustomerForm = {
  fullName: string;
  email: string;
  phone: string;
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonMode: "in_person" | "video";
  unitNumber: string;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: AuState;
  postcode: string;
};

type EventWithRow = AdminCalendarEvent & {
  row: BookingRow | BookingRequestRow;
};

type DialogForm = {
  name: string;
  email: string;
  phone: string;
  unitNumber: string;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: AuState;
  postcode: string;
  lessonMode: "in_person" | "video";
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: string;
  durationChoice: DurationChoice;
  startAtLocal: string;
  notes: string;
};

type InvoiceTaxMode = "taxable" | "gst_free";

type BookingInvoiceForm = {
  lessonPrice: string;
  includeEducationalBooks: boolean;
  educationalBooksPrice: string;
  includeDigitalGuitarLessons: boolean;
  digitalGuitarLessonsPrice: string;
  includeCustomCharge: boolean;
  customChargeDescription: string;
  customChargePrice: string;
  dueAtLocal: string;
  taxMode: InvoiceTaxMode;
  notes: string;
};

function defaultBookingInvoiceForm(): BookingInvoiceForm {
  const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const shifted = new Date(dueAt.getTime() - dueAt.getTimezoneOffset() * 60_000);
  return {
    lessonPrice: "",
    includeEducationalBooks: false,
    educationalBooksPrice: "",
    includeDigitalGuitarLessons: false,
    digitalGuitarLessonsPrice: "",
    includeCustomCharge: false,
    customChargeDescription: "",
    customChargePrice: "",
    dueAtLocal: shifted.toISOString().slice(0, 16),
    taxMode: "taxable",
    notes: ""
  };
}

function dollarsToCents(value: string): number | null {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return Math.round(amount * 100);
}

function emptyCustomerForm(): CustomerForm {
  return {
    fullName: "",
    email: "",
    phone: "",
    skillLevel: "beginner",
    lessonMode: "in_person",
    unitNumber: "",
    houseNumber: "",
    streetName: "",
    streetType: "Street",
    suburb: "",
    state: "VIC",
    postcode: ""
  };
}

function customerFormFromRow(customer: CustomerRow): CustomerForm {
  return {
    fullName: customer.fullName,
    email: customer.email,
    phone: toDigits(customer.phone, 10),
    skillLevel: customer.skillLevel,
    lessonMode: customer.lessonMode,
    unitNumber: customer.unitNumber ?? "",
    houseNumber: customer.houseNumber ?? "",
    streetName: customer.streetName ?? "",
    streetType: customer.streetType ?? "Street",
    suburb: customer.suburb ?? "",
    state: toAuState(customer.state),
    postcode: customer.postcode ?? ""
  };
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDateTimeLocalValue(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function toIsoFromLocal(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function selectedEventKey(event: AdminCalendarEvent | null): string | null {
  if (!event) {
    return null;
  }
  return `${event.entityType}:${event.id}`;
}

/**
 * Normalizes arbitrary state strings from persisted rows/forms to the supported AU state enum.
 *
 * Falling back to VIC prevents edit forms from breaking on unexpected legacy values.
 */
function toAuState(value: string): AuState {
  return AU_STATES.includes(value as AuState) ? (value as AuState) : "VIC";
}

function toDigits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne"
  }).format(date);
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reads a concise API error message while tolerating non-JSON error responses.
 */
function readApiErrorMessage(payload: unknown, fallback: string): string {
  const api = payload as { error?: string } | null | undefined;
  return api?.error || fallback;
}

/**
 * Reads an API error body across JSON and non-JSON responses so proxy/login
 * redirects are surfaced as actionable messages.
 */
async function readApiErrorFromResponse(response: Response, fallback: string): Promise<string> {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    return readApiErrorMessage(payload, fallback);
  }

  if (response.status === 401 || response.status === 403) {
    return "Your admin session has expired. Please sign in again.";
  }

  if (response.status === 413) {
    return `${fallback} The file is too large for the server upload limit. Try a smaller file (app limit: 100MB), or increase nginx client_max_body_size.`;
  }

  if (contentType.includes("text/html")) {
    return `${fallback} The server returned HTML instead of JSON. Check login status or proxy redirects.`;
  }

  const text = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim();
  if (text) {
    return `${fallback} (${text.slice(0, 140)})`;
  }

  if (response.status > 0) {
    return `${fallback} (HTTP ${response.status})`;
  }

  return fallback;
}

function validateDialogForm(form: DialogForm): string | null {
  const email = form.email.trim();
  const name = form.name.trim();
  const phone = form.phone.trim();
  const houseNumber = form.houseNumber.trim();
  const streetName = form.streetName.trim();
  const streetType = form.streetType.trim();
  const suburb = form.suburb.trim();
  const postcode = form.postcode.trim();

  if (!name) {
    return "Name is required.";
  }
  if (!email || !email.includes("@")) {
    return "A valid email address is required.";
  }
  if (!PHONE_PATTERN.test(phone)) {
    return "Contact number must be exactly 10 digits.";
  }
  if (!houseNumber || !streetName || !streetType || !suburb) {
    return "Complete address is required.";
  }
  if (!POSTCODE_PATTERN.test(postcode)) {
    return "Postcode must be exactly 4 digits.";
  }
  if (form.durationChoice === "custom") {
    const custom = Number.parseInt(form.customDurationMinutes || "", 10);
    if (!Number.isFinite(custom) || custom < 15 || custom > 300) {
      return "Custom duration must be between 15 and 300 minutes.";
    }
  }
  return null;
}

function defaultFormFromEvent(event: EventWithRow): DialogForm {
  const row = event.row;
  const startAt = event.entityType === "booking" ? (row as BookingRow).startAt : (row as BookingRequestRow).requestedStartAt;

  return {
    name: row.name,
    email: row.email,
    phone: toDigits(row.phone, 10),
    unitNumber: row.unitNumber ?? "",
    houseNumber: row.houseNumber ?? "",
    streetName: row.streetName ?? "",
    streetType: row.streetType ?? "",
    suburb: row.suburb ?? "",
    state: toAuState(row.state),
    postcode: row.postcode ?? "",
    lessonMode: row.lessonMode,
    skillLevel: row.skillLevel,
    lessonDuration: row.lessonDuration,
    customDurationMinutes: row.customDurationMinutes ? String(row.customDurationMinutes) : "",
    durationChoice: row.customDurationMinutes ? "custom" : row.lessonDuration,
    startAtLocal: toDateTimeLocalValue(startAt),
    notes: row.notes ?? ""
  };
}

export function AdminBookingsClient() {
  const router = useRouter();
  const [view, setView] = useState<CalendarView>("week");
  const [date, setDate] = useState<string>(toDateInputValue(new Date()));
  const [events, setEvents] = useState<EventWithRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventWithRow | null>(null);
  const [dialogForm, setDialogForm] = useState<DialogForm | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogStartAtLocal, setMoveDialogStartAtLocal] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [manualDurationChoice, setManualDurationChoice] = useState<DurationChoice>("min60");
  const [manualStep, setManualStep] = useState<ManualStep>("customer");
  const [manualCustomerId, setManualCustomerId] = useState("");
  const [manualMatch, setManualMatch] = useState<CustomerRow | null>(null);
  const [manualUpdateCustomerFromBooking, setManualUpdateCustomerFromBooking] = useState(false);
  const [customerEditorMode, setCustomerEditorMode] = useState<"create" | "edit" | null>(null);
  const [customerEditorId, setCustomerEditorId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm());
  const [revealedPortalPasswords, setRevealedPortalPasswords] = useState<Record<string, string>>({});
  const [portalCredentialBusyCustomerId, setPortalCredentialBusyCustomerId] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [invoiceForm, setInvoiceForm] = useState<BookingInvoiceForm>(defaultBookingInvoiceForm());
  const [materialsCustomerId, setMaterialsCustomerId] = useState("");
  const [materialsBookingId, setMaterialsBookingId] = useState("");
  const [materialsBookings, setMaterialsBookings] = useState<LearningMaterialBooking[]>([]);
  const [materialsList, setMaterialsList] = useState<LearningMaterialRow[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsUploading, setMaterialsUploading] = useState(false);
  const [materialsDeletingId, setMaterialsDeletingId] = useState<string | null>(null);
  const dialogPresence = usePresenceExit();
  const manualDialogPresence = usePresenceExit();
  const customersDialogPresence = usePresenceExit();
  const customerEditorPresence = usePresenceExit();
  const materialsDialogPresence = usePresenceExit();
  const emailDialogPresence = usePresenceExit();
  const invoiceDialogPresence = usePresenceExit();
  const dialogRootRef = useRef<HTMLDivElement | null>(null);
  const manualDialogRootRef = useRef<HTMLDivElement | null>(null);
  const customersDialogRootRef = useRef<HTMLDivElement | null>(null);
  const customerEditorRootRef = useRef<HTMLDivElement | null>(null);
  const materialsDialogRootRef = useRef<HTMLDivElement | null>(null);
  const emailDialogRootRef = useRef<HTMLDivElement | null>(null);
  const invoiceDialogRootRef = useRef<HTMLDivElement | null>(null);
  const calendarRootRef = useRef<HTMLDivElement | null>(null);
  const manualFormRef = useRef<HTMLFormElement | null>(null);
  const materialsUploadFormRef = useRef<HTMLFormElement | null>(null);
  const authRedirectingRef = useRef(false);
  const dialogSessionRef = useRef(0);

  const rangeLabel = useMemo(() => `${view.toUpperCase()} VIEW`, [view]);
  const safeFetch = useCallback(async (...args: Parameters<typeof globalThis.fetch>): Promise<Response> => {
    try {
      return await globalThis.fetch(...args);
    } catch {
      // Return a JSON-shaped synthetic response so action handlers can reuse the same error parsing
      // path for network failures and server failures.
      return new Response(JSON.stringify({ error: "Network request failed. Please try again." }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
  }, []);
  const redirectToAdminLogin = useCallback(() => {
    if (authRedirectingRef.current) {
      return;
    }
    authRedirectingRef.current = true;
    setError("");
    // Use a full navigation so logout/session-expiry redirects don't depend on
    // client router state after the current admin page becomes unauthorized.
    window.location.assign("/admin/login");
  }, []);
  const handleApiError = useCallback(
    async (response: Response, fallback: string) => {
      // Centralize auth-expiry and non-JSON error handling so all admin actions behave consistently.
      if (response.status === 401 || response.status === 403) {
        redirectToAdminLogin();
        return;
      }
      setError(await readApiErrorFromResponse(response, fallback));
    },
    [redirectToAdminLogin]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // Treat calendar reload as the authoritative post-mutation state refresh rather than trying
      // to locally patch every booking/request/customer side effect.
      const bookingRes = await safeFetch(`/api/admin/bookings?view=${view}&date=${date}`, { cache: "no-store" });
      if (!bookingRes.ok) {
        if (bookingRes.status === 401 || bookingRes.status === 403) {
          redirectToAdminLogin();
          return;
        }

        const fallback =
          bookingRes.status >= 500
            ? "Unable to load admin data right now. Please try again shortly."
            : "Unable to load admin data. Please refresh and try again.";
        setError(await readApiErrorFromResponse(bookingRes, fallback));
        return;
      }

      const bookingData = (await bookingRes.json().catch(() => null)) as { events?: EventWithRow[] } | null;
      if (!bookingData || !Array.isArray(bookingData.events)) {
        setError("Unable to load admin data. The server returned an unexpected response.");
        return;
      }

      setEvents(bookingData.events);
    } catch {
      setError("Unable to load admin data. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [date, redirectToAdminLogin, safeFetch, view]);

  const loadCustomers = useCallback(async (query?: string) => {
    setLoadingCustomers(true);
    const search = (query ?? "").trim();
    const response = await safeFetch(`/api/admin/customers?limit=250&q=${encodeURIComponent(search)}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      if (response.status === 401) {
        setLoadingCustomers(false);
        redirectToAdminLogin();
        return;
      }
      setLoadingCustomers(false);
      await handleApiError(response, "Unable to load customers.");
      return;
    }
    const data = await response.json();
    setCustomers(data.customers || []);
    setLoadingCustomers(false);
  }, [handleApiError, redirectToAdminLogin, safeFetch]);

  const visibleCustomers = useMemo(() => {
    const query = customerQuery.trim().toLowerCase();
    if (!query) {
      return customers;
    }
    return customers.filter(
      (customer) =>
        customer.fullName.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query)
    );
  }, [customerQuery, customers]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [load]);

  useEffect(() => {
    if (!dialogPresence.isMounted || !dialogRootRef.current) {
      return;
    }
    void animateIn(dialogRootRef.current, { scope: "admin" });
  }, [dialogPresence.isMounted, selectedEvent?.id]);

  useEffect(() => {
    if (!emailDialogPresence.isMounted || !emailDialogRootRef.current) {
      return;
    }
    void animateIn(emailDialogRootRef.current, { scope: "admin" });
  }, [emailDialogPresence.isMounted]);

  useEffect(() => {
    if (!invoiceDialogPresence.isMounted || !invoiceDialogRootRef.current) {
      return;
    }
    void animateIn(invoiceDialogRootRef.current, { scope: "admin" });
  }, [invoiceDialogPresence.isMounted]);

  useEffect(() => {
    if (!manualDialogPresence.isMounted || !manualDialogRootRef.current) {
      return;
    }
    void animateIn(manualDialogRootRef.current, { scope: "admin" });
  }, [manualDialogPresence.isMounted]);

  useEffect(() => {
    if (!customersDialogPresence.isMounted || !customersDialogRootRef.current) {
      return;
    }
    void animateIn(customersDialogRootRef.current, { scope: "admin" });
  }, [customersDialogPresence.isMounted]);

  useEffect(() => {
    if (!customerEditorPresence.isMounted || !customerEditorRootRef.current) {
      return;
    }
    void animateIn(customerEditorRootRef.current, { scope: "admin" });
  }, [customerEditorPresence.isMounted]);

  useEffect(() => {
    if (!materialsDialogPresence.isMounted || !materialsDialogRootRef.current) {
      return;
    }
    void animateIn(materialsDialogRootRef.current, { scope: "admin" });
  }, [materialsDialogPresence.isMounted]);

  useEffect(() => {
    if (loading || !calendarRootRef.current) {
      return;
    }
    void animateIn(calendarRootRef.current, { scope: "calendar" });
  }, [events, loading, view, date]);

  useEffect(() => {
    if (!manualDialogPresence.isMounted && !customersDialogPresence.isMounted && !materialsDialogPresence.isMounted) {
      return;
    }
    void loadCustomers();
  }, [customersDialogPresence.isMounted, loadCustomers, manualDialogPresence.isMounted, materialsDialogPresence.isMounted]);

  function openDialog(event: EventWithRow) {
    const dialogSession = dialogSessionRef.current + 1;
    dialogSessionRef.current = dialogSession;
    setNotice("");
    setSelectedEvent(event);
    setDialogForm(defaultFormFromEvent(event));
    setMoveDialogOpen(false);
    setMoveDialogStartAtLocal("");
    setSelectedCustomer(null);
    setIsEditingCustomer(false);
    setEmailSubject("");
    setEmailMessage("");
    setInvoiceForm(defaultBookingInvoiceForm());
    emailDialogPresence.hide(undefined, { immediate: true });
    invoiceDialogPresence.hide(undefined, { immediate: true });
    dialogPresence.show();

    // Customer fetch is best-effort so the dialog can open immediately even if the linked customer
    // lookup is slow or fails.
    if ("customerId" in event.row && event.row.customerId) {
      safeFetch(`/api/admin/customers/${event.row.customerId}`, { credentials: "same-origin" })
        .then((res) => {
          if (!res.ok) {
            console.error("Customer fetch failed:", res.status, res.statusText);
            return null;
          }
          return res.json();
        })
        .then((data) => {
          // Ignore late responses if the user has already switched selections.
          if (dialogSessionRef.current !== dialogSession) {
            return;
          }
          if (data?.customer) {
            setSelectedCustomer(data.customer);
          }
        })
        .catch((err) => {
          console.error("fetch customer error:", err);
          // Silently fail - customer is optional
        });
    }
  }

  async function closeDialog() {
    const closingDialogSession = dialogSessionRef.current;
    if (emailDialogPresence.isMounted) {
      await closeEmailDialog();
    }
    if (invoiceDialogPresence.isMounted) {
      await closeInvoiceDialog();
    }

    setBusyAction(null);
    setMoveDialogOpen(false);
    setMoveDialogStartAtLocal("");
    if (dialogRootRef.current) {
      await animateOut(dialogRootRef.current, { scope: "admin" });
    }
    dialogPresence.hide(
      () => {
        // Presence callbacks can fire after another dialog has opened; guard against stale cleanup.
        if (dialogSessionRef.current !== closingDialogSession) {
          return;
        }
        setSelectedEvent(null);
        setDialogForm(null);
        setSelectedCustomer(null);
        setIsEditingCustomer(false);
        setEmailSubject("");
        setEmailMessage("");
        setInvoiceForm(defaultBookingInvoiceForm());
      },
      { immediate: true }
    );
  }

  function openEmailDialog() {
    setEmailSubject("");
    setEmailMessage("");
    emailDialogPresence.show();
  }

  async function closeEmailDialog() {
    if (emailDialogRootRef.current) {
      await animateOut(emailDialogRootRef.current, { scope: "admin" });
    }
    emailDialogPresence.hide(undefined, { immediate: true });
    setEmailSubject("");
    setEmailMessage("");
  }

  function openInvoiceDialog() {
    setInvoiceForm(defaultBookingInvoiceForm());
    invoiceDialogPresence.show();
  }

  async function closeInvoiceDialog() {
    if (invoiceDialogRootRef.current) {
      await animateOut(invoiceDialogRootRef.current, { scope: "admin" });
    }
    invoiceDialogPresence.hide(undefined, { immediate: true });
    setInvoiceForm(defaultBookingInvoiceForm());
  }

  async function createInvoiceFromBooking() {
    if (!selectedEvent || selectedEvent.entityType !== "booking") {
      return;
    }

    const lessonPriceCents = dollarsToCents(invoiceForm.lessonPrice);
    if (lessonPriceCents === null) {
      setError("Lesson price is required.");
      return;
    }

    const booksPriceCents = dollarsToCents(invoiceForm.educationalBooksPrice);
    const digitalPriceCents = dollarsToCents(invoiceForm.digitalGuitarLessonsPrice);
    const customPriceCents = dollarsToCents(invoiceForm.customChargePrice);
    if (invoiceForm.includeCustomCharge && !invoiceForm.customChargeDescription.trim()) {
      setError("Custom charge description is required when custom charge is enabled.");
      return;
    }
    if (!invoiceForm.dueAtLocal) {
      setError("Invoice due date is required.");
      return;
    }

    setBusyAction("create_invoice");
    setError("");
    const response = await safeFetch(`/api/admin/bookings/${selectedEvent.id}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lessonPriceCents,
        includeEducationalBooks: invoiceForm.includeEducationalBooks,
        educationalBooksPriceCents: invoiceForm.includeEducationalBooks ? booksPriceCents ?? 0 : undefined,
        includeDigitalGuitarLessons: invoiceForm.includeDigitalGuitarLessons,
        digitalGuitarLessonsPriceCents: invoiceForm.includeDigitalGuitarLessons ? digitalPriceCents ?? 0 : undefined,
        includeCustomCharge: invoiceForm.includeCustomCharge,
        customChargeDescription: invoiceForm.includeCustomCharge ? invoiceForm.customChargeDescription.trim() : undefined,
        customChargePriceCents: invoiceForm.includeCustomCharge ? customPriceCents ?? 0 : undefined,
        dueAt: new Date(invoiceForm.dueAtLocal).toISOString(),
        taxMode: invoiceForm.taxMode,
        notes: invoiceForm.notes.trim() || undefined
      })
    });
    setBusyAction(null);
    if (!response.ok) {
      await handleApiError(response, "Unable to create invoice.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { invoice?: { id: string } } | null;
    setNotice("Invoice created.");
    await closeInvoiceDialog();
    if (payload?.invoice?.id) {
      router.push(`/admin/invoices?invoiceId=${payload.invoice.id}`);
      return;
    }
    router.push("/admin/invoices");
  }

  function setManualFieldValue(name: string, value: string) {
    const form = manualFormRef.current;
    if (!form) {
      return;
    }
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
      field.value = value;
    }
  }

  function applyCustomerToManual(customer: CustomerRow) {
    setManualCustomerId(customer.id);
    setManualFieldValue("name", customer.fullName);
    setManualFieldValue("email", customer.email);
    setManualFieldValue("phone", toDigits(customer.phone, 10));
    setManualFieldValue("unitNumber", customer.unitNumber ?? "");
    setManualFieldValue("houseNumber", customer.houseNumber ?? "");
    setManualFieldValue("streetName", customer.streetName ?? "");
    setManualFieldValue("streetType", customer.streetType || "Street");
    setManualFieldValue("suburb", customer.suburb ?? "");
    setManualFieldValue("state", toAuState(customer.state));
    setManualFieldValue("postcode", customer.postcode ?? "");
    setManualFieldValue("skillLevel", customer.skillLevel);
    setManualFieldValue("lessonMode", customer.lessonMode);
    setManualMatch(null);
  }

  function validateManualFields(selectors: string[]): boolean {
    const form = manualFormRef.current;
    if (!form) {
      return false;
    }
    for (const selector of selectors) {
      const field = form.querySelector(selector);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        if (!field.reportValidity()) {
          return false;
        }
      }
    }
    return true;
  }

  function validateManualStep(step: ManualStep): boolean {
    if (step === "customer") {
      return validateManualFields([
        "input[name='name']",
        "input[name='email']",
        "input[name='phone']",
        "input[name='houseNumber']",
        "input[name='streetName']",
        "input[name='suburb']",
        "input[name='postcode']"
      ]);
    }
    if (step === "lesson") {
      const selectors = ["select[name='lessonMode']", "select[name='skillLevel']", "select[name='lessonDuration']"];
      if (manualDurationChoice === "custom") {
        selectors.push("input[name='customDurationMinutes']");
      }
      return validateManualFields(selectors);
    }

    const scheduleValid = validateManualFields(["input[name='requestedStartAt']"]);
    if (!scheduleValid) {
      return false;
    }
    const form = manualFormRef.current;
    if (!form) {
      return false;
    }
    const recurringField = form.querySelector("input[name='isRecurring']");
    const recurrenceEndField = form.querySelector("input[name='recurrenceEndAt']");
    if (recurringField instanceof HTMLInputElement && recurringField.checked) {
      if (recurrenceEndField instanceof HTMLInputElement && !recurrenceEndField.value) {
        setError("Recurrence end is required when weekly recurring is selected.");
        recurrenceEndField.focus();
        return false;
      }
    }
    return true;
  }

  function goToPreviousManualStep() {
    const currentIndex = MANUAL_STEP_ORDER.indexOf(manualStep);
    if (currentIndex <= 0) {
      return;
    }
    setError("");
    setManualStep(MANUAL_STEP_ORDER[currentIndex - 1]);
  }

  function goToNextManualStep() {
    const currentIndex = MANUAL_STEP_ORDER.indexOf(manualStep);
    if (currentIndex < 0 || currentIndex >= MANUAL_STEP_ORDER.length - 1) {
      return;
    }
    if (!validateManualStep(manualStep)) {
      return;
    }
    setError("");
    setManualStep(MANUAL_STEP_ORDER[currentIndex + 1]);
  }

  function openManualDialog() {
    setError("");
    setNotice("");
    setManualMatch(null);
    setManualCustomerId("");
    setManualUpdateCustomerFromBooking(false);
    setManualDurationChoice("min60");
    setManualStep("customer");
    setCustomerQuery("");
    manualDialogPresence.show();
  }

  async function closeManualDialog() {
    if (manualDialogRootRef.current) {
      await animateOut(manualDialogRootRef.current, { scope: "admin" });
    }
    manualDialogPresence.hide(
      () => {
        manualFormRef.current?.reset();
        setCreating(false);
        setManualMatch(null);
        setManualCustomerId("");
        setManualUpdateCustomerFromBooking(false);
        setManualDurationChoice("min60");
        setManualStep("customer");
      },
      { immediate: true }
    );
  }

  function openCustomersDialog() {
    setError("");
    setNotice("");
    setCustomerQuery("");
    setCustomerEditorMode(null);
    setCustomerEditorId(null);
    setCustomerForm(emptyCustomerForm());
    customersDialogPresence.show();
  }

  function openCustomerInvoices(customerId: string) {
    router.push(`/admin/invoices?customerId=${customerId}`);
  }

  async function closeCustomersDialog() {
    if (customerEditorPresence.isMounted) {
      await closeCustomerEditor();
    }
    if (customersDialogRootRef.current) {
      await animateOut(customersDialogRootRef.current, { scope: "admin" });
    }
    customersDialogPresence.hide(undefined, { immediate: true });
  }

  function openCustomerEditor(mode: "create" | "edit", customer?: CustomerRow) {
    setError("");
    if (mode === "create") {
      setCustomerEditorMode("create");
      setCustomerEditorId(null);
      setCustomerForm(emptyCustomerForm());
    } else {
      if (!customer) {
        return;
      }
      setCustomerEditorMode("edit");
      setCustomerEditorId(customer.id);
      setCustomerForm(customerFormFromRow(customer));
    }
    customerEditorPresence.show();
  }

  async function closeCustomerEditor() {
    if (customerEditorRootRef.current) {
      await animateOut(customerEditorRootRef.current, { scope: "admin" });
    }
    customerEditorPresence.hide(
      () => {
        setCustomerEditorMode(null);
        setCustomerEditorId(null);
        setCustomerForm(emptyCustomerForm());
      },
      { immediate: true }
    );
  }

  /**
   * Calls admin portal-credential mutations and syncs revealed password state.
   */
  async function mutatePortalCredential(customerId: string, action: "reveal" | "regenerate") {
    setPortalCredentialBusyCustomerId(customerId);
    setError("");
    const response = await safeFetch(`/api/admin/customers/${customerId}/portal-credential`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    setPortalCredentialBusyCustomerId(null);
    if (!response.ok) {
      await handleApiError(response, "Unable to manage portal credential.");
      return;
    }

    const payload = (await response.json()) as CustomerPortalCredentialResponse;
    setRevealedPortalPasswords((prev) => ({
      ...prev,
      [customerId]: payload.password
    }));
    await loadCustomers(customerQuery);
    setNotice(action === "reveal" ? "Portal password revealed." : "Portal password regenerated.");
  }

  /**
   * Reveals a customer portal password in the customer directory view.
   */
  async function revealPortalPassword(customerId: string) {
    await mutatePortalCredential(customerId, "reveal");
  }

  /**
   * Rotates a customer portal password after explicit admin confirmation.
   */
  async function regeneratePortalPassword(customerId: string) {
    const confirmed = window.confirm(
      "Regenerate this customer portal password? The current password will stop working immediately."
    );
    if (!confirmed) {
      return;
    }
    await mutatePortalCredential(customerId, "regenerate");
  }

  /**
   * Loads appointments and materials for the selected customer and booking scope.
   */
  async function loadLearningMaterials(customerId: string, bookingId?: string) {
    setMaterialsLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (bookingId) {
      params.set("bookingId", bookingId);
    }
    const query = params.toString();
    const response = await safeFetch(
      `/api/admin/customers/${customerId}/learning-materials${query ? `?${query}` : ""}`,
      {
        cache: "no-store"
      }
    );
    setMaterialsLoading(false);
    if (!response.ok) {
      await handleApiError(response, "Unable to load learning materials.");
      return;
    }

    const payload = (await response.json()) as {
      bookings: LearningMaterialBooking[];
      materials: LearningMaterialRow[];
    };
    setMaterialsBookings(payload.bookings || []);
    setMaterialsList(payload.materials || []);
  }

  /**
   * Opens the learning-materials management modal with clean selection state.
   */
  function openLearningMaterialsDialog() {
    setError("");
    setNotice("");
    setMaterialsCustomerId("");
    setMaterialsBookingId("");
    setMaterialsBookings([]);
    setMaterialsList([]);
    materialsDialogPresence.show();
  }

  /**
   * Closes and resets the learning-materials management modal.
   */
  async function closeLearningMaterialsDialog() {
    if (materialsDialogRootRef.current) {
      await animateOut(materialsDialogRootRef.current, { scope: "admin" });
    }
    materialsDialogPresence.hide(
      () => {
        setMaterialsCustomerId("");
        setMaterialsBookingId("");
        setMaterialsBookings([]);
        setMaterialsList([]);
        setMaterialsUploading(false);
        setMaterialsDeletingId(null);
        materialsUploadFormRef.current?.reset();
      },
      { immediate: true }
    );
  }

  /**
   * Uploads one audio/PDF material for the selected customer appointment.
   */
  async function uploadLearningMaterial() {
    const formElement = materialsUploadFormRef.current;
    if (!formElement) {
      return;
    }
    if (!materialsCustomerId || !materialsBookingId) {
      setError("Select a customer and an appointment before uploading.");
      return;
    }

    const form = new FormData(formElement);
    const file = form.get("file");
    if (!(file instanceof File)) {
      setError("Choose a PDF or audio file to upload.");
      return;
    }
    form.set("bookingId", materialsBookingId);

    setMaterialsUploading(true);
    setError("");
    const response = await safeFetch(`/api/admin/customers/${materialsCustomerId}/learning-materials`, {
      method: "POST",
      body: form
    });
    setMaterialsUploading(false);
    if (!response.ok) {
      await handleApiError(response, "Upload failed.");
      return;
    }

    materialsUploadFormRef.current?.reset();
    setNotice("Learning material uploaded.");
    await loadLearningMaterials(materialsCustomerId, materialsBookingId);
  }

  /**
   * Deletes one material row and refreshes the current selection listing.
   */
  async function deleteLearningMaterial(material: LearningMaterialRow) {
    const confirmed = window.confirm(`Delete "${material.title}"?`);
    if (!confirmed) {
      return;
    }

    setMaterialsDeletingId(material.id);
    setError("");
    const response = await safeFetch(`/api/admin/learning-materials/${material.id}`, {
      method: "DELETE"
    });
    setMaterialsDeletingId(null);
    if (!response.ok) {
      await handleApiError(response, "Unable to delete learning material.");
      return;
    }

    setNotice("Learning material deleted.");
    if (materialsCustomerId) {
      await loadLearningMaterials(materialsCustomerId, materialsBookingId || undefined);
    }
  }

  async function mutateBooking(action: "edit" | "move" | "cancel", body: Record<string, unknown>) {
    if (!selectedEvent || selectedEvent.entityType !== "booking") {
      return false;
    }
    // Keep route/method details centralized so action buttons only manage validation + UI state.
    const response = await safeFetch(`/api/admin/bookings/${selectedEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body })
    });
    if (!response.ok) {
      await handleApiError(response, "Booking update failed.");
      return false;
    }
    return true;
  }

  async function mutateRequest(action: "approve" | "reject" | "cancel" | "edit" | "move", body: Record<string, unknown>) {
    if (!selectedEvent || selectedEvent.entityType !== "booking_request") {
      return false;
    }
    // Request actions mirror booking actions but intentionally hit a different route contract.
    const response = await safeFetch(`/api/admin/booking-requests/${selectedEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body })
    });
    if (!response.ok) {
      await handleApiError(response, "Pending request update failed.");
      return false;
    }
    return true;
  }

  async function sendNotification(action: "reminder" | "custom", custom?: { subject: string; message: string }) {
    if (!selectedEvent) {
      return;
    }

    if (action === "custom" && (!custom?.subject.trim() || !custom?.message.trim())) {
      setError("Custom email requires both subject and message.");
      return;
    }

    setBusyAction(action);
    // Endpoint selection depends on entity type, but payload shape stays shared across dialogs.
    const endpoint =
      selectedEvent.entityType === "booking"
        ? `/api/admin/bookings/${selectedEvent.id}/notify`
        : `/api/admin/booking-requests/${selectedEvent.id}/notify`;
    const response = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        subject: custom?.subject,
        message: custom?.message
      })
    });
    setBusyAction(null);
    if (!response.ok) {
      await handleApiError(response, "Notification failed.");
      return;
    }
    setNotice(action === "reminder" ? "Reminder sent." : "Custom email sent.");
    if (action === "custom") {
      await closeEmailDialog();
    }
    await load();
  }

  async function saveDetails() {
    if (!selectedEvent || !dialogForm) {
      return;
    }

    const validationError = validateDialogForm(dialogForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    const requestedStartAt = toIsoFromLocal(dialogForm.startAtLocal);
    if (selectedEvent.entityType === "booking_request" && !requestedStartAt) {
      setError("Please enter a valid date and time.");
      return;
    }

    setBusyAction("save");
    const lessonDuration = dialogForm.durationChoice === "min30" ? "min30" : "min60";
    const customDurationMinutes =
      dialogForm.durationChoice === "custom"
        ? Number.parseInt(dialogForm.customDurationMinutes || "", 10)
        : null;
    const payload = {
      name: dialogForm.name.trim(),
      email: dialogForm.email.trim(),
      phone: toDigits(dialogForm.phone.trim(), 10),
      unitNumber: dialogForm.unitNumber.trim() || null,
      houseNumber: dialogForm.houseNumber.trim(),
      streetName: dialogForm.streetName.trim(),
      streetType: dialogForm.streetType.trim(),
      suburb: dialogForm.suburb.trim(),
      state: dialogForm.state,
      postcode: dialogForm.postcode.trim(),
      lessonMode: dialogForm.lessonMode,
      skillLevel: dialogForm.skillLevel,
      lessonDuration,
      customDurationMinutes,
      notes: dialogForm.notes.trim() ? dialogForm.notes.trim() : null
    };

    const ok =
      selectedEvent.entityType === "booking"
        ? await mutateBooking("edit", payload)
        : await mutateRequest("edit", {
            ...payload,
            requestedStartAt
          });

    setBusyAction(null);
    if (!ok) {
      return;
    }
    setNotice("Details saved.");
    await load();
  }

  function openMoveDialog() {
    if (!selectedEvent || !dialogForm) {
      return;
    }
    setError("");
    setMoveDialogStartAtLocal(dialogForm.startAtLocal);
    setMoveDialogOpen(true);
  }

  function closeMoveDialog() {
    if (busyAction === "move") {
      return;
    }
    setMoveDialogOpen(false);
    setMoveDialogStartAtLocal("");
  }

  async function moveSelected() {
    if (!selectedEvent || !dialogForm) {
      return;
    }
    const newStartAt = toIsoFromLocal(moveDialogStartAtLocal);
    if (!newStartAt) {
      setError("Please enter a valid date and time.");
      return;
    }

    setBusyAction("move");
    // Move runs through a dedicated popup so admins can confirm the new date/time explicitly.
    const ok =
      selectedEvent.entityType === "booking"
        ? await mutateBooking("move", { newStartAt })
        : await mutateRequest("move", { newStartAt });
    setBusyAction(null);
    if (!ok) {
      return;
    }
    setDialogForm((prev) => (prev ? { ...prev, startAtLocal: moveDialogStartAtLocal } : prev));
    setMoveDialogOpen(false);
    setMoveDialogStartAtLocal("");
    setNotice("Booking moved.");
    await load();
  }

  async function cancelSelected() {
    if (!selectedEvent) {
      return;
    }
    const confirmed = window.confirm(
      selectedEvent.entityType === "booking_request"
        ? "Cancel this booking request? This will remove it from pending approvals."
        : "Cancel this booking?"
    );
    if (!confirmed) {
      return;
    }
    setBusyAction("cancel");
    // Bookings and booking requests share the same confirm/reload UX but differ in route semantics.
    const ok =
      selectedEvent.entityType === "booking"
        ? await mutateBooking("cancel", {})
        : await mutateRequest("cancel", {});
    setBusyAction(null);
    if (!ok) {
      return;
    }
    await closeDialog();
    await load();
  }

  async function deleteSelected() {
    if (!selectedEvent) {
      return;
    }
    const confirmed = window.confirm(
      selectedEvent.entityType === "booking_request"
        ? "Permanently delete this booking request? This cannot be undone and will remove it from the calendar/history."
        : "Permanently delete this booking? This cannot be undone and will remove the record entirely."
    );
    if (!confirmed) {
      return;
    }
    setBusyAction("delete");
    // Delete is a hard-remove action (distinct from cancel) and should fully remove the record row.
    const endpoint =
      selectedEvent.entityType === "booking"
        ? `/api/admin/bookings/${selectedEvent.id}`
        : `/api/admin/booking-requests/${selectedEvent.id}`;
    const response = await safeFetch(endpoint, {
      method: "DELETE"
    });
    setBusyAction(null);
    if (!response.ok) {
      await handleApiError(
        response,
        selectedEvent.entityType === "booking" ? "Unable to delete booking." : "Unable to delete booking request."
      );
      return;
    }
    await closeDialog();
    await load();
  }

  async function approveSelected(action: "approve" | "reject") {
    if (!selectedEvent || selectedEvent.entityType !== "booking_request") {
      return;
    }
    if (action === "reject") {
      const confirmed = window.confirm("Reject this booking request?");
      if (!confirmed) {
        return;
      }
    }
    setBusyAction(action);
    const ok = await mutateRequest(action, {});
    setBusyAction(null);
    if (!ok) {
      return;
    }
    await closeDialog();
    await load();
  }

  async function removeSeries(seriesId: string) {
    const confirmed = window.confirm("Remove this recurring series? This will remove all upcoming linked bookings.");
    if (!confirmed) {
      return;
    }
    const response = await safeFetch(`/api/admin/booking-series/${seriesId}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      await handleApiError(response, "Unable to remove series.");
      return;
    }
    await closeDialog();
    await load();
  }

  async function addManualBooking(matchResolution?: "use_existing" | "create_new" | "update_existing") {
    const formElement = manualFormRef.current;
    if (!formElement) {
      return;
    }
    if (!validateManualStep("schedule")) {
      return;
    }

    setCreating(true);
    setError("");

    const form = new FormData(formElement);
    const fullName = String(form.get("name") || "").trim();
    const phone = toDigits(String(form.get("phone") || ""), 10);
    const customDurationRaw = String(form.get("customDurationMinutes") || "");
    const customDurationMinutes =
      manualDurationChoice === "custom" && customDurationRaw ? Number.parseInt(customDurationRaw, 10) : undefined;

    if (!fullName) {
      setCreating(false);
      setError("Name is required.");
      return;
    }

    const payload = {
      name: fullName,
      email: String(form.get("email") || ""),
      phone,
      unitNumber: String(form.get("unitNumber") || ""),
      houseNumber: String(form.get("houseNumber") || ""),
      streetName: String(form.get("streetName") || ""),
      streetType: String(form.get("streetType") || ""),
      suburb: String(form.get("suburb") || ""),
      state: String(form.get("state") || ""),
      postcode: String(form.get("postcode") || ""),
      lessonMode: String(form.get("lessonMode") || ""),
      skillLevel: String(form.get("skillLevel") || ""),
      lessonDuration: manualDurationChoice === "min30" ? "min30" : "min60",
      customDurationMinutes,
      requestedStartAt: new Date(String(form.get("requestedStartAt") || "")).toISOString(),
      isRecurring: Boolean(form.get("isRecurring")),
      recurrenceEndAt: form.get("recurrenceEndAt")
        ? new Date(String(form.get("recurrenceEndAt") || "")).toISOString()
        : undefined,
      customerId: manualCustomerId || undefined,
      matchResolution,
      updateCustomerFromBooking: manualUpdateCustomerFromBooking || undefined
    };

    const response = await safeFetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setCreating(false);
    if (response.status === 409) {
      const payloadResponse = await response.json().catch(() => null);
      if (payloadResponse?.code === "CUSTOMER_MATCH" && payloadResponse?.customer) {
        setManualMatch(payloadResponse.customer as CustomerRow);
        setError("Matching customer found. Confirm how to proceed.");
        return;
      }
    }
    if (!response.ok) {
      await handleApiError(response, "Manual booking create failed.");
      return;
    }
    formElement.reset();
    setManualMatch(null);
    setManualCustomerId("");
    setManualUpdateCustomerFromBooking(false);
    setManualDurationChoice("min60");
    setNotice("Manual booking added.");
    await closeManualDialog();
    await load();
    await loadCustomers();
  }

  async function resolveManualMatch(action: "use_existing" | "create_new" | "update_existing") {
    if (!manualMatch) {
      return;
    }
    if (action !== "create_new") {
      setManualCustomerId(manualMatch.id);
      if (action === "use_existing") {
        applyCustomerToManual(manualMatch);
      }
    }
    await addManualBooking(action);
  }

  async function saveCustomer() {
    if (!customerEditorMode) {
      return;
    }
    setSavingCustomer(true);
    setError("");

    const payload = {
      fullName: customerForm.fullName.trim(),
      email: customerForm.email.trim(),
      phone: toDigits(customerForm.phone, 10),
      skillLevel: customerForm.skillLevel,
      lessonMode: customerForm.lessonMode,
      unitNumber: customerForm.unitNumber.trim() || null,
      houseNumber: customerForm.houseNumber.trim() || undefined,
      streetName: customerForm.streetName.trim() || undefined,
      streetType: customerForm.streetType.trim() || undefined,
      suburb: customerForm.suburb.trim() || undefined,
      state: customerForm.state || undefined,
      postcode: customerForm.postcode.trim() || undefined
    };

    const endpoint =
      customerEditorMode === "create" ? "/api/admin/customers" : `/api/admin/customers/${String(customerEditorId || "")}`;
    const method = customerEditorMode === "create" ? "POST" : "PATCH";
    const response = await safeFetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setSavingCustomer(false);
    if (!response.ok) {
      await handleApiError(response, "Unable to save customer.");
      return;
    }

    await loadCustomers(customerQuery);
    await closeCustomerEditor();

    // Refresh selected customer if we were editing the currently selected customer
    if (customerEditorMode === "edit" && customerEditorId && selectedCustomer && customerEditorId === selectedCustomer.id) {
      const customerResponse = await safeFetch(`/api/admin/customers/${customerEditorId}`);
      if (customerResponse.ok) {
        const data = await customerResponse.json();
        if (data.customer) {
          setSelectedCustomer(data.customer);
        }
      }
    }

    setNotice(customerEditorMode === "create" ? "Customer created." : "Customer updated.");
  }

  async function deleteCustomer(customer: CustomerRow) {
    const confirmed = window.confirm(`Delete customer "${customer.fullName}"? Linked records will be archived instead.`);
    if (!confirmed) {
      return;
    }

    setDeletingCustomerId(customer.id);
    setError("");
    const response = await safeFetch(`/api/admin/customers/${customer.id}`, { method: "DELETE" });
    setDeletingCustomerId(null);
    if (!response.ok) {
      await handleApiError(response, "Unable to delete customer.");
      return;
    }

    const payload = await response.json().catch(() => null);
    if (manualCustomerId === customer.id) {
      setManualCustomerId("");
    }
    setManualMatch((prev) => (prev?.id === customer.id ? null : prev));
    await loadCustomers(customerQuery);
    setNotice(payload?.archived ? "Customer archived (linked booking history kept)." : "Customer deleted.");
  }

  async function logout() {
    await safeFetch("/api/admin/logout", { method: "POST" });
    redirectToAdminLogin();
  }

  const selectedKey = selectedEventKey(selectedEvent);
  const selectedIsPending = selectedEvent?.entityType === "booking_request";
  const selectedSeriesId =
    selectedEvent && selectedEvent.entityType === "booking"
      ? ((selectedEvent.row as BookingRow).seriesId ?? null)
      : null;
  const selectedManualCustomer = manualCustomerId ? customers.find((customer) => customer.id === manualCustomerId) ?? null : null;
  const selectedMaterialsCustomer = materialsCustomerId
    ? customers.find((customer) => customer.id === materialsCustomerId) ?? null
    : null;
  const manualStepIndex = MANUAL_STEP_ORDER.indexOf(manualStep);

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <div className="admin-card booking-row admin-header-row" data-motion-item="admin-header-card">
        <h1 className="admin-console-title" data-motion-item="admin-title">
          Owner Booking Console
        </h1>
        <button className="btn btn-secondary" data-motion-item="admin-logout" onClick={() => void logout()}>
          Sign out
        </button>
      </div>

      <div className="admin-card booking-row admin-range-row" data-motion-item="admin-range-card">
        <strong data-motion-item="admin-range-label">{rangeLabel}</strong>
        <label className="admin-inline-field" data-motion-item="admin-view-select">
          View{" "}
          <select value={view} onChange={(e) => setView(e.target.value as CalendarView)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        <label className="admin-inline-field" data-motion-item="admin-date-select">
          Base date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="admin-card calendar-legend" data-motion-item="admin-legend-card">
        <div className="legend-chip-row">
          <span className="legend-chip event-green" data-motion-item="legend-confirmed">
            Confirmed
          </span>
          <span className="legend-chip event-yellow" data-motion-item="legend-pending">
            Pending
          </span>
          <span className="legend-chip event-red" data-motion-item="legend-rejected">
            Rejected (48h)
          </span>
          <span className="legend-chip event-slate" data-motion-item="legend-cancelled">
            Cancelled (48h)
          </span>
        </div>
        <div className="legend-action-row">
          <button className="btn btn-primary" type="button" data-motion-item="legend-action-add-manual" onClick={openManualDialog}>
            Add Manual Booking
          </button>
          <button className="btn btn-secondary" type="button" data-motion-item="legend-action-customers" onClick={openCustomersDialog}>
            Customers
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            data-motion-item="legend-action-learning-materials"
            onClick={openLearningMaterialsDialog}
          >
            Customer Learning Materials
          </button>
          <button className="btn btn-secondary" type="button" data-motion-item="legend-action-settings" onClick={() => router.push("/admin/settings")}>
            Settings
          </button>
          <button className="btn btn-secondary" type="button" data-motion-item="legend-action-reports" onClick={() => router.push("/admin/reports")}>
            Reports
          </button>
          <button className="btn btn-secondary" type="button" data-motion-item="legend-action-invoices" onClick={() => router.push("/admin/invoices")}>
            Invoices
          </button>
        </div>
      </div>

      {error ? (
        <p className="notice error" data-motion-item="admin-error-notice">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice success" data-motion-item="admin-success-notice">
          {notice}
        </p>
      ) : null}
      {loading ? (
        <p className="notice" data-motion-item="admin-loading-notice">
          Loading...
        </p>
      ) : null}

      <div
        className="admin-card"
        ref={calendarRootRef}
        data-motion-root="calendar"
        data-motion-item="admin-calendar-card"
      >
        <AdminBookingCalendar
          view={view}
          date={date}
          events={events}
          selectedEventId={selectedKey}
          onSelect={(event) => openDialog(event as EventWithRow)}
        />
      </div>

      {manualDialogPresence.isMounted ? (
        <div
          className="dialog-backdrop"
          ref={manualDialogRootRef}
          data-motion-root="admin"
          data-motion-item="manual-dialog-backdrop"
          onClick={() => void closeManualDialog()}
        >
          <div
            className="dialog-panel dialog-panel-wide"
            data-motion-item="manual-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-head">
              <h3 id="manual-dialog-title">Add Manual Booking</h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeManualDialog()}>
                Close
              </button>
            </div>
            <p className="helper-text dialog-status">
              Select an existing customer first where possible. If you enter details manually, matching customers will be detected.
            </p>
            <div className="manual-steps" aria-label="Manual booking steps">
              {MANUAL_STEP_ORDER.map((step, index) => (
                <div
                  key={step}
                  className={`manual-step-chip ${index === manualStepIndex ? "is-active" : ""} ${index < manualStepIndex ? "is-complete" : ""}`}
                >
                  <span>{index + 1}</span>
                  <strong>{MANUAL_STEP_LABEL[step]}</strong>
                </div>
              ))}
            </div>
            <form
              ref={manualFormRef}
              className="manual-booking-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (manualStep !== "schedule") {
                  goToNextManualStep();
                  return;
                }
                void addManualBooking();
              }}
            >
              <section className={`manual-section ${manualStep !== "customer" ? "is-step-hidden" : ""}`}>
                <h3 className="manual-section-title">Customer</h3>
                <div className="manual-grid manual-grid-3">
                  <div className="field">
                    <label>Search customer</label>
                    <input
                      value={customerQuery}
                      placeholder="Filter by name, email, or phone"
                      onChange={(event) => setCustomerQuery(event.target.value)}
                    />
                  </div>
                  <div className="field manual-span-2">
                    <label>Select existing customer</label>
                    <select
                      disabled={loadingCustomers}
                      value={manualCustomerId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        setManualCustomerId(nextId);
                        const selected = customers.find((customer) => customer.id === nextId);
                        if (selected) {
                          applyCustomerToManual(selected);
                        }
                      }}
                    >
                      <option value="">{loadingCustomers ? "Loading customers..." : "None selected"}</option>
                      {visibleCustomers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.fullName} · {customer.phone} · {customer.skillLevel}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field manual-span-2">
                    <label className="helper-toggle">
                      <input
                        type="checkbox"
                        checked={manualUpdateCustomerFromBooking}
                        onChange={(event) => setManualUpdateCustomerFromBooking(event.target.checked)}
                      />{" "}
                      Update linked customer profile from this booking
                    </label>
                  </div>
                  {selectedManualCustomer ? (
                    <div className="manual-customer-summary manual-span-2">
                      <strong>Selected:</strong> {selectedManualCustomer.fullName} · {selectedManualCustomer.email} ·{" "}
                      {selectedManualCustomer.phone}
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => {
                          setManualCustomerId("");
                          setManualFieldValue("name", "");
                          setManualFieldValue("email", "");
                          setManualFieldValue("phone", "");
                          setManualFieldValue("unitNumber", "");
                          setManualFieldValue("houseNumber", "");
                          setManualFieldValue("streetName", "");
                          setManualFieldValue("streetType", "Street");
                          setManualFieldValue("suburb", "");
                          setManualFieldValue("state", "VIC");
                          setManualFieldValue("postcode", "");
                          setManualFieldValue("skillLevel", "beginner");
                          setManualFieldValue("lessonMode", "in_person");
                        }}
                      >
                        Clear selection
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className={`manual-section ${manualStep !== "customer" ? "is-step-hidden" : ""}`}>
                <h3 className="manual-section-title">Student</h3>
                <div className="manual-grid manual-grid-2">
                  <div className="field manual-span-2">
                    <label>Full Name *</label>
                    <input name="name" required />
                  </div>
                </div>
              </section>

              <section className={`manual-section ${manualStep !== "customer" ? "is-step-hidden" : ""}`}>
                <h3 className="manual-section-title">Contact</h3>
                <div className="manual-grid manual-grid-3">
                  <div className="field manual-span-2">
                    <label>Email *</label>
                    <input name="email" type="email" required />
                  </div>
                  <div className="field field-compact">
                    <label>Phone *</label>
                    <input
                      name="phone"
                      required
                      maxLength={10}
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      placeholder="10 digits"
                      title="Phone must be exactly 10 digits"
                      onInput={(event) => {
                        event.currentTarget.value = toDigits(event.currentTarget.value, 10);
                      }}
                    />
                  </div>
                </div>
              </section>

              <section className={`manual-section ${manualStep !== "customer" ? "is-step-hidden" : ""}`}>
                <h3 className="manual-section-title">Address</h3>
                <div className="manual-grid manual-grid-3">
                  <div className="field field-compact">
                    <label>Unit/Apartment</label>
                    <input
                      name="unitNumber"
                      maxLength={5}
                      inputMode="numeric"
                      pattern="[0-9]{1,5}"
                      onInput={(event) => {
                        event.currentTarget.value = toDigits(event.currentTarget.value, 5);
                      }}
                    />
                  </div>
                  <div className="field field-compact">
                    <label>House/Building Number *</label>
                    <input
                      name="houseNumber"
                      required
                      maxLength={5}
                      inputMode="numeric"
                      pattern="[0-9]{1,5}"
                      onInput={(event) => {
                        event.currentTarget.value = toDigits(event.currentTarget.value, 5);
                      }}
                    />
                  </div>
                  <div className="field">
                    <label>Street Type *</label>
                    <select name="streetType" required defaultValue="Street">
                      <option value="Street">Street</option>
                      <option value="Road">Road</option>
                      <option value="Avenue">Avenue</option>
                      <option value="Drive">Drive</option>
                      <option value="Lane">Lane</option>
                      <option value="Court">Court</option>
                      <option value="Crescent">Crescent</option>
                      <option value="Place">Place</option>
                      <option value="Boulevard">Boulevard</option>
                      <option value="Terrace">Terrace</option>
                      <option value="Parade">Parade</option>
                      <option value="Close">Close</option>
                    </select>
                  </div>
                  <div className="field manual-span-2">
                    <label>Street Name *</label>
                    <input name="streetName" required />
                  </div>
                  <div className="field">
                    <label>Suburb *</label>
                    <input name="suburb" required />
                  </div>
                  <div className="field manual-span-2">
                    <label>State *</label>
                    <select name="state" required defaultValue="VIC">
                      <option value="ACT">Australian Capital Territory</option>
                      <option value="NSW">New South Wales</option>
                      <option value="NT">Northern Territory</option>
                      <option value="QLD">Queensland</option>
                      <option value="SA">South Australia</option>
                      <option value="TAS">Tasmania</option>
                      <option value="VIC">Victoria</option>
                      <option value="WA">Western Australia</option>
                    </select>
                  </div>
                  <div className="field field-compact">
                    <label>Postcode *</label>
                    <input
                      name="postcode"
                      required
                      maxLength={4}
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      placeholder="3000"
                      title="Postcode must be 4 digits"
                      onInput={(event) => {
                        event.currentTarget.value = toDigits(event.currentTarget.value, 4);
                      }}
                    />
                  </div>
                </div>
              </section>

              <section className={`manual-section ${manualStep !== "lesson" ? "is-step-hidden" : ""}`}>
                <h3 className="manual-section-title">Lesson</h3>
                <div className="manual-grid manual-grid-3">
                  <div className="field">
                    <label>Mode *</label>
                    <select name="lessonMode" defaultValue="in_person">
                      <option value="in_person">In-person</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Skill Level *</label>
                    <select name="skillLevel" defaultValue="beginner">
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Duration *</label>
                    <select
                      name="lessonDuration"
                      value={manualDurationChoice}
                      onChange={(event) => setManualDurationChoice(event.target.value as DurationChoice)}
                    >
                      <option value="min30">30 minutes</option>
                      <option value="min60">60 minutes</option>
                      <option value="custom">Other amount</option>
                    </select>
                  </div>
                  {manualDurationChoice === "custom" ? (
                    <div className="field field-compact">
                      <label>Custom Duration (minutes) *</label>
                      <input
                        name="customDurationMinutes"
                        required
                        maxLength={3}
                        inputMode="numeric"
                        pattern="[0-9]{2,3}"
                        placeholder="e.g. 45"
                        onInput={(event) => {
                          event.currentTarget.value = toDigits(event.currentTarget.value, 3);
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </section>

              <section className={`manual-section ${manualStep !== "schedule" ? "is-step-hidden" : ""}`}>
                <h3 className="manual-section-title">Schedule</h3>
                <p className="helper-text">Review timing details, then confirm to create the booking.</p>
                <div className="manual-grid manual-grid-2">
                  <div className="field">
                    <label>Start *</label>
                    <input name="requestedStartAt" type="datetime-local" required />
                  </div>
                  <div className="field">
                    <label>Recurrence end</label>
                    <input name="recurrenceEndAt" type="datetime-local" />
                  </div>
                  <div className="field manual-span-2">
                    <label>
                      <input type="checkbox" name="isRecurring" /> Weekly recurring
                    </label>
                  </div>
                </div>
              </section>

              {manualStep === "schedule" && manualMatch ? (
                <section className="manual-section manual-match">
                  <h3 className="manual-section-title">Existing Customer Match Found</h3>
                  <p className="helper-text">
                    {manualMatch.fullName} · {manualMatch.email} · {manualMatch.phone}
                  </p>
                  <div className="booking-row">
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={creating}
                      onClick={() =>
                        void resolveManualMatch(manualUpdateCustomerFromBooking ? "update_existing" : "use_existing")
                      }
                    >
                      Use existing customer
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={creating}
                      onClick={() => void resolveManualMatch("create_new")}
                    >
                      Create new customer anyway
                    </button>
                  </div>
                </section>
              ) : null}

              <div className="manual-form-footer">
                <p className="helper-text form-required-note">* Required fields</p>
                <div className="manual-step-footer-actions">
                  {manualStep !== "customer" ? (
                    <button className="btn btn-secondary" type="button" disabled={creating} onClick={goToPreviousManualStep}>
                      Back
                    </button>
                  ) : null}
                  {manualStep !== "schedule" ? (
                    <button className="btn btn-primary" type="button" disabled={creating} onClick={goToNextManualStep}>
                      {manualStep === "customer" ? "Next: Lesson" : "Next: Schedule & Confirm"}
                    </button>
                  ) : (
                    <button className="btn btn-primary" type="submit" disabled={creating}>
                      {creating ? "Adding..." : "Add booking"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {materialsDialogPresence.isMounted ? (
        <div
          className="dialog-backdrop"
          ref={materialsDialogRootRef}
          data-motion-root="admin"
          data-motion-item="materials-dialog-backdrop"
          onClick={() => void closeLearningMaterialsDialog()}
        >
          <div
            className="dialog-panel dialog-panel-wide"
            data-motion-item="materials-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="materials-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-head">
              <h3 id="materials-dialog-title">Customer Learning Materials</h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeLearningMaterialsDialog()}>
                Close
              </button>
            </div>
            <p className="helper-text dialog-status">
              Select a customer, then optionally choose an appointment before uploading lesson materials.
            </p>

            <div className="customers-toolbar">
              <div className="field">
                <label>Search customer</label>
                <input
                  value={customerQuery}
                  placeholder="Filter by name, email, or phone"
                  onChange={(event) => setCustomerQuery(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Select customer</label>
                <select
                  value={materialsCustomerId}
                  onChange={(event) => {
                    const nextCustomerId = event.target.value;
                    setMaterialsCustomerId(nextCustomerId);
                    setMaterialsBookingId("");
                    setMaterialsBookings([]);
                    setMaterialsList([]);
                    if (nextCustomerId) {
                      void loadLearningMaterials(nextCustomerId);
                    }
                  }}
                >
                  <option value="">{loadingCustomers ? "Loading customers..." : "Choose customer"}</option>
                  {visibleCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.fullName} · {customer.phone}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedMaterialsCustomer ? (
              <p className="helper-text">
                Selected: <strong>{selectedMaterialsCustomer.fullName}</strong> · {selectedMaterialsCustomer.email}
              </p>
            ) : null}

            <div className="field">
              <label>Select appointment</label>
              <select
                disabled={!materialsCustomerId || materialsLoading}
                value={materialsBookingId}
                onChange={(event) => {
                  const nextBookingId = event.target.value;
                  setMaterialsBookingId(nextBookingId);
                  if (materialsCustomerId) {
                    void loadLearningMaterials(materialsCustomerId, nextBookingId || undefined);
                  }
                }}
              >
                <option value="">
                  {materialsCustomerId
                    ? materialsBookings.length
                      ? "All appointments (or choose one to link/filter)"
                      : "No appointments found (uploads will be general materials)"
                    : "Select customer first"}
                </option>
                {materialsBookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {formatDateTime(booking.startAt)} · {booking.status}
                  </option>
                ))}
              </select>
            </div>

            <form
              ref={materialsUploadFormRef}
              className="material-upload-form"
              onSubmit={(event) => {
                event.preventDefault();
                void uploadLearningMaterial();
              }}
            >
              <div className="manual-grid manual-grid-3">
                <div className="field">
                  <label>Material title</label>
                  <input name="title" placeholder="e.g. Pentatonic exercise week 1" />
                </div>
                <div className="field manual-span-2">
                  <label>File</label>
                  <input name="file" type="file" required accept={LEARNING_MATERIAL_ACCEPT} />
                </div>
              </div>
              <div className="dialog-actions">
                <button className="btn btn-primary" type="submit" disabled={!materialsCustomerId || materialsUploading}>
                  {materialsUploading ? "Uploading..." : "Upload material"}
                </button>
              </div>
            </form>

            <div className="materials-list">
              {materialsLoading ? (
                <p className="helper-text">Loading materials...</p>
              ) : materialsList.length ? (
                materialsList.map((material) => {
                  const booking = materialsBookings.find((row) => row.id === material.bookingId);
                  return (
                    <div key={material.id} className="customer-item">
                      <div className="customer-item-meta">
                        <strong>{material.title}</strong>
                        <span>
                          <small>Type</small> {material.materialType.toUpperCase()}
                        </span>
                        <span>
                          <small>Size</small> {formatBytes(material.sizeBytes)}
                        </span>
                        <span>
                          <small>Uploaded</small> {formatDateTime(material.createdAt)}
                        </span>
                        {booking ? (
                          <span>
                            <small>Appointment</small> {formatDateTime(booking.startAt)}
                          </span>
                        ) : (
                          <span>
                            <small>Appointment</small> General material (not linked)
                          </span>
                        )}
                      </div>
                      <div className="customer-item-actions">
                        <a
                          className="btn btn-secondary"
                          href={material.previewUrl || `/api/admin/learning-materials/${material.id}?disposition=inline`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Preview
                        </a>
                        <a
                          className="btn btn-secondary"
                          href={material.downloadUrl || `/api/admin/learning-materials/${material.id}?disposition=attachment`}
                        >
                          Download
                        </a>
                        <button
                          className="btn btn-danger"
                          type="button"
                          disabled={materialsDeletingId === material.id}
                          onClick={() => void deleteLearningMaterial(material)}
                        >
                          {materialsDeletingId === material.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="helper-text">No materials uploaded for the current selection.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {customersDialogPresence.isMounted ? (
        <div
          className="dialog-backdrop"
          ref={customersDialogRootRef}
          data-motion-root="admin"
          data-motion-item="customers-dialog-backdrop"
          onClick={() => void closeCustomersDialog()}
        >
          <div
            className="dialog-panel dialog-panel-wide"
            data-motion-item="customers-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customers-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-head">
              <h3 id="customers-dialog-title">Customers</h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeCustomersDialog()}>
                Close
              </button>
            </div>
            <p className="helper-text dialog-status">
              Manage customer profiles used to speed up manual booking creation.
            </p>
            <div className="customers-toolbar">
              <div className="field">
                <label>Search</label>
                <input
                  value={customerQuery}
                  placeholder="Search customer directory"
                  onChange={(event) => setCustomerQuery(event.target.value)}
                />
              </div>
              <button className="btn btn-primary" type="button" onClick={() => openCustomerEditor("create")}>
                Create New Customer
              </button>
            </div>
            <p className="helper-text customers-count">
              {loadingCustomers ? "Loading..." : `${visibleCustomers.length} customer${visibleCustomers.length === 1 ? "" : "s"}`}
            </p>
            {loadingCustomers ? <p className="helper-text">Loading customers...</p> : null}
            <div className="customers-list">
              {visibleCustomers.length ? (
                visibleCustomers.map((customer) => (
                  <div key={customer.id} className="customer-item">
                    <div className="customer-item-meta">
                      <strong>{customer.fullName}</strong>
                      <span>
                        <small>Phone</small> {customer.phone}
                      </span>
                      <span>
                        <small>Email</small> {customer.email}
                      </span>
                      <span>
                        <small>Skill</small> {customer.skillLevel}
                      </span>
                      <span>
                        <small>Portal generated</small>{" "}
                        {customer.portalCredential ? formatDateTime(customer.portalCredential.generatedAt) : "Not generated"}
                      </span>
                      {customer.portalCredential?.rotatedAt ? (
                        <span>
                          <small>Portal rotated</small> {formatDateTime(customer.portalCredential.rotatedAt)}
                        </span>
                      ) : null}
                      {revealedPortalPasswords[customer.id] ? (
                        <span>
                          <small>Portal password</small> <code>{revealedPortalPasswords[customer.id]}</code>
                        </span>
                      ) : null}
                    </div>
                    <div className="customer-item-actions">
                      <button className="btn btn-secondary" type="button" onClick={() => openCustomerInvoices(customer.id)}>
                        Invoices
                      </button>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={portalCredentialBusyCustomerId === customer.id}
                        onClick={() => void revealPortalPassword(customer.id)}
                      >
                        {portalCredentialBusyCustomerId === customer.id ? "Loading..." : "Reveal Portal Password"}
                      </button>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={portalCredentialBusyCustomerId === customer.id}
                        onClick={() => void regeneratePortalPassword(customer.id)}
                      >
                        {portalCredentialBusyCustomerId === customer.id ? "Regenerating..." : "Regenerate Password"}
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={() => openCustomerEditor("edit", customer)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={deletingCustomerId === customer.id}
                        onClick={() => void deleteCustomer(customer)}
                      >
                        {deletingCustomerId === customer.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="helper-text">No customers found.</p>
              )}
            </div>
          </div>
          {customerEditorPresence.isMounted ? (
            <div
              className="dialog-backdrop is-secondary"
              ref={customerEditorRootRef}
              data-motion-root="admin"
              data-motion-item="customer-editor-dialog-backdrop"
              onClick={(event) => {
                event.stopPropagation();
                void closeCustomerEditor();
              }}
            >
              <div
                className="dialog-panel dialog-panel-compact"
                data-motion-item="customer-editor-dialog-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="customer-editor-dialog-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="dialog-head">
                  <h3 id="customer-editor-dialog-title">{customerEditorMode === "create" ? "Create Customer" : "Edit Customer"}</h3>
                  <button className="btn btn-secondary" type="button" onClick={() => void closeCustomerEditor()}>
                    Cancel
                  </button>
                </div>
                <p className="helper-text dialog-status">Name, phone, email, and skill are primary. Address fields are optional.</p>
                <div className="form-grid dialog-form-grid">
                  <div className="field">
                    <label>Full Name *</label>
                    <input
                      value={customerForm.fullName}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, fullName: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Email *</label>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Phone *</label>
                    <input
                      value={customerForm.phone}
                      maxLength={10}
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      placeholder="10 digits"
                      onChange={(event) =>
                        setCustomerForm((prev) => ({ ...prev, phone: toDigits(event.target.value, 10) }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Skill Level *</label>
                    <select
                      value={customerForm.skillLevel}
                      onChange={(event) =>
                        setCustomerForm((prev) => ({
                          ...prev,
                          skillLevel: event.target.value as CustomerForm["skillLevel"]
                        }))
                      }
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Mode *</label>
                    <select
                      value={customerForm.lessonMode}
                      onChange={(event) =>
                        setCustomerForm((prev) => ({
                          ...prev,
                          lessonMode: event.target.value as CustomerForm["lessonMode"]
                        }))
                      }
                    >
                      <option value="in_person">In-person</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Unit/Apartment</label>
                    <input
                      value={customerForm.unitNumber}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, unitNumber: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>House Number</label>
                    <input
                      value={customerForm.houseNumber}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, houseNumber: toDigits(event.target.value, 5) }))}
                    />
                  </div>
                  <div className="field">
                    <label>Street Name</label>
                    <input
                      value={customerForm.streetName}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, streetName: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Street Type</label>
                    <select
                      value={customerForm.streetType}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, streetType: event.target.value }))}
                    >
                      <option value="Street">Street</option>
                      <option value="Road">Road</option>
                      <option value="Avenue">Avenue</option>
                      <option value="Drive">Drive</option>
                      <option value="Lane">Lane</option>
                      <option value="Court">Court</option>
                      <option value="Crescent">Crescent</option>
                      <option value="Place">Place</option>
                      <option value="Boulevard">Boulevard</option>
                      <option value="Terrace">Terrace</option>
                      <option value="Parade">Parade</option>
                      <option value="Close">Close</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Suburb</label>
                    <input
                      value={customerForm.suburb}
                      onChange={(event) => setCustomerForm((prev) => ({ ...prev, suburb: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>State</label>
                    <select
                      value={customerForm.state}
                      onChange={(event) =>
                        setCustomerForm((prev) => ({ ...prev, state: event.target.value as CustomerForm["state"] }))
                      }
                    >
                      <option value="ACT">Australian Capital Territory</option>
                      <option value="NSW">New South Wales</option>
                      <option value="NT">Northern Territory</option>
                      <option value="QLD">Queensland</option>
                      <option value="SA">South Australia</option>
                      <option value="TAS">Tasmania</option>
                      <option value="VIC">Victoria</option>
                      <option value="WA">Western Australia</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Postcode</label>
                    <input
                      value={customerForm.postcode}
                      maxLength={4}
                      inputMode="numeric"
                      placeholder="3000"
                      onChange={(event) =>
                        setCustomerForm((prev) => ({ ...prev, postcode: toDigits(event.target.value, 4) }))
                      }
                    />
                  </div>
                </div>
                <div className="dialog-actions">
                  <button className="btn btn-secondary" type="button" disabled={savingCustomer} onClick={() => void closeCustomerEditor()}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" type="button" disabled={savingCustomer} onClick={() => void saveCustomer()}>
                    {savingCustomer ? "Saving..." : "Save customer"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {dialogPresence.isMounted && selectedEvent && dialogForm ? (
        <div
          className="dialog-backdrop"
          ref={dialogRootRef}
          data-motion-root="admin"
          data-motion-item="booking-dialog-backdrop"
          onClick={() => void closeDialog()}
        >
          <div
            key={selectedKey ?? "none"}
            className="dialog-panel booking-dialog-panel"
            data-motion-item="booking-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-head" data-motion-item="booking-dialog-head">
              <h3 id="booking-dialog-title" data-motion-item="booking-dialog-title">
                {selectedEvent.title}
              </h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeDialog()}>
                Close
              </button>
            </div>
            <p className="helper-text dialog-status" data-motion-item="booking-dialog-status">
              Status: <strong>{selectedEvent.status}</strong> / Type:{" "}
              <strong>{selectedEvent.entityType === "booking" ? "Confirmed booking" : "Booking request"}</strong>
            </p>
            <form className="dialog-form" data-motion-item="booking-dialog-form" onSubmit={(event) => event.preventDefault()}>
              <div className="booking-dialog-scroll" data-motion-item="booking-dialog-scroll">
                <div className="dialog-layout" data-motion-item="booking-dialog-layout">
                  <div className="dialog-col" data-motion-item="booking-dialog-customer-col">
                    <h4 data-motion-item="booking-dialog-customer-title">Customer details</h4>
                    <div className="form-grid dialog-form-grid">
                      {selectedCustomer && !isEditingCustomer ? (
                        <>
                          <div className="field" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Read-only customer</span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => {
                                setIsEditingCustomer(true);
                                openCustomerEditor("edit", selectedCustomer);
                              }}
                            >
                              Edit
                            </button>
                          </div>
                          <div className="field">
                            <label>Name</label>
                            <input value={selectedCustomer.fullName} readOnly />
                          </div>
                          <div className="field">
                            <label>Email</label>
                            <input value={selectedCustomer.email} readOnly />
                          </div>
                          <div className="field">
                            <label>Phone</label>
                            <input value={selectedCustomer.phone} readOnly />
                          </div>
                          <div className="field">
                            <label>Address</label>
                            <input
                              value={[
                                selectedCustomer.unitNumber ? `Unit ${selectedCustomer.unitNumber}` : null,
                                selectedCustomer.houseNumber,
                                selectedCustomer.streetName,
                                selectedCustomer.streetType,
                                selectedCustomer.suburb,
                                selectedCustomer.state,
                                selectedCustomer.postcode
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              readOnly
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="field">
                            <label>Name</label>
                            <input
                              value={dialogForm.name}
                              onChange={(event) => setDialogForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                            />
                          </div>
                          <div className="field">
                            <label>Email</label>
                            <input
                              type="email"
                              value={dialogForm.email}
                              onChange={(event) => setDialogForm((prev) => (prev ? { ...prev, email: event.target.value } : prev))}
                            />
                          </div>
                          <div className="field">
                            <label>Phone</label>
                            <input
                              value={dialogForm.phone}
                              maxLength={10}
                              inputMode="numeric"
                              pattern="[0-9]{10}"
                              placeholder="10 digits"
                              title="Phone must be exactly 10 digits"
                              onChange={(event) =>
                                setDialogForm((prev) => (prev ? { ...prev, phone: toDigits(event.target.value, 10) } : prev))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Unit / Apartment (optional)</label>
                            <input
                              value={dialogForm.unitNumber}
                              onChange={(event) =>
                                setDialogForm((prev) => (prev ? { ...prev, unitNumber: event.target.value } : prev))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>House number</label>
                            <input
                              value={dialogForm.houseNumber}
                              onChange={(event) =>
                                setDialogForm((prev) => (prev ? { ...prev, houseNumber: event.target.value } : prev))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Street name</label>
                            <input
                              value={dialogForm.streetName}
                              onChange={(event) =>
                                setDialogForm((prev) => (prev ? { ...prev, streetName: event.target.value } : prev))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Street type</label>
                            <select
                              value={dialogForm.streetType}
                              onChange={(event) =>
                                setDialogForm((prev) => (prev ? { ...prev, streetType: event.target.value } : prev))
                              }
                            >
                              <option value="Street">Street</option>
                              <option value="Road">Road</option>
                              <option value="Avenue">Avenue</option>
                              <option value="Drive">Drive</option>
                              <option value="Lane">Lane</option>
                              <option value="Court">Court</option>
                              <option value="Crescent">Crescent</option>
                              <option value="Place">Place</option>
                              <option value="Boulevard">Boulevard</option>
                              <option value="Terrace">Terrace</option>
                              <option value="Parade">Parade</option>
                              <option value="Close">Close</option>
                            </select>
                          </div>
                          <div className="field">
                            <label>Suburb</label>
                            <input
                              value={dialogForm.suburb}
                              onChange={(event) => setDialogForm((prev) => (prev ? { ...prev, suburb: event.target.value } : prev))}
                            />
                          </div>
                          <div className="field">
                            <label>State</label>
                            <select
                              value={dialogForm.state}
                              onChange={(event) =>
                                setDialogForm((prev) => (prev ? { ...prev, state: event.target.value as AuState } : prev))
                              }
                            >
                              <option value="ACT">Australian Capital Territory</option>
                              <option value="NSW">New South Wales</option>
                              <option value="NT">Northern Territory</option>
                              <option value="QLD">Queensland</option>
                              <option value="SA">South Australia</option>
                              <option value="TAS">Tasmania</option>
                              <option value="VIC">Victoria</option>
                              <option value="WA">Western Australia</option>
                            </select>
                          </div>
                          <div className="field">
                            <label>Postcode</label>
                            <input
                              value={dialogForm.postcode}
                              maxLength={4}
                              inputMode="numeric"
                              pattern="[0-9]{4}"
                              placeholder="3000"
                              title="Postcode must be 4 digits"
                              onChange={(event) =>
                                setDialogForm((prev) => (prev ? { ...prev, postcode: toDigits(event.target.value, 4) } : prev))
                              }
                            />
                          </div>
                        </>
                      )}
                      <div className="field">
                        <label>Mode</label>
                        <select
                          value={dialogForm.lessonMode}
                          onChange={(event) =>
                            setDialogForm((prev) =>
                              prev ? { ...prev, lessonMode: event.target.value as DialogForm["lessonMode"] } : prev
                            )
                          }
                        >
                          <option value="in_person">In-person</option>
                          <option value="video">Video</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Skill level</label>
                        <select
                          value={dialogForm.skillLevel}
                          onChange={(event) =>
                            setDialogForm((prev) =>
                              prev ? { ...prev, skillLevel: event.target.value as DialogForm["skillLevel"] } : prev
                            )
                          }
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Duration</label>
                        <select
                          value={dialogForm.durationChoice}
                          onChange={(event) =>
                            setDialogForm((prev) =>
                              prev ? { ...prev, durationChoice: event.target.value as DurationChoice } : prev
                            )
                          }
                        >
                          <option value="min30">30 minutes</option>
                          <option value="min60">60 minutes</option>
                          <option value="custom">Other amount</option>
                        </select>
                      </div>
                      {dialogForm.durationChoice === "custom" ? (
                        <div className="field">
                          <label>Custom Duration (minutes)</label>
                          <input
                            value={dialogForm.customDurationMinutes}
                            maxLength={3}
                            inputMode="numeric"
                            pattern="[0-9]{2,3}"
                            placeholder="e.g. 45"
                            onChange={(event) =>
                              setDialogForm((prev) =>
                                prev ? { ...prev, customDurationMinutes: toDigits(event.target.value, 3) } : prev
                              )
                            }
                          />
                        </div>
                      ) : null}
                      <div className="field">
                        <label>Start</label>
                        <input
                          type="datetime-local"
                          value={dialogForm.startAtLocal}
                          onChange={(event) =>
                            setDialogForm((prev) => (prev ? { ...prev, startAtLocal: event.target.value } : prev))
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div className="dialog-col is-notes" data-motion-item="booking-dialog-notes-col">
                    <h4 data-motion-item="booking-dialog-notes-title">Notes</h4>
                    <div className="field">
                      <label>Lesson notes</label>
                      <textarea
                        className="dialog-notes"
                        value={dialogForm.notes}
                        onChange={(event) => setDialogForm((prev) => (prev ? { ...prev, notes: event.target.value } : prev))}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="dialog-actions dialog-actions-booking" data-motion-item="booking-dialog-actions-booking">
                <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={() => void saveDetails()}>
                  {busyAction === "save" ? "Saving..." : "Save details"}
                </button>
                <button className="btn btn-secondary" type="button" disabled={!!busyAction} onClick={openMoveDialog}>
                  {busyAction === "move" ? "Moving..." : selectedIsPending ? "Move request" : "Move booking"}
                </button>
                {!selectedIsPending ? (
                  <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={openInvoiceDialog}>
                    Create invoice
                  </button>
                ) : null}
                {selectedIsPending ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => void approveSelected("approve")}
                  >
                    {busyAction === "approve" ? "Approving..." : "Approve request"}
                  </button>
                ) : null}
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!!busyAction}
                  onClick={() => void sendNotification("reminder")}
                >
                  {busyAction === "reminder" ? "Sending..." : "Send reminder"}
                </button>
                <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={openEmailDialog}>
                  Email customer
                </button>
                <button className="btn btn-danger" type="button" disabled={!!busyAction} onClick={() => void cancelSelected()}>
                  {busyAction === "cancel" ? "Cancelling..." : selectedIsPending ? "Cancel request" : "Cancel booking"}
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={!!busyAction}
                  onClick={() => void deleteSelected()}
                >
                  {busyAction === "delete"
                    ? "Deleting..."
                    : selectedIsPending
                      ? "Remove request entirely"
                      : "Delete booking"}
                </button>
                {selectedIsPending ? (
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => void approveSelected("reject")}
                  >
                    {busyAction === "reject" ? "Rejecting..." : "Reject request"}
                  </button>
                ) : null}
                {selectedSeriesId ? (
                  <button className="btn btn-danger" type="button" disabled={!!busyAction} onClick={() => void removeSeries(selectedSeriesId)}>
                    Remove series
                  </button>
                ) : null}
              </div>
            </form>
          </div>
          {moveDialogOpen ? (
            <div
              className="dialog-backdrop is-secondary"
              role="presentation"
              data-motion-item="move-dialog-backdrop"
              onClick={closeMoveDialog}
            >
              <div
                className="dialog-panel dialog-panel-compact"
                role="dialog"
                aria-modal="true"
                aria-labelledby="move-dialog-title"
                data-motion-item="move-dialog-panel"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="dialog-head" data-motion-item="move-dialog-head">
                  <h3 id="move-dialog-title" data-motion-item="move-dialog-title">
                    {selectedIsPending ? "Move Booking Request" : "Move Booking"}
                  </h3>
                  <button className="btn btn-secondary" type="button" disabled={busyAction === "move"} onClick={closeMoveDialog}>
                    Close
                  </button>
                </div>
                <p className="helper-text dialog-status" data-motion-item="move-dialog-status">
                  Choose the new date and time, then confirm to update the calendar event.
                </p>
                <div className="field" data-motion-item="move-dialog-start-field">
                  <label htmlFor="move-dialog-start-at">New start date & time</label>
                  <input
                    id="move-dialog-start-at"
                    type="datetime-local"
                    value={moveDialogStartAtLocal}
                    autoFocus
                    onChange={(event) => setMoveDialogStartAtLocal(event.target.value)}
                  />
                </div>
                <div className="dialog-actions dialog-actions-secondary" data-motion-item="move-dialog-actions">
                  <button className="btn btn-secondary" type="button" disabled={busyAction === "move"} onClick={closeMoveDialog}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" type="button" disabled={busyAction === "move"} onClick={() => void moveSelected()}>
                    {busyAction === "move" ? "Moving..." : "Confirm move"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {invoiceDialogPresence.isMounted ? (
            <div
              className="dialog-backdrop is-secondary"
              ref={invoiceDialogRootRef}
              data-motion-root="admin"
              data-motion-item="invoice-dialog-backdrop"
              onClick={(event) => {
                event.stopPropagation();
                void closeInvoiceDialog();
              }}
            >
              <div
                className="dialog-panel dialog-panel-compact"
                data-motion-item="invoice-dialog-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="invoice-dialog-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="dialog-head" data-motion-item="invoice-dialog-head">
                  <h3 id="invoice-dialog-title" data-motion-item="invoice-dialog-title">
                    Create invoice
                  </h3>
                  <button className="btn btn-secondary" type="button" onClick={() => void closeInvoiceDialog()}>
                    Cancel
                  </button>
                </div>
                <p className="helper-text dialog-status" data-motion-item="invoice-dialog-status">
                  Add lesson price and optional extras. You can edit and send the invoice from the invoice console.
                </p>
                <div className="manual-grid manual-grid-2">
                  <div className="field">
                    <label>Lesson fee (AUD) *</label>
                    <input
                      value={invoiceForm.lessonPrice}
                      placeholder="e.g. 80"
                      onChange={(event) => setInvoiceForm((prev) => ({ ...prev, lessonPrice: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Due date *</label>
                    <input
                      type="datetime-local"
                      value={invoiceForm.dueAtLocal}
                      onChange={(event) => setInvoiceForm((prev) => ({ ...prev, dueAtLocal: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label className="helper-toggle">
                      <input
                        type="checkbox"
                        checked={invoiceForm.includeEducationalBooks}
                        onChange={(event) =>
                          setInvoiceForm((prev) => ({ ...prev, includeEducationalBooks: event.target.checked }))
                        }
                      />{" "}
                      Educational books
                    </label>
                    <input
                      disabled={!invoiceForm.includeEducationalBooks}
                      value={invoiceForm.educationalBooksPrice}
                      placeholder="AUD"
                      onChange={(event) =>
                        setInvoiceForm((prev) => ({ ...prev, educationalBooksPrice: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label className="helper-toggle">
                      <input
                        type="checkbox"
                        checked={invoiceForm.includeDigitalGuitarLessons}
                        onChange={(event) =>
                          setInvoiceForm((prev) => ({ ...prev, includeDigitalGuitarLessons: event.target.checked }))
                        }
                      />{" "}
                      Digital guitar lessons
                    </label>
                    <input
                      disabled={!invoiceForm.includeDigitalGuitarLessons}
                      value={invoiceForm.digitalGuitarLessonsPrice}
                      placeholder="AUD"
                      onChange={(event) =>
                        setInvoiceForm((prev) => ({ ...prev, digitalGuitarLessonsPrice: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field manual-span-2">
                    <label className="helper-toggle">
                      <input
                        type="checkbox"
                        checked={invoiceForm.includeCustomCharge}
                        onChange={(event) => setInvoiceForm((prev) => ({ ...prev, includeCustomCharge: event.target.checked }))}
                      />{" "}
                      Custom charge
                    </label>
                  </div>
                  <div className="field">
                    <label>Custom description</label>
                    <input
                      disabled={!invoiceForm.includeCustomCharge}
                      value={invoiceForm.customChargeDescription}
                      onChange={(event) =>
                        setInvoiceForm((prev) => ({ ...prev, customChargeDescription: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Custom amount (AUD)</label>
                    <input
                      disabled={!invoiceForm.includeCustomCharge}
                      value={invoiceForm.customChargePrice}
                      onChange={(event) => setInvoiceForm((prev) => ({ ...prev, customChargePrice: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Tax mode</label>
                    <select
                      value={invoiceForm.taxMode}
                      onChange={(event) => setInvoiceForm((prev) => ({ ...prev, taxMode: event.target.value as InvoiceTaxMode }))}
                    >
                      <option value="taxable">Taxable (GST)</option>
                      <option value="gst_free">GST-free</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Notes</label>
                    <textarea
                      value={invoiceForm.notes}
                      onChange={(event) => setInvoiceForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="dialog-actions" data-motion-item="invoice-dialog-actions">
                  <button className="btn btn-secondary" type="button" disabled={!!busyAction} onClick={() => void closeInvoiceDialog()}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => void createInvoiceFromBooking()}
                  >
                    {busyAction === "create_invoice" ? "Creating..." : "Create invoice"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {emailDialogPresence.isMounted ? (
            <div
              className="dialog-backdrop is-secondary"
              ref={emailDialogRootRef}
              data-motion-root="admin"
              data-motion-item="email-dialog-backdrop"
              onClick={(event) => {
                event.stopPropagation();
                void closeEmailDialog();
              }}
            >
              <div
                className="dialog-panel dialog-panel-compact"
                data-motion-item="email-dialog-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="email-dialog-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="dialog-head" data-motion-item="email-dialog-head">
                  <h3 id="email-dialog-title" data-motion-item="email-dialog-title">
                    Email customer
                  </h3>
                  <button className="btn btn-secondary" type="button" onClick={() => void closeEmailDialog()}>
                    Cancel
                  </button>
                </div>
                <p className="helper-text dialog-status" data-motion-item="email-dialog-status">
                  Send a tailored message to this customer.
                </p>
                <div className="field" data-motion-item="email-dialog-subject-field">
                  <label>Subject</label>
                  <input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} />
                </div>
                <div className="field" data-motion-item="email-dialog-message-field">
                  <label>Message</label>
                  <textarea value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} />
                </div>
                <div className="dialog-actions" data-motion-item="email-dialog-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => void closeEmailDialog()}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => void sendNotification("custom", { subject: emailSubject, message: emailMessage })}
                  >
                    {busyAction === "custom" ? "Sending..." : "Send email"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
