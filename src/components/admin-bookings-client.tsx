"use client";

import { formatDateTime, formatBytes, toDateTimeLocalValue } from "@/lib/admin/formatters";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminBookingCalendar, AdminCalendarEvent } from "@/components/admin-booking-calendar";
import { AdminHeader } from "@/components/admin-header";
import { animateIn, animateOut } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";

type CalendarView = "day" | "week" | "month" | "year";
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
  firstName: string;
  lastName: string;
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
  firstName: string;
  lastName: string;
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
  firstName: string;
  lastName: string;
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
  firstName: string;
  lastName: string;
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
  firstName: string;
  lastName: string;
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

type InvoiceProductPreset = {
  id: string;
  label: string;
  description: string;
  unitPriceCents: number;
};

type EditableLineItem = {
  key: string;
  kind: "lesson_fee" | "educational_books" | "digital_lessons" | "custom";
  description: string;
  quantity: string;
  unitPriceAud: string;
  taxMode: InvoiceTaxMode;
  isPreset?: boolean;
};

type BookingInvoiceForm = {
  dueAtLocal: string;
  taxMode: InvoiceTaxMode;
  notes: string;
};

function defaultBookingInvoiceForm(): BookingInvoiceForm {
  const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const shifted = new Date(dueAt.getTime() - dueAt.getTimezoneOffset() * 60_000);
  return {
    dueAtLocal: shifted.toISOString().slice(0, 16),
    taxMode: "taxable",
    notes: ""
  };
}

