/**
 * Admin Bookings Console Client
 * 
 * "use client"
 * 
 * The central management hub for the school's lesson schedule. 
 * Provides a calendar interface (Day/Week/Month/Year) for review, approval, 
 * and manual booking creation.
 * 
 * CORE RESPONSIBILITIES:
 * 1. Schedule Visibility: Visual layout of all bookings and requests.
 * 2. Lifecyle Management: Approve, Reject, Reschedule (Move), or Cancel lessons.
 * 3. CRM Integration: Heuristic matching to link bookings to existing customers.
 * 4. Communication: Integrated email composer for sending direct updates to students.
 * 5. Materials: Attach PDFs/Audio to specific bookings for student portal access.
 * 
 * RATIONALE: High-fidelity scheduling is the "ground truth" for the business. 
 * The UI is designed to minimize administrative friction through automated 
 * matching and integrated communication tools.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, addYears, subYears } from "date-fns";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminBookingCalendar, type AdminCalendarEvent } from "@/components/admin-booking-calendar";
import { animateIn, animateOut, useTweenOrchestrator } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";

import { useBookings, type BookingEvent } from "@/lib/admin/use-bookings";
import { useCustomers } from "@/lib/admin/use-customers";
import { useEmailHistory } from "@/lib/admin/use-email-history";
import { useLearningMaterials } from "@/lib/admin/use-learning-materials";
import { usePresets } from "@/lib/admin/use-presets";
import { buildManualBookingPayload } from "@/lib/admin/manual-booking-payload";

import { BookingDetailDialog } from "./booking-detail-dialog";
import { ManualBookingDialog } from "./manual-booking-dialog";

import { type BookingDialogForm, type BookingMatchedCustomer, type BookingRowData } from "./types";

import { 
  type ManualStep, 
} from "@/lib/admin/types";

/** Available calendar layouts. */
type CalendarView = "day" | "week" | "month" | "year";

/** Extends the base booking event with raw row data for detailed editing. */
interface EventWithRow extends BookingEvent {
  row: BookingRowData;
}

/** Normalization for email matching. */
function normalizeEmailForMatch(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

/** Normalization for phone matching (strips non-digits, handles AU prefix). */
function normalizePhoneForMatch(value: string | null | undefined): string {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("61")) {
    return `0${digits.slice(2)}`;
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Heuristic Matching Logic
 * 
 * RATIONALE: We often get booking requests with slightly different names or 
 * contact details. Matching by normalized phone OR email allows the system to 
 * suggest linking records, preventing data silos and duplicate profiles.
 */
function findHeuristicCustomerMatch(customers: BookingMatchedCustomer[], email: string | null | undefined, phone: string | null | undefined) {
  const normalizedEmail = normalizeEmailForMatch(email);
  const normalizedPhone = normalizePhoneForMatch(phone);
  if (!normalizedEmail && !normalizedPhone) {
    return null;
  }

  return (
    customers.find((customer) => {
      const customerEmail = normalizeEmailForMatch(customer.email);
      const customerPhone = normalizePhoneForMatch(customer.phone);
      return (
        (normalizedEmail && customerEmail && normalizedEmail === customerEmail) ||
        (normalizedPhone && customerPhone && normalizedPhone === customerPhone)
      );
    }) || null
  );
}

/** Extracts first validation error message from API response details. */
function getFieldErrorMessage(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") return null;

  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages) && typeof messages[0] === "string") {
      return `${field}: ${messages[0]}`;
    }
  }
  return null;
}

/**
 * Primary stateful component for the Admin Bookings Console.
 */