function emptyCustomerForm(): CustomerForm {
  return {
    firstName: "",
    lastName: "",
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
  let firstName = customer.firstName;
  let lastName = customer.lastName;

  if (!firstName && !lastName) {
    const nameParts = customer.fullName.split(" ");
    firstName = nameParts[0] || "";
    lastName = nameParts.slice(1).join(" ") || "";
  }

  return {
    firstName,
    lastName,
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

function toAuState(value: string): AuState {
  return AU_STATES.includes(value as AuState) ? (value as AuState) : "VIC";
}

function toDigits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

function readApiErrorMessage(payload: unknown, fallback: string): string {
  const api = payload as { error?: string } | null | undefined;
  return api?.error || fallback;
}

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
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const phone = form.phone.trim();
  const houseNumber = form.houseNumber.trim();
  const streetName = form.streetName.trim();
  const streetType = form.streetType.trim();
  const suburb = form.suburb.trim();
  const postcode = form.postcode.trim();

  if (!firstName) {
    return "First name is required.";
  }
  if (!lastName) {
    return "Last name is required.";
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

  const nameParts = row.name.split(" ");
  const firstName = row.firstName || nameParts[0] || "";
  const lastName = row.lastName || nameParts.slice(1).join(" ") || "";

  return {
    firstName,
    lastName,
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
  const [activeTab, setActiveTab] = useState<"appointment" | "emails">("appointment");
  const [moveDialogPresence, setMoveDialogPresence] = useState({ isMounted: false });
  const [moveDialogStartAtLocal, setMoveDialogStartAtLocal] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  
  // Email History & Composer State
  const [emailHistory, setEmailHistory] = useState<ReadonlyArray<{ id: string; subject: string; status: string; error?: string; createdAt: string }>>([]);
  const [loadingEmailHistory, setLoadingEmailHistory] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailComposerSubject, setEmailComposerSubject] = useState("");
  const [emailComposerMessage, setEmailComposerMessage] = useState("");
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
  const [presets, setPresets] = useState<InvoiceProductPreset[]>([]);
  const [invoiceForm, setInvoiceForm] = useState<BookingInvoiceForm>(defaultBookingInvoiceForm());
  const [editingLineItems, setEditingLineItems] = useState<EditableLineItem[]>([]);
  const [editingProductPresetId, setEditingProductPresetId] = useState("");
  const [materialsCustomerId, setMaterialsCustomerId] = useState("");
  const [materialsBookingId, setMaterialsBookingId] = useState("");
  const [materialsBookings, setMaterialsBookings] = useState<LearningMaterialBooking[]>([]);
  const [materialsList, setMaterialsList] = useState<LearningMaterialRow[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsUploading, setMaterialsUploading] = useState(false);
  const [materialsDeletingId, setMaterialsDeletingId] = useState<string | null>(null);
  const dialogPresence = usePresenceExit();
  const manualDialogPresence = usePresenceExit();
  const customerEditorPresence = usePresenceExit();
  const materialsDialogPresence = usePresenceExit();
  const emailDialogPresence = usePresenceExit();
  const invoiceDialogPresence = usePresenceExit();
  const dialogRootRef = useRef<HTMLDivElement | null>(null);
  const manualDialogRootRef = useRef<HTMLDivElement | null>(null);
  const customerEditorRootRef = useRef<HTMLDivElement | null>(null);
  const materialsDialogRootRef = useRef<HTMLDivElement | null>(null);
  const emailDialogRootRef = useRef<HTMLDivElement | null>(null);
  const invoiceDialogRootRef = useRef<HTMLDivElement | null>(null);
  const moveDialogRootRef = useRef<HTMLDivElement | null>(null);
  const calendarRootRef = useRef<HTMLDivElement | null>(null);
  const manualFormRef = useRef<HTMLFormElement | null>(null);
  const materialsUploadFormRef = useRef<HTMLFormElement | null>(null);
  const authRedirectingRef = useRef(false);
  const dialogSessionRef = useRef(0);

  const rangeLabel = useMemo(() => `${view.toUpperCase()} VIEW`, [view]);

  function toMoneyInput(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  function addEditableLineItem() {
    setEditingLineItems((previous) => [
      ...previous,
      {
        key: `new-${Date.now()}-${previous.length}`,
        kind: "custom",
        description: "",
        quantity: "1",
        unitPriceAud: "0.00",
        taxMode: invoiceForm.taxMode
      }
    ]);
  }

  function addInvoiceProductPresetToEditor(preset: InvoiceProductPreset) {
    setEditingLineItems((previous) => [
      ...previous,
      {
        key: `preset-${preset.id}-${Date.now()}-${previous.length}`,
        kind: "custom",
        description: preset.description,
        quantity: "1",
        unitPriceAud: toMoneyInput(preset.unitPriceCents),
        taxMode: invoiceForm.taxMode,
        isPreset: true
      }
    ]);
  }

  const safeFetch = useCallback(async (...args: Parameters<typeof globalThis.fetch>): Promise<Response> => {
    try {
      return await globalThis.fetch(...args);
    } catch {
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
    window.location.assign("/admin/login");
  }, []);
  const handleApiError = useCallback(
    async (response: Response, fallback: string) => {
      if (response.status === 401 || response.status === 403) {
        redirectToAdminLogin();
        return;
      }
      setError(await readApiErrorFromResponse(response, fallback));
    },
    [redirectToAdminLogin]
  );

  const loadEmailHistory = useCallback(async (customerId: string) => {
    setLoadingEmailHistory(true);
    try {
      const response = await safeFetch(`/api/admin/customers/${customerId}/email`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setEmailHistory(data.history || []);
      }
    } catch {
      // Silent error
    } finally {
      setLoadingEmailHistory(false);
    }
  }, [safeFetch]);

  async function sendCustomerEmail() {
    if (!selectedCustomer) return;
    if (!emailComposerSubject.trim() || !emailComposerMessage.trim()) {
      setError("Email requires both subject and message.");
      return;
    }

    setSendingEmail(true);
    setError("");
    try {
      const response = await safeFetch(`/api/admin/customers/${selectedCustomer.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailComposerSubject.trim(),
          message: emailComposerMessage.trim()
        })
      });

      if (!response.ok) {
        await handleApiError(response, "Unable to send email.");
        return;
      }

      setNotice("Email sent successfully.");
      setEmailComposerSubject("");
      setEmailComposerMessage("");
      await loadEmailHistory(selectedCustomer.id);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSendingEmail(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
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
    if (!manualDialogPresence.isMounted && !materialsDialogPresence.isMounted) {
      return;
    }
    void loadCustomers();
  }, [loadCustomers, manualDialogPresence.isMounted, materialsDialogPresence.isMounted]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await safeFetch("/api/admin/presets");
        if (response.ok) {
          const body = await response.json();
          setPresets(body.presets || []);
        }
      } catch {
        // Silent failure for presets
      }
    })();
  }, [safeFetch]);

  function openDialog(event: EventWithRow) {
    const dialogSession = dialogSessionRef.current + 1;
    dialogSessionRef.current = dialogSession;
    setNotice("");
    setSelectedEvent(event);
    setDialogForm(defaultFormFromEvent(event));
    setActiveTab("appointment");
    setMoveDialogPresence({ isMounted: false });
    setMoveDialogStartAtLocal("");
    setSelectedCustomer(null);
    setIsEditingCustomer(false);
    
    // Reset email state
    setEmailHistory([]);
    setEmailComposerSubject("");
    setEmailComposerMessage("");
    
    setEmailSubject("");
    setEmailMessage("");
    setInvoiceForm(defaultBookingInvoiceForm());
    emailDialogPresence.hide(undefined, { immediate: true });
    invoiceDialogPresence.hide(undefined, { immediate: true });
    dialogPresence.show();

    if ("customerId" in event.row && event.row.customerId) {
      const customerId = event.row.customerId as string;
      void loadEmailHistory(customerId);
      
      safeFetch(`/api/admin/customers/${customerId}`, { credentials: "same-origin" })
        .then((res) => {
          if (!res.ok) {
            console.error("Customer fetch failed:", res.status, res.statusText);
            return null;
          }
          return res.json();
        })
        .then((data) => {
          if (dialogSessionRef.current !== dialogSession) {
            return;
          }
          if (data?.customer) {
            setSelectedCustomer(data.customer);
          }
        })
        .catch((err) => {
          console.error("fetch customer error:", err);
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
    setMoveDialogPresence({ isMounted: false });
    setMoveDialogStartAtLocal("");
    if (dialogRootRef.current) {
      await animateOut(dialogRootRef.current, { scope: "admin" });
    }
    dialogPresence.hide(
      () => {
        if (dialogSessionRef.current !== closingDialogSession) {
          return;
        }
        setSelectedEvent(null);
        setDialogForm(null);
        setActiveTab("appointment");
        setSelectedCustomer(null);
        setIsEditingCustomer(false);
        setEmailHistory([]);
        setEmailComposerSubject("");
        setEmailComposerMessage("");
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
    setEditingLineItems([]);
    setEditingProductPresetId("");
    invoiceDialogPresence.show();
  }

  async function closeInvoiceDialog() {
    if (invoiceDialogRootRef.current) {
      await animateOut(invoiceDialogRootRef.current, { scope: "admin" });
    }
    invoiceDialogPresence.hide(
      () => {
        setInvoiceForm(defaultBookingInvoiceForm());
        setEditingLineItems([]);
        setEditingProductPresetId("");
      },
      { immediate: true }
    );
  }

  async function createInvoiceFromBooking() {
    if (!selectedEvent || selectedEvent.entityType !== "booking") {
      return;
    }

    if (!editingLineItems.length) {
      setError("Add at least one line item to create the invoice.");
      return;
    }

    const lineItemsPayload = editingLineItems.map((lineItem, index) => {
      const quantity = Number.parseInt(lineItem.quantity, 10);
      const unitPriceCents = Math.round(Number.parseFloat(lineItem.unitPriceAud || "0") * 100);
      return {
        kind: lineItem.kind,
        description: lineItem.description.trim(),
        quantity,
        unitPriceCents,
        taxMode: lineItem.taxMode,
        sortOrder: index
      };
    });

    const invalid = lineItemsPayload.some(
      (lineItem) =>
        !lineItem.description ||
        !Number.isFinite(lineItem.quantity) ||
        lineItem.quantity < 1 ||
        !Number.isFinite(lineItem.unitPriceCents) ||
        lineItem.unitPriceCents < 0
    );

    if (invalid) {
      setError("Each line item needs description, quantity >= 1, and unit price >= 0.");
      return;
    }

    setBusyAction("create_invoice");
    setError("");
    const response = await safeFetch(`/api/admin/bookings/${selectedEvent.id}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taxMode: invoiceForm.taxMode,
        dueAt: new Date(invoiceForm.dueAtLocal).toISOString(),
        notes: invoiceForm.notes.trim() || undefined,
        lineItems: lineItemsPayload
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
    let firstName = customer.firstName;
    let lastName = customer.lastName;

    if (!firstName && !lastName) {
      const nameParts = customer.fullName.split(" ");
      firstName = nameParts[0] || "";
      lastName = nameParts.slice(1).join(" ") || "";
    }

    setManualFieldValue("firstName", firstName);
    setManualFieldValue("lastName", lastName);
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
        "input[name='firstName']",
        "input[name='lastName']",
        "input[name='email']",
        "input[name='phone']",
        "input[name='houseNumber']",
        "input[name='streetName']",
        "input[name='suburb']",
        "input[name='postcode']"
      ]);
    }
    if (step === "lesson") {
      const selectors = ["select[name='lessonMode']", "select[name='skillLevel']"];
      // Duration choice is a React-managed state but the specific duration values depend on it
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

  async function revealPortalPassword(customerId: string) {
    await mutatePortalCredential(customerId, "reveal");
  }

  async function regeneratePortalPassword(customerId: string) {
    const confirmed = window.confirm(
      "Regenerate this customer portal password? The current password will stop working immediately."
    );
    if (!confirmed) {
      return;
    }
    await mutatePortalCredential(customerId, "regenerate");
  }

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

  function openLearningMaterialsDialog() {
    setError("");
    setNotice("");
    setMaterialsCustomerId("");
    setMaterialsBookingId("");
    setMaterialsBookings([]);
    setMaterialsList([]);
    materialsDialogPresence.show();
  }

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

  async function uploadLearningMaterial() {
    const formElement = materialsUploadFormRef.current;
    if (!formElement) {
      return;
    }
    if (!materialsCustomerId) {
      setError("Select a customer before uploading.");
      return;
    }

    const form = new FormData(formElement);
    const file = form.get("file");
    if (!(file instanceof File)) {
      setError("Choose a PDF or audio file to upload.");
      return;
    }
    if (materialsBookingId) {
      form.set("bookingId", materialsBookingId);
    } else {
      form.delete("bookingId");
    }

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
      firstName: dialogForm.firstName.trim(),
      lastName: dialogForm.lastName.trim(),
      name: `${dialogForm.firstName.trim()} ${dialogForm.lastName.trim()}`,
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
    setMoveDialogPresence({ isMounted: true });
  }

  function closeMoveDialog() {
    if (busyAction === "move") {
      return;
    }
    setMoveDialogPresence({ isMounted: false });
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
    const ok =
      selectedEvent.entityType === "booking"
        ? await mutateBooking("move", { newStartAt })
        : await mutateRequest("move", { newStartAt });
    setBusyAction(null);
    if (!ok) {
      return;
    }
    setDialogForm((prev) => (prev ? { ...prev, startAtLocal: moveDialogStartAtLocal } : prev));
    setMoveDialogPresence({ isMounted: false });
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
    const ok =
      selectedEvent.entityType === "booking"
        ? await mutateBooking("cancel", {})
        : await mutateRequest("cancel", {});
    setBusyAction(null);
    if (!ok) {
      return;
    }
    await closeDialog();
    setNotice(selectedEvent.entityType === "booking_request" ? "Booking request cancelled." : "Booking cancelled.");
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
    setNotice(selectedEvent.entityType === "booking_request" ? "Booking request deleted." : "Booking deleted.");
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
    setNotice(action === "approve" ? "Booking request approved." : "Booking request rejected.");
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
    setNotice("Recurring series removed.");
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
    const firstName = String(form.get("firstName") || "").trim();
    const lastName = String(form.get("lastName") || "").trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const phone = toDigits(String(form.get("phone") || ""), 10);
    const customDurationRaw = String(form.get("customDurationMinutes") || "");
    const customDurationMinutes =
      manualDurationChoice === "custom" && customDurationRaw ? Number.parseInt(customDurationRaw, 10) : undefined;

    if (!firstName) {
      setCreating(false);
      setError("First name is required.");
      return;
    }
    if (!lastName) {
      setCreating(false);
      setError("Last name is required.");
      return;
    }

    const payload = {
      firstName,
      lastName,
      name: fullName,
      email: String(form.get("email") || ""),
      phone,
      country: "Australia" as const,
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
      firstName: customerForm.firstName.trim(),
      lastName: customerForm.lastName.trim(),
      fullName: `${customerForm.firstName.trim()} ${customerForm.lastName.trim()}`,
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

  const selectedKey = selectedEventKey(selectedEvent);
  const selectedIsPending = selectedEvent?.entityType === "booking_request";
  const selectedSeriesId =
    selectedEvent && selectedEvent.entityType === "booking"
      ? ((selectedEvent.row as BookingRow).seriesId ?? null)
      : null;
  const selectedManualCustomer = manualCustomerId ? customers.find((customer) => customer.id === manualCustomerId) ?? null : null;
  const manualStepIndex = MANUAL_STEP_ORDER.indexOf(manualStep);

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <AdminHeader title="LessonFlow Booking Console" />

      <div className="admin-card booking-row admin-range-row" data-motion-item="admin-range-card">
        <strong data-motion-item="admin-range-label">{rangeLabel}</strong>
        <label className="admin-inline-field" data-motion-item="admin-view-select">
          View{" "}
          <select value={view} onChange={(e) => setView(e.target.value as CalendarView)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Yearly</option>
          </select>
        </label>
        <label className="admin-inline-field" data-motion-item="admin-date-select">
          Base date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="admin-card calendar-legend" data-motion-item="admin-legend-card">
        <div className="legend-chip-row">
          <span className="legend-chip event-green" data-motion-item="legend-confirmed">Confirmed</span>
          <span className="legend-chip event-yellow" data-motion-item="legend-pending">Pending</span>
          <span className="legend-chip event-red" data-motion-item="legend-rejected">Rejected (48h)</span>
          <span className="legend-chip event-slate" data-motion-item="legend-cancelled">Cancelled (48h)</span>
        </div>
        <div className="legend-action-row">
          <button className="btn btn-primary" type="button" data-motion-item="legend-action-add-manual" onClick={openManualDialog}>
            Add Manual Booking
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            data-motion-item="legend-action-learning-materials"
            onClick={openLearningMaterialsDialog}
          >
            Customer Learning Materials
          </button>
        </div>
      </div>

      {error && !manualDialogPresence.isMounted ? <p className="notice error" data-motion-item="admin-error-notice">{error}</p> : null}
      {notice && !manualDialogPresence.isMounted ? <p className="notice success" data-motion-item="admin-success-notice">{notice}</p> : null}
      {loading ? <p className="notice" data-motion-item="admin-loading-notice">Loading...</p> : null}

      <div className="admin-card" ref={calendarRootRef} data-motion-root="calendar" data-motion-item="admin-calendar-card">
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
              <button className="btn btn-secondary" type="button" onClick={() => void closeManualDialog()}>CLOSE</button>
            </div>
            <p className="helper-text dialog-status">Select an existing customer first where possible. If you enter details manually, matching customers will be detected.</p>
            
            <div className="manual-steps">
              {MANUAL_STEP_ORDER.map((step, index) => (
                <div key={step} className={`manual-step-chip ${index === manualStepIndex ? "is-active" : ""} ${index < manualStepIndex ? "is-complete" : ""}`}>
                  <span>{index + 1}</span>
                  <strong>{MANUAL_STEP_LABEL[step]}</strong>
                </div>
              ))}
            </div>

            <form ref={manualFormRef} className="manual-booking-form" onSubmit={(e) => { e.preventDefault(); if (manualStep !== "schedule") goToNextManualStep(); else void addManualBooking(); }}>
              <section className={`manual-section ${manualStep !== "customer" ? "is-step-hidden" : ""}`}>
                <h3 className="manual-section-title">CUSTOMER</h3>
                <div className="manual-grid manual-grid-3">
                  <div className="field">
                    <label>Search customer</label>
                    <input value={customerQuery} placeholder="Filter by name, email, or phone" onChange={(e) => setCustomerQuery(e.target.value)} />
                  </div>
                  <div className="field manual-span-2">
                    <label>Select existing customer</label>
                    <select disabled={loadingCustomers} value={manualCustomerId} onChange={(e) => { const nextId = e.target.value; setManualCustomerId(nextId); const selected = customers.find(c => c.id === nextId); if (selected) applyCustomerToManual(selected); }}>
                      <option value="">{loadingCustomers ? "Loading customers..." : "None selected"}</option>
                      {visibleCustomers.map(c => <option key={c.id} value={c.id}>{c.lastName ? `${c.lastName}, ${c.firstName}` : c.fullName}</option>)}
                    </select>
                  </div>
                  <div className="field manual-span-2">
                    <label className="helper-toggle">
                      <input type="checkbox" checked={manualUpdateCustomerFromBooking} onChange={e => setManualUpdateCustomerFromBooking(e.target.checked)} />
                      Update linked customer profile from this booking
                    </label>
                  </div>
                </div>

                <h3 className="manual-section-title">STUDENT</h3>
                <div className="manual-grid manual-grid-2">
                  <div className="field">
                    <label>First Name *</label>
                    <input name="firstName" required />
                  </div>
                  <div className="field">
                    <label>Last Name *</label>
                    <input name="lastName" required />
                  </div>
                </div>

                <h3 className="manual-section-title">CONTACT</h3>
                <div className="manual-grid manual-grid-2">
                  <div className="field">
                    <label>Email *</label>
                    <input type="email" name="email" required />
                  </div>
                  <div className="field">
                    <label>Phone *</label>
                    <input name="phone" required placeholder="10 digits" maxLength={10} />
                  </div>
                </div>

                <h3 className="manual-section-title">ADDRESS</h3>
                <div className="manual-grid manual-grid-3">
                  <div className="field">
                    <label>Unit/Apartment</label>
                    <input name="unitNumber" />
                  </div>
                  <div className="field">
                    <label>House/Building Number *</label>
                    <input name="houseNumber" required />
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
                  <div className="field">
                    <label>Postcode *</label>
                    <input name="postcode" required placeholder="3000" maxLength={4} />
                  </div>
                </div>
              </section>

              <section className={`manual-section ${manualStep !== "lesson" ? "is-step-hidden" : ""}`}>
                <h3 className="manual-section-title">LESSON</h3>
                <div className="manual-grid manual-grid-3">
                  <div className="field">
                    <label>Mode *</label>
                    <select name="lessonMode" required defaultValue="in_person">
                      <option value="in_person">In-person</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Skill Level *</label>
                    <select name="skillLevel" required defaultValue="beginner">
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Duration *</label>
                    <select value={manualDurationChoice} onChange={e => setManualDurationChoice(e.target.value as DurationChoice)} required>
                      <option value="min30">30 minutes</option>
                      <option value="min60">60 minutes</option>
                      <option value="custom">Custom duration...</option>
                    </select>
                  </div>
                  {manualDurationChoice === "custom" && (
                    <div className="field">
                      <label>Minutes *</label>
                      <input name="customDurationMinutes" type="number" min={15} max={300} required placeholder="e.g. 45" />
                    </div>
                  )}
                </div>
              </section>

              <section className={`manual-section ${manualStep !== "schedule" ? "is-step-hidden" : ""}`}>
                <h3 className="manual-section-title">SCHEDULE</h3>
                <p className="helper-text">Review timing details, then confirm to create the booking.</p>
                
                {manualMatch ? (
                  <div className="manual-section manual-match" style={{ marginBottom: '20px', padding: '16px', background: 'rgba(255, 227, 124, 0.1)', border: '1px solid var(--brand-warning)', borderRadius: '8px' }}>
                    <h3 className="manual-section-title" style={{ color: 'var(--brand-warning)', marginTop: 0 }}>Existing Customer Match Found</h3>
                    <p className="helper-text" style={{ marginBottom: '12px' }}>
                      {manualMatch.lastName ? `${manualMatch.lastName}, ${manualMatch.firstName}` : manualMatch.fullName} · {manualMatch.email} · {manualMatch.phone}
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-primary" type="button" disabled={creating} onClick={() => void resolveManualMatch("use_existing")}>USE EXISTING</button>
                      <button className="btn btn-secondary" type="button" disabled={creating} onClick={() => void resolveManualMatch("update_existing")}>UPDATE & USE</button>
                      <button className="btn btn-secondary" type="button" disabled={creating} onClick={() => void resolveManualMatch("create_new")}>IGNORE & CREATE NEW</button>
                    </div>
                  </div>
                ) : null}

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
                    <label className="helper-toggle">
                      <input type="checkbox" name="isRecurring" />
                      Weekly recurring
                    </label>
                  </div>
                </div>
              </section>

              {error ? <p className="notice error">{error}</p> : null}

              <div className="manual-form-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p className="helper-text">* Required fields</p>
                <div className="manual-step-footer-actions" style={{ display: 'flex', gap: '8px' }}>
                  {manualStep !== "customer" && <button className="btn btn-secondary" type="button" onClick={goToPreviousManualStep}>BACK</button>}
                  {manualStep !== "schedule" ? (
                    <button className="btn btn-primary" type="button" onClick={goToNextManualStep}>NEXT: {manualStep === "customer" ? "LESSON" : "SCHEDULE & CONFIRM"}</button>
                  ) : (
                    <button className="btn btn-primary" type="submit" disabled={creating || !!manualMatch}>{creating ? "ADDING..." : "ADD BOOKING"}</button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {customerEditorPresence.isMounted ? (
        <div
          className="dialog-backdrop is-secondary"
          ref={customerEditorRootRef}
          data-motion-root="admin"
          data-motion-item="customer-editor-dialog-backdrop"
          onClick={(e) => { e.stopPropagation(); void closeCustomerEditor(); }}
        >
          <div
            className="dialog-panel dialog-panel-compact"
            data-motion-item="customer-editor-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-editor-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-head">
              <h3 id="customer-editor-dialog-title">{customerEditorMode === "create" ? "Create Customer" : "Edit Customer"}</h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeCustomerEditor()}>Cancel</button>
            </div>
            <div className="form-grid dialog-form-grid">
              <div className="field">
                <label>First Name *</label>
                <input value={customerForm.firstName} onChange={(e) => setCustomerForm(prev => ({ ...prev, firstName: e.target.value }))} />
              </div>
              <div className="field">
                <label>Last Name *</label>
                <input value={customerForm.lastName} onChange={(e) => setCustomerForm(prev => ({ ...prev, lastName: e.target.value }))} />
              </div>
              <div className="field full">
                <label>Email *</label>
                <input type="email" value={customerForm.email} onChange={(e) => setCustomerForm(prev => ({ ...prev, email: e.target.value }))} />
              </div>
              <div className="field">
                <label>Phone *</label>
                <input value={customerForm.phone} maxLength={10} onChange={(e) => setCustomerForm(prev => ({ ...prev, phone: toDigits(e.target.value, 10) }))} />
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => void closeCustomerEditor()}>Cancel</button>
              <button className="btn btn-primary" type="button" disabled={savingCustomer} onClick={() => void saveCustomer()}>{savingCustomer ? "Saving..." : "Save customer"}</button>
            </div>
          </div>
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
          <div className="dialog-panel booking-dialog-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-head">
              <h3>{selectedEvent.title}</h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeDialog()}>Close</button>
            </div>
            <div className="dialog-status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>Status: <strong>{selectedEvent.status}</strong></div>
              
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.1)', padding: '2px', borderRadius: '6px' }}>
                <button 
                  className={`btn ${activeTab === 'appointment' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '0.75rem', border: 'none', boxShadow: 'none' }}
                  type="button"
                  onClick={() => setActiveTab('appointment')}
                >
                  Appointment
                </button>
                <button 
                  className={`btn ${activeTab === 'emails' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '0.75rem', border: 'none', boxShadow: 'none' }}
                  type="button"
                  onClick={() => setActiveTab('emails')}
                  disabled={!selectedCustomer}
                >
                  Communication
                </button>
              </div>
            </div>

            <form className="dialog-form" onSubmit={(e) => e.preventDefault()}>
              <div className="booking-dialog-scroll">
                <div className="dialog-layout">
                  {activeTab === 'appointment' ? (
                    <>
                      <div className="dialog-col">
                        <h4>Customer details</h4>
                        <div className="form-grid dialog-form-grid">
                          {selectedCustomer && !isEditingCustomer ? (
                            <>
                              <div className="field full" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Read-only customer</span>
                                <button type="button" className="btn btn-secondary" onClick={() => { router.push(`/admin/customers?customerId=${selectedCustomer.id}&edit=true`); }}>Edit</button>
                              </div>
                              <div className="field">
                                <label>First Name</label>
                                <input value={selectedCustomer.firstName || selectedCustomer.fullName.split(' ')[0]} readOnly />
                              </div>
                              <div className="field">
                                <label>Last Name</label>
                                <input value={selectedCustomer.lastName || selectedCustomer.fullName.split(' ').slice(1).join(' ')} readOnly />
                              </div>
                              <div className="field full">
                                <label>Email</label>
                                <input value={selectedCustomer.email} readOnly />
                              </div>
                              <div className="field">
                                <label>Phone</label>
                                <input value={selectedCustomer.phone} readOnly />
                              </div>
                              <div className="field">
                                <label>Suburb</label>
                                <input value={selectedCustomer.suburb} readOnly />
                              </div>
                              <div className="field">
                                <label>Postcode</label>
                                <input value={selectedCustomer.postcode} readOnly />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="field">
                                <label>First Name</label>
                                <input value={dialogForm.firstName} onChange={(e) => setDialogForm(prev => (prev ? { ...prev, firstName: e.target.value } : prev))} />
                              </div>
                              <div className="field">
                                <label>Last Name</label>
                                <input value={dialogForm.lastName} onChange={(e) => setDialogForm(prev => (prev ? { ...prev, lastName: e.target.value } : prev))} />
                              </div>
                              <div className="field full">
                                <label>Email</label>
                                <input type="email" value={dialogForm.email} onChange={(e) => setDialogForm(prev => (prev ? { ...prev, email: e.target.value } : prev))} />
                              </div>
                              <div className="field">
                                <label>Phone</label>
                                <input value={dialogForm.phone} maxLength={10} onChange={(e) => setDialogForm(prev => (prev ? { ...prev, phone: toDigits(e.target.value, 10) } : prev))} />
                              </div>
                              <div className="field">
                                <label>Suburb</label>
                                <input value={dialogForm.suburb} onChange={(e) => setDialogForm(prev => (prev ? { ...prev, suburb: e.target.value } : prev))} />
                              </div>
                              <div className="field">
                                <label>Postcode</label>
                                <input value={dialogForm.postcode} maxLength={4} onChange={(e) => setDialogForm(prev => (prev ? { ...prev, postcode: e.target.value } : prev))} />
                              </div>
                            </>
                          )}
                          <div className="field">
                            <label>Start</label>
                            <input type="datetime-local" value={dialogForm.startAtLocal} onChange={(e) => setDialogForm(prev => (prev ? { ...prev, startAtLocal: e.target.value } : prev))} />
                          </div>
                        </div>
                      </div>
                      <div className="dialog-col is-notes">
                        <h4>Notes</h4>
                        <div className="field">
                          <label>Lesson notes</label>
                          <textarea className="dialog-notes" value={dialogForm.notes} onChange={(e) => setDialogForm(prev => (prev ? { ...prev, notes: e.target.value } : prev))} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="dialog-col">
                        <h4>Email History</h4>
                        <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '12px', border: '1px solid var(--line)', maxHeight: '400px', overflowY: 'auto' }}>
                          {loadingEmailHistory ? (
                            <p className="helper-text">Loading history...</p>
                          ) : emailHistory.length > 0 ? (
                            <div style={{ display: 'grid', gap: '8px' }}>
                              {emailHistory.map((email) => (
                                <div key={email.id} style={{ padding: '12px', borderBottom: '1px solid var(--line)', fontSize: '0.85rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <strong style={{ color: 'var(--ink-0)' }}>{email.subject}</strong>
                                    <span style={{ color: 'var(--ink-2)', fontSize: '0.75rem' }}>{formatDateTime(email.createdAt)}</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span className={`invoice-item-chip invoice-item-chip-status invoice-item-chip-status-${email.status === 'sent' ? 'paid' : 'draft'}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                                      {email.status}
                                    </span>
                                    {email.error && <span style={{ color: 'var(--brand-danger)', fontSize: '0.75rem' }}>{email.error}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="helper-text">No email history found for this address.</p>
                          )}
                        </div>
                      </div>

                      <div className="dialog-col is-notes">
                        <h4>Send Email</h4>
                        <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', border: '1px solid var(--line)' }}>
                          <div style={{ display: 'grid', gap: '12px' }}>
                            <div className="field">
                              <label>Subject</label>
                              <input 
                                placeholder="Email subject"
                                value={emailComposerSubject}
                                onChange={e => setEmailComposerSubject(e.target.value)}
                              />
                            </div>
                            <div className="field">
                              <label>Message</label>
                              <textarea 
                                placeholder="Type your message to the student here..."
                                style={{ minHeight: '160px', resize: 'vertical' }}
                                value={emailComposerMessage}
                                onChange={e => setEmailComposerMessage(e.target.value)}
                              />
                            </div>
                            <button 
                              className="btn btn-primary" 
                              type="button"
                              disabled={sendingEmail || !emailComposerSubject.trim() || !emailComposerMessage.trim()}
                              onClick={() => void sendCustomerEmail()}
                            >
                              {sendingEmail ? "Sending..." : "Send Email"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="dialog-actions dialog-actions-booking">
                {activeTab === 'appointment' ? (
                  <>
                    <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={() => void saveDetails()}>Save details</button>
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
                  </>
                ) : (
                  <button className="btn btn-secondary" type="button" onClick={() => setActiveTab('appointment')}>Back to appointment</button>
                )}
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
              <button className="btn btn-secondary" type="button" onClick={() => void closeLearningMaterialsDialog()}>CLOSE</button>
            </div>
            <p className="helper-text dialog-status">Select a customer, then optionally choose an appointment before uploading lesson materials.</p>
            
            <div className="manual-grid manual-grid-2" style={{ marginTop: '10px' }}>
              <div className="field">
                <label>Search customer</label>
                <input 
                  value={customerQuery} 
                  placeholder="Filter by name, email, or phone" 
                  onChange={(e) => setCustomerQuery(e.target.value)} 
                />
              </div>
              <div className="field">
                <label>Select customer</label>
                <select 
                  value={materialsCustomerId} 
                  onChange={(e) => { 
                    const nextId = e.target.value; 
                    setMaterialsCustomerId(nextId); 
                    if (nextId) void loadLearningMaterials(nextId); 
                  }}
                >
                  <option value="">{loadingCustomers ? "Loading..." : "Choose customer"}</option>
                  {visibleCustomers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.lastName ? `${c.lastName}, ${c.firstName}` : c.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field" style={{ marginTop: '12px' }}>
              <label>Select appointment</label>
              <select 
                disabled={!materialsCustomerId}
                value={materialsBookingId} 
                onChange={e => {
                  const bid = e.target.value;
                  setMaterialsBookingId(bid);
                  void loadLearningMaterials(materialsCustomerId, bid || undefined);
                }}
              >
                <option value="">{materialsCustomerId ? "General material (No specific appointment)" : "Select customer first"}</option>
                {materialsBookings.map(b => (
                  <option key={b.id} value={b.id}>
                    {formatDateTime(b.startAt)} ({b.status})
                  </option>
                ))}
              </select>
            </div>

            <form 
              ref={materialsUploadFormRef} 
              className="material-upload-form" 
              onSubmit={e => { e.preventDefault(); void uploadLearningMaterial(); }}
              style={{ marginTop: '12px' }}
            >
              <div className="manual-grid manual-grid-2">
                <div className="field">
                  <label>Material title</label>
                  <input name="title" required placeholder="e.g. Pentatonic exercise week 1" />
                </div>
                <div className="field">
                  <label>File</label>
                  <input type="file" name="file" accept={LEARNING_MATERIAL_ACCEPT} required />
                </div>
              </div>
              <div style={{ marginTop: '12px', display: 'flex' }}>
                <button className="btn btn-primary" type="submit" disabled={materialsUploading || !materialsCustomerId}>
                  {materialsUploading ? "UPLOADING..." : "UPLOAD MATERIAL"}
                </button>
              </div>
            </form>

            <div className="materials-list-section" style={{ marginTop: '20px' }}>
              {materialsLoading ? (
                <p className="helper-text">Loading materials...</p>
              ) : materialsList.length > 0 ? (
                      <div className="materials-grid">
                        {materialsList.map(m => (
                          <div key={m.id} className="material-card">
                            <div className="material-card-info">
                              <strong>{m.title}</strong>
                              <p className="helper-text">
                                {m.materialType.toUpperCase()} · {formatBytes(m.sizeBytes)} · {new Date(m.createdAt).toLocaleDateString()}
                              </p>
                              {m.materialType === "audio" && m.previewUrl && (
                                <div style={{ marginTop: '8px' }}>
                                  <audio className="material-audio-player" controls preload="metadata" src={m.previewUrl} />
                                </div>
                              )}
                            </div>
                            <div className="material-card-actions">
                              {m.materialType === "pdf" && m.previewUrl && (
                                <a 
                                  className="btn btn-secondary btn-compact" 
                                  href={m.previewUrl} 
                                  target="_blank" 
                                  rel="noreferrer"
                                >
                                  PREVIEW
                                </a>
                              )}
                              <button 
                                className="btn btn-danger btn-compact" 
                                disabled={materialsDeletingId === m.id}
                                onClick={() => void deleteLearningMaterial(m)}
                              >
                                {materialsDeletingId === m.id ? "..." : "DELETE"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
              ) : (
                <p className="helper-text">No materials uploaded for the current selection.</p>
              )}
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
            className="dialog-panel booking-dialog-panel dialog-panel-wide"
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
            <div className="booking-dialog-scroll">
              <p className="helper-text dialog-status" data-motion-item="invoice-dialog-status">
                Add lesson price and optional extras. You can edit and send the invoice from the invoice console.
              </p>
              <div className="manual-grid manual-grid-2">
                <div className="field">
                  <label>Due date *</label>
                  <input
                    type="datetime-local"
                    value={invoiceForm.dueAtLocal}
                    onChange={(event) => setInvoiceForm((prev) => ({ ...prev, dueAtLocal: event.target.value }))}
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
                <div className="field manual-span-2">
                  <label>Notes</label>
                  <textarea
                    value={invoiceForm.notes}
                    onChange={(event) => setInvoiceForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>

              <div className="invoice-line-list">
                {editingLineItems.map((lineItem, index) => (
                  <div key={lineItem.key} className="invoice-line-item invoice-line-item-editable">
                    <input
                      value={lineItem.description}
                      onChange={(event) =>
                        setEditingLineItems((previous) =>
                          previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, description: event.target.value } : entry))
                        )
                      }
                      placeholder="Description"
                    />
                    {!lineItem.isPreset ? (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={lineItem.quantity}
                        onChange={(event) =>
                          setEditingLineItems((previous) =>
                            previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantity: event.target.value } : entry))
                          )
                        }
                      />
                    ) : (
                      <div />
                    )}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={lineItem.unitPriceAud}
                      onChange={(event) =>
                        setEditingLineItems((previous) =>
                          previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, unitPriceAud: event.target.value } : entry))
                        )
                      }
                    />
                    <select
                      value={lineItem.taxMode}
                      onChange={(event) =>
                        setEditingLineItems((previous) =>
                          previous.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, taxMode: event.target.value as InvoiceTaxMode } : entry
                          )
                        )
                      }
                    >
                      <option value="taxable">Taxable (GST)</option>
                      <option value="gst_free">GST-free</option>
                    </select>
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        setEditingLineItems((previous) => previous.filter((_, entryIndex) => entryIndex !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="dialog-actions dialog-actions-inline">
                <select
                  value={editingProductPresetId}
                  onChange={(event) => {
                    const val = event.target.value;
                    setEditingProductPresetId(val);
                    const preset = presets.find((entry) => entry.id === val);
                    if (preset) {
                      addInvoiceProductPresetToEditor(preset);
                      setEditingProductPresetId("");
                    }
                  }}
                  className="invoice-product-preset-select"
                >
                  <option value="">Add product preset...</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary" type="button" onClick={() => addEditableLineItem()}>
                  Add line item
                </button>
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

      {moveDialogPresence.isMounted ? (
        <div
          className="dialog-backdrop is-secondary"
          ref={moveDialogRootRef}
          data-motion-root="admin"
          data-motion-item="move-dialog-backdrop"
          onClick={() => void closeMoveDialog()}
        >
          <div
            className="dialog-panel dialog-panel-compact"
            data-motion-item="move-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-head">
              <h3 id="move-dialog-title">Move Booking</h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeMoveDialog()}>Cancel</button>
            </div>
            <p className="helper-text">Select a new date and time for this booking.</p>
            <div className="form-grid dialog-form-grid">
              <div className="field full">
                <label>New date and time</label>
                <input
                  type="datetime-local"
                  value={moveDialogStartAtLocal}
                  onChange={(e) => setMoveDialogStartAtLocal(e.target.value)}
                />
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => void closeMoveDialog()}>Cancel</button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busyAction === "move"}
                onClick={() => void moveSelected()}
              >
                {busyAction === "move" ? "Moving..." : "Confirm Move"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