export function AdminBookingsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { beginExitTransition } = useTweenOrchestrator();
  
  // PARAMS: Sync calendar view state with URL for shareable/bookmarkable states.
  const view = (searchParams.get("view") as CalendarView) || "week";
  const dateStr = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 10000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Dialog & Selection State
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"appointment" | "emails" | "materials">("appointment");
  const [dialogForm, setDialogForm] = useState<BookingDialogForm | null>(null);
  const [dialogMatchDismissed, setDialogMatchDismissed] = useState(false);

  // Manual Booking State
  const [manualStep, setManualStep] = useState<ManualStep>("customer");
  const [customerQuery, setCustomerQuery] = useState("");
  const [manualCustomerId, setManualCustomerId] = useState("");
  const [manualUpdateCustomerFromBooking, setManualUpdateCustomerFromBooking] = useState(true);
  const [manualIsRecurring, setManualIsRecurring] = useState(false);
  const [manualDurationChoice, setManualDurationChoice] = useState("min30");
  const [manualMatch, setManualMatch] = useState<BookingMatchedCustomer | null>(null);
  
  // Move State
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [moveNewStart, setMoveNewStart] = useState("");

  // Email Composer State
  const [emailComposerSubject, setEmailComposerSubject] = useState("");
  const [emailComposerMessage, setEmailComposerMessage] = useState("");

  const dialogPresence = usePresenceExit();
  const manualDialogPresence = usePresenceExit();

  const dialogRootRef = useRef<HTMLDivElement | null>(null);
  const manualDialogRootRef = useRef<HTMLDivElement | null>(null);

  const materialsUploadFormRef = useRef<HTMLFormElement | null>(null);
  const manualFormRef = useRef<HTMLFormElement | null>(null);

  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);

  // Data Fetching Hooks (Abstracted for reuse and clean component logic)
  const { 
    events: rawEvents, 
    load: loadBookings, 
    update: updateBookingApi,
    remove: removeBookingApi
  } = useBookings({ onError: setError, onAuthError });

  const events = useMemo(() => rawEvents as EventWithRow[], [rawEvents]);

  const { customers: customerOptions, load: loadCustomers } = useCustomers({ pageSize: 250, onAuthError, onError: setError });
  const { 
    history: emailHistory, 
    loading: loadingEmailHistory, 
    sending: sendingEmail, 
    syncing: syncingEmail,
    load: loadEmailHistory, 
    send: sendEmailApi,
    sync: syncEmailApi
  } = useEmailHistory({ onAuthError, onError: setError });
  const { materials: materialsList, loading: materialsLoading, uploading: materialsUploading, deletingId: materialsDeletingId, load: loadMaterials, upload: uploadMaterialApi, remove: removeMaterialApi } = useLearningMaterials({ onAuthError, onError: setError });
  const { presets } = usePresets({ onAuthError, onError: setError });

  const selectedEvent = useMemo(() => events.find((event) => event.id === selectedKey) || null, [events, selectedKey]);
  
  // LOGIC: Resolve customer relationships
  const linkedCustomer = useMemo(() => {
    const customerId = selectedEvent?.row?.customerId;
    if (!customerId) return null;
    return customerOptions.find((customer) => customer.id === customerId) || null;
  }, [selectedEvent, customerOptions]);

  const heuristicCustomer = useMemo(() => {
    if (!dialogForm || linkedCustomer) return linkedCustomer;
    return findHeuristicCustomerMatch(customerOptions, dialogForm.email, dialogForm.phone);
  }, [dialogForm, linkedCustomer, customerOptions]);

  const hasHeuristicMatch = Boolean(!linkedCustomer && heuristicCustomer);
  const matchedDialogCustomer = linkedCustomer || (!dialogMatchDismissed ? heuristicCustomer : null);

  // Sync data with view/date parameters
  useEffect(() => {
    void loadBookings(view, dateStr);
  }, [view, dateStr, loadBookings]);

  /** Navigation utility for changing calendar views. */
  const navigate = useCallback((newView: CalendarView, newDate: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", newView);
    params.set("date", newDate);
    router.push(`/admin/bookings?${params.toString()}`);
  }, [router, searchParams]);

  const goPrev = () => {
    const d = parseISO(dateStr);
    let next;
    if (view === "day") next = subDays(d, 1);
    else if (view === "week") next = subWeeks(d, 1);
    else if (view === "month") next = subMonths(d, 1);
    else next = subYears(d, 1);
    navigate(view, format(next, "yyyy-MM-dd"));
  };

  const goNext = () => {
    const d = parseISO(dateStr);
    let next;
    if (view === "day") next = addDays(d, 1);
    else if (view === "week") next = addWeeks(d, 1);
    else if (view === "month") next = addMonths(d, 1);
    else next = addYears(d, 1);
    navigate(view, format(next, "yyyy-MM-dd"));
  };

  /**
   * Opens the detailed booking event dialog.
   * RATIONALE: We pre-fill the form with deep row data and immediately trigger 
   * a check for existing customers and email history to give the admin full context.
   */
  const openDialog = useCallback((event: AdminCalendarEvent) => {
    setSelectedKey(event.id);
    const row = event.row as BookingRowData;
    setDialogForm({
      notes: typeof row.notes === "string" ? row.notes : "",
      startAtLocal: event.startAt.slice(0, 16),
      firstName: typeof row.firstName === "string" ? row.firstName : "",
      lastName: typeof row.lastName === "string" ? row.lastName : "",
      email: typeof row.email === "string" ? row.email : "",
      phone: typeof row.phone === "string" ? row.phone : "",
      unitNumber: typeof row.unitNumber === "string" ? row.unitNumber : "",
      houseNumber: typeof row.houseNumber === "string" ? row.houseNumber : "",
      streetName: typeof row.streetName === "string" ? row.streetName : "",
      streetType: typeof row.streetType === "string" ? row.streetType : "Street",
      suburb: typeof row.suburb === "string" ? row.suburb : "",
      state: typeof row.state === "string" ? row.state : "VIC",
      postcode: typeof row.postcode === "string" ? row.postcode : "",
      lessonMode: typeof row.lessonMode === "string" ? row.lessonMode : "in_person",
      skillLevel: typeof row.skillLevel === "string" ? row.skillLevel : "beginner",
      durationChoice: typeof row.lessonDuration === "string" ? row.lessonDuration : "min30",
      customDurationMinutes: row.customDurationMinutes == null ? "" : String(row.customDurationMinutes)
    });
    setActiveTab("appointment");
    setDialogMatchDismissed(false);
    setError("");
    setNotice("");

    void loadCustomers();

    if (typeof row.customerId === "string" && row.customerId) {
      void loadEmailHistory(row.customerId);
      void loadMaterials(row.customerId, event.id);
    }

    dialogPresence.show();
    if (dialogRootRef.current) animateIn(dialogRootRef.current);
  }, [dialogPresence, loadCustomers, loadEmailHistory, loadMaterials]);

  const closeDialog = useCallback(async () => {
    if (dialogRootRef.current) await animateOut(dialogRootRef.current);
    dialogPresence.hide();
    setSelectedKey(null);
    setDialogForm(null);
  }, [dialogPresence]);

  const openManualDialog = useCallback(async () => {
    setManualStep("customer");
    setCustomerQuery("");
    setManualCustomerId("");
    setManualIsRecurring(false);
    setManualDurationChoice("min30");
    setManualMatch(null);
    setError("");
    setNotice("");
    void loadCustomers();
    manualDialogPresence.show();
    if (manualDialogRootRef.current) animateIn(manualDialogRootRef.current);
  }, [manualDialogPresence, loadCustomers]);

  const closeManualDialog = useCallback(async () => {
    if (manualDialogRootRef.current) await animateOut(manualDialogRootRef.current);
    manualDialogPresence.hide();
  }, [manualDialogPresence]);


  const applyCustomerToManual = useCallback((customer: BookingMatchedCustomer) => {
    if (!manualFormRef.current) return;
    const formElements = manualFormRef.current.elements;
    const setFieldValue = (name: string, value: string) => {
      const field = formElements.namedItem(name);
      if (field && "value" in field) {
        (field as unknown as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = value;
      }
    };
    setFieldValue("firstName", customer.firstName || customer.fullName.split(" ")[0] || "");
    setFieldValue("lastName", customer.lastName || customer.fullName.split(" ").slice(1).join(" "));
    setFieldValue("email", customer.email || "");
    setFieldValue("phone", normalizePhoneForMatch(customer.phone || ""));
    setFieldValue("unitNumber", customer.unitNumber || "");
    setFieldValue("houseNumber", customer.houseNumber || "");
    setFieldValue("streetName", customer.streetName || "");
    setFieldValue("streetType", customer.streetType || "Street");
    setFieldValue("suburb", customer.suburb || "");
    setFieldValue("state", customer.state || "VIC");
    setFieldValue("postcode", customer.postcode || "");
    setFieldValue("skillLevel", customer.skillLevel || "beginner");
    setFieldValue("lessonMode", customer.lessonMode || "in_person");
  }, []);

  const clearManualCustomer = useCallback(() => {
    if (!manualFormRef.current) return;
    const formElements = manualFormRef.current.elements;
    const setFieldValue = (name: string, value: string) => {
      const field = formElements.namedItem(name);
      if (field && "value" in field) {
        (field as unknown as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = value;
      }
    };
    setFieldValue("firstName", "");
    setFieldValue("lastName", "");
    setFieldValue("email", "");
    setFieldValue("phone", "");
    setFieldValue("unitNumber", "");
    setFieldValue("houseNumber", "");
    setFieldValue("streetName", "");
    setFieldValue("streetType", "Street");
    setFieldValue("suburb", "");
    setFieldValue("state", "VIC");
    setFieldValue("postcode", "");
    setFieldValue("skillLevel", "beginner");
    setFieldValue("lessonMode", "in_person");
    setManualCustomerId("");
  }, []);

  const applyMatchedCustomerToDialog = useCallback((customer: BookingMatchedCustomer) => {
    if (!customer || !dialogForm) return;
    const fullNameParts = String(customer.fullName || "").trim().split(/\s+/).filter(Boolean);
    const firstNameFallback = fullNameParts[0] || "";
    const lastNameFallback = fullNameParts.slice(1).join(" ");

    const patch: Record<string, string> = {
      firstName: dialogForm.firstName?.trim() ? dialogForm.firstName : (customer.firstName || firstNameFallback),
      lastName: dialogForm.lastName?.trim() ? dialogForm.lastName : (customer.lastName || lastNameFallback),
      email: dialogForm.email?.trim() ? dialogForm.email : (customer.email || ""),
      phone: dialogForm.phone?.trim() ? dialogForm.phone : (customer.phone || ""),
      unitNumber: dialogForm.unitNumber?.trim() ? dialogForm.unitNumber : (customer.unitNumber || ""),
      houseNumber: dialogForm.houseNumber?.trim() ? dialogForm.houseNumber : (customer.houseNumber || ""),
      streetName: dialogForm.streetName?.trim() ? dialogForm.streetName : (customer.streetName || ""),
      streetType: dialogForm.streetType?.trim() ? dialogForm.streetType : (customer.streetType || "Street"),
      suburb: dialogForm.suburb?.trim() ? dialogForm.suburb : (customer.suburb || ""),
      state: dialogForm.state?.trim() ? dialogForm.state : (customer.state || "VIC"),
      postcode: dialogForm.postcode?.trim() ? dialogForm.postcode : (customer.postcode || "")
    };

    setDialogForm({
      ...dialogForm,
      ...patch
    });
    setDialogMatchDismissed(false);
    setNotice("Filled missing booking details from matched customer.");
  }, [dialogForm]);

  const openMatchedCustomer = useCallback(async () => {
    if (!matchedDialogCustomer?.id) return;
    await closeDialog();
    void beginExitTransition(null, 0, () => router.push(`/admin/customers?customerId=${matchedDialogCustomer.id}&open=true`));
  }, [closeDialog, matchedDialogCustomer, router, beginExitTransition]);

  // ACTION LOGIC: Wrappers around API hooks with state management and user feedback
  
  async function saveBooking() {
    const event = events.find(e => e.id === selectedKey);
    if (!selectedKey || !dialogForm || !event) return;
    setBusyAction("save");
    const success = await updateBookingApi(selectedKey, event.entityType, "edit", dialogForm);
    setBusyAction(null);
    if (success) {
      setNotice("Booking updated.");
      void loadBookings(view, dateStr);
    }
  }

  async function deleteBooking() {
    const event = events.find(e => e.id === selectedKey);
    if (!selectedKey || !event || !window.confirm("Are you sure you want to cancel this booking?")) return;
    setBusyAction("delete");
    const success = await removeBookingApi(selectedKey, event.entityType);
    setBusyAction(null);
    if (success) {
      setNotice("Booking cancelled.");
      void closeDialog();
      void loadBookings(view, dateStr);
    }
  }

  async function moveBooking() {
    const event = events.find(e => e.id === selectedKey);
    if (!selectedKey || !event || !moveNewStart) return;
    setBusyAction("move");
    const success = await updateBookingApi(selectedKey, event.entityType, "move", { newStartAt: moveNewStart });
    setBusyAction(null);
    if (success) {
      setNotice("Booking moved.");
      setIsMoveOpen(false);
      void loadBookings(view, dateStr);
    }
  }

  async function sendCustomEmail(subject: string, message: string, captcha?: { captchaToken: string; captchaAnswer: string }) {
    const event = events.find(e => e.id === selectedKey);
    const customerId = event?.row.customerId;
    if (!customerId || !subject || !message) return { success: false };
    
    setError("");
    const result = await sendEmailApi(customerId, subject, message, captcha);
    if (result.success) {
      setNotice("Email sent.");
      setEmailComposerSubject("");
      setEmailComposerMessage("");
    }
    return result;
  }

  async function uploadMaterial(captcha?: { captchaToken: string; captchaAnswer: string }) {
    const event = events.find(e => e.id === selectedKey);
    if (!event?.row.customerId || !event.id || !materialsUploadFormRef.current) return;
    const success = await uploadMaterialApi(event.row.customerId, event.id, materialsUploadFormRef.current, captcha);
    if (success) {
      setNotice("Material uploaded.");
    }
  }

  /** logic for resolving manual booking with potential duplicates. */
  async function addManualBooking(resolution?: "use_existing" | "update_existing" | "create_new") {
    if (!manualFormRef.current) return;
    setBusyAction("create");
    setError("");

    const formData = new FormData(manualFormRef.current);
    const payloadResult = buildManualBookingPayload(formData, {
      manualCustomerId,
      matchResolution: resolution,
      updateCustomerFromBooking: manualUpdateCustomerFromBooking
    });
    if (!payloadResult.ok) {
      setError(payloadResult.error);
      setBusyAction(null);
      return;
    }

    try {
      const response = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadResult.payload)
      });

      if (response.status === 401) {
        window.location.assign("/admin/login");
        setBusyAction(null);
        return;
      }

      if (response.status === 409) {
        const data = await response.json();
        setManualMatch(data.customer || null);
        setManualStep("schedule");
        setBusyAction(null);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const fieldError = getFieldErrorMessage(data);
        setError(fieldError ?? (typeof data?.error === "string" ? data.error : "Unable to create booking."));
        setBusyAction(null);
        return;
      }

      setNotice("Booking created.");
      void closeManualDialog();
      void loadBookings(view, dateStr);
    } catch {
      setError("Network error.");
    } finally {
      setBusyAction(null);
    }
  }

  async function performAction(action: string) {
    const event = events.find(e => e.id === selectedKey);
    if (!event) return;
    
    setBusyAction(action);
    const success = await updateBookingApi(selectedKey!, event.entityType, action, {});
    setBusyAction(null);
    
    if (success) {
      setNotice(`Booking ${action}ed.`);
      if (action === "approve" || action === "reject") {
        void closeDialog();
      }
      void loadBookings(view, dateStr);
    }
  }

  const rangeLabel = useMemo(() => {
    const d = parseISO(dateStr);
    if (view === "day") return format(d, "EEEE, d MMMM yyyy");
    if (view === "week") return `Week of ${format(startOfWeek(d, { weekStartsOn: 1 }), "d MMMM yyyy")}`;
    if (view === "month") return format(d, "MMMM yyyy");
    return format(d, "yyyy");
  }, [view, dateStr]);

  function startOfWeek(date: Date, options: { weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 }) {
    const day = date.getDay();
    const diff = (day < options.weekStartsOn ? 7 : 0) + day - options.weekStartsOn;
    const result = new Date(date);
    result.setDate(date.getDate() - diff);
    return result;
  }

  return (
    <AdminShell 
      title="Bookings"
      error={error}
      notice={notice}
      className="admin-shell-bookings"
    >
      <div className="admin-layout-content">
        <AdminCard className="admin-toolbar-card admin-range-card booking-row admin-range-row">
          <div className="admin-range-primary">
            <div className="button-row admin-range-nav-buttons">
              <Tooltip content="Go to the previous date range.">
                <button className="btn btn-secondary btn-icon" type="button" onClick={goPrev} aria-label="Previous range">←</button>
              </Tooltip>
              <Tooltip content="Go to the next date range.">
                <button className="btn btn-secondary btn-icon" type="button" onClick={goNext} aria-label="Next range">→</button>
              </Tooltip>
            </div>
            <div className="admin-range-copy">
              <span className="admin-inline-field">Schedule Window</span>
              <strong className="admin-range-label">{rangeLabel}</strong>
            </div>
          </div>

          <div className="admin-range-actions">
            <div className="site-nav admin-range-view-nav">
              <Tooltip content="Switch to a single-day booking timeline.">
                <button className={`btn ${view === "day" ? "btn-primary" : "btn-secondary"}`} type="button" onClick={() => navigate("day", dateStr)}>Day</button>
              </Tooltip>
              <Tooltip content="Switch to week view for lesson planning.">
                <button className={`btn ${view === "week" ? "btn-primary" : "btn-secondary"}`} type="button" onClick={() => navigate("week", dateStr)}>Week</button>
              </Tooltip>
              <Tooltip content="Switch to month view for broader scheduling.">
                <button className={`btn ${view === "month" ? "btn-primary" : "btn-secondary"}`} type="button" onClick={() => navigate("month", dateStr)}>Month</button>
              </Tooltip>
              <Tooltip content="Switch to year view for long-range planning.">
                <button className={`btn ${view === "year" ? "btn-primary" : "btn-secondary"}`} type="button" onClick={() => navigate("year", dateStr)}>Year</button>
              </Tooltip>
            </div>
            <div className="admin-range-divider" />
            <Tooltip content="Create a new booking directly from the admin calendar.">
              <button className="btn btn-primary" type="button" onClick={openManualDialog}>New Booking</button>
            </Tooltip>
          </div>
        </AdminCard>

        <AdminCard noPadding className="admin-bookings-calendar-card">
          <AdminBookingCalendar
            view={view}
            date={dateStr}
            events={events}
            selectedEventId={selectedKey}
            onSelect={openDialog}
          />
        </AdminCard>
      </div>

      {dialogPresence.isMounted && (
        <BookingDetailDialog
          isOpen={true}
          onClose={closeDialog}
          rootRef={dialogRootRef}
          event={selectedEvent}
          dialogForm={dialogForm}
          setDialogForm={setDialogForm}
          busyAction={busyAction}
          onSave={saveBooking}
          onDelete={deleteBooking}
          onMove={() => {
            const event = events.find(e => e.id === selectedKey);
            if (event) {
              setMoveNewStart(event.startAt.slice(0, 16));
              setIsMoveOpen(true);
            }
          }}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          matchedCustomer={matchedDialogCustomer}
          hasHeuristicMatch={hasHeuristicMatch && !dialogMatchDismissed}
          onApplyMatchedCustomer={() => matchedDialogCustomer && applyMatchedCustomerToDialog(matchedDialogCustomer)}
          onOpenMatchedCustomer={() => void openMatchedCustomer()}
          onOpenInvoice={async () => {
            const event = selectedEvent;
            if (!event || event.entityType !== "booking") return;
            const lessonPreset = presets.find((p) => `${p.label} ${p.description}`.toLowerCase().includes("lesson")) || presets[0] || null;
            setBusyAction("invoice");
            try {
              const res = await fetch(`/api/admin/bookings/${event.id}/invoice`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  lineItems: [{
                    description: lessonPreset?.description || lessonPreset?.label || "Standard Lesson Fee",
                    quantity: 1,
                    unitPriceCents: lessonPreset?.unitPriceCents ?? 6000,
                    kind: "lesson_fee"
                  }]
                })
              });
              if (!res.ok) {
                const p = await res.json().catch(() => null);
                setError(p?.error || "Unable to create invoice draft.");
                return;
              }
              const p = await res.json();
              setNotice("Draft invoice created.");
              await closeDialog();
              void beginExitTransition(null, 0, () => router.push(`/admin/invoices?openInvoiceId=${encodeURIComponent(p?.invoice?.id)}`));
            } catch {
              setError("Network error creating invoice draft.");
            } finally {
              setBusyAction(null);
            }
          }}
          onDismissMatchedCustomer={() => setDialogMatchDismissed(true)}
          emailHistory={emailHistory}
          loadingEmailHistory={loadingEmailHistory}
          sendingEmail={sendingEmail}
          syncingEmail={syncingEmail}
          emailSubject={emailComposerSubject}
          setEmailSubject={setEmailComposerSubject}
          emailMessage={emailComposerMessage}
          setEmailMessage={setEmailComposerMessage}
          onSendEmail={sendCustomEmail}
          onSyncEmail={() => {
            const event = events.find(e => e.id === selectedKey);
            if (event?.row.customerId) {
              void syncEmailApi(event.row.customerId);
            }
          }}
          onPerformAction={performAction}
          materialsDialogProps={{
            materialsList,
            materialsLoading,
            materialsUploading,
            materialsDeletingId,
            onUpload: uploadMaterial,
            onDelete: removeMaterialApi,
            uploadFormRef: materialsUploadFormRef
          }}
        />
      )}

      {isMoveOpen && (
        <AdminDialog
          isOpen={true}
          onClose={() => setIsMoveOpen(false)}
          title="Move Lesson Time"
          wide
          footer={
            <div className="dialog-footer-row dialog-footer-row-end">
              <button className="btn btn-secondary" onClick={() => setIsMoveOpen(false)}>CANCEL</button>
              <button className="btn btn-primary" disabled={!!busyAction} onClick={moveBooking}>
                {busyAction === "move" ? "MOVING..." : "CONFIRM MOVE"}
              </button>
            </div>
          }
        >
          <AdminForm>
            <AdminField label="New Start Time" tooltip="Select the new date and time for this booking." required>
              <input type="datetime-local" value={moveNewStart} onChange={e => setMoveNewStart(e.target.value)} />
            </AdminField>
          </AdminForm>
        </AdminDialog>
      )}

      {manualDialogPresence.isMounted && (
        <ManualBookingDialog
          isOpen={true}
          onClose={closeManualDialog}
          rootRef={manualDialogRootRef}
          formRef={manualFormRef}
          step={manualStep}
          setStep={setManualStep}
          customerQuery={customerQuery}
          setCustomerQuery={setCustomerQuery}
          customerOptions={customerOptions}
          manualCustomerId={manualCustomerId}
          setManualCustomerId={setManualCustomerId}
          onApplyCustomer={applyCustomerToManual}
          onClearCustomer={clearManualCustomer}
          updateCustomerFromBooking={manualUpdateCustomerFromBooking}
          setUpdateCustomerFromBooking={setManualUpdateCustomerFromBooking}
          isRecurring={manualIsRecurring}
          setIsRecurring={setManualIsRecurring}
          durationChoice={manualDurationChoice}
          setDurationChoice={setManualDurationChoice}
          manualMatch={manualMatch}
          onResolveMatch={(resolution) => void addManualBooking(resolution)}
          onSave={() => void addManualBooking()}
          busyAction={busyAction}
        />
      )}
    </AdminShell>
  );
}
