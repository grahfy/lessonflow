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
import { AlertCircle, CalendarRange, Clock3, UserRound } from "lucide-react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminBookingCalendar, type AdminCalendarEvent } from "@/components/admin-booking-calendar";
import { animateIn, animateOut, useTweenOrchestrator } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { formatDateTime } from "@/lib/admin/formatters";

import { useBookings, type BookingEvent } from "@/lib/admin/use-bookings";
import { useCustomers } from "@/lib/admin/use-customers";
import { useEmailHistory, type EmailHistoryTarget } from "@/lib/admin/use-email-history";
import { useBookingLessonPlan } from "@/lib/admin/use-booking-lesson-plan";
import { useLessonPricing } from "@/lib/admin/use-lesson-pricing";
import { useLearningMaterials } from "@/lib/admin/use-learning-materials";
import { useLessonPlanTemplates } from "@/lib/admin/use-lesson-plan-templates";
import { useAdminSession } from "@/lib/admin/use-admin-session";
import { usePresets } from "@/lib/admin/use-presets";
import { useTeachers } from "@/lib/admin/use-teachers";
import { buildManualBookingPayload } from "@/lib/admin/manual-booking-payload";
import {
  buildDefaultLessonPlanSections,
  type LessonPlanSection,
  type LessonPlanSectionsInput,
} from "@/lib/lesson-plan-contract";
import { durationMinutesToBookingPayload, durationMinutesToChoiceValue, getPersistedDurationMinutes } from "@/lib/lesson-duration-utils";
import { formatCurrency } from "@/lib/invoices/currency";
import { type BookingInvoiceCandidateSummary, type BookingInvoiceResolveResponse } from "@/lib/invoices/schema";
import { toDateKey, toDateTimeLocalValue } from "@/lib/time";
import { plainTextToTiptapJson } from "@/lib/tiptap-utils";
import type { JSONContent } from "@tiptap/react";

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

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
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

function getEmailHistoryTargetForEvent(event: EventWithRow | null): EmailHistoryTarget | null {
  if (!event) {
    return null;
  }

  if (typeof event.row.customerId === "string" && event.row.customerId) {
    return { customerId: event.row.customerId };
  }

  return event.entityType === "booking_request"
    ? { bookingRequestId: event.id }
    : { bookingId: event.id };
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
  const dateStr = searchParams.get("date") || toDateKey(new Date());
  const deepLinkedBookingId = searchParams.get("bookingId") || "";
  const shouldOpenDeepLinkedBooking = searchParams.get("open") === "true";

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasLoadedInitialBookings, setHasLoadedInitialBookings] = useState(false);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 10000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [teacherFilter, setTeacherFilter] = useState("all");

  // Dialog & Selection State
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"appointment" | "emails" | "materials" | "lesson-plan">("appointment");
  const [dialogForm, setDialogForm] = useState<BookingDialogForm | null>(null);
  const [dialogMatchDismissed, setDialogMatchDismissed] = useState(false);
  const [invoiceCandidates, setInvoiceCandidates] = useState<BookingInvoiceCandidateSummary[]>([]);
  const [lessonPlanDraft, setLessonPlanDraft] = useState<LessonPlanSectionsInput | null>(null);
  const [lessonPlanTemplateSelection, setLessonPlanTemplateSelection] = useState("");

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

  const {
    isMounted: isDialogMounted,
    show: showDialog,
    hide: hideDialog
  } = usePresenceExit();
  const {
    isMounted: isManualDialogMounted,
    show: showManualDialog,
    hide: hideManualDialog
  } = usePresenceExit();

  const dialogRootRef = useRef<HTMLDivElement | null>(null);
  const manualDialogRootRef = useRef<HTMLDivElement | null>(null);
  const handledDeepLinkedBookingIdRef = useRef<string | null>(null);

  const materialsUploadFormRef = useRef<HTMLFormElement | null>(null);
  const manualFormRef = useRef<HTMLFormElement | null>(null);

  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);
  const { admin: currentAdmin } = useAdminSession({ onAuthError, onError: setError });

  // Data Fetching Hooks (Abstracted for reuse and clean component logic)
  const { 
    events: rawEvents, 
    loading: loadingBookings,
    load: loadBookings, 
    update: updateBookingApi,
    remove: removeBookingApi
  } = useBookings({ onError: setError, onAuthError });

  const events = useMemo(() => rawEvents as EventWithRow[], [rawEvents]);

  const { customers: customerOptions, load: loadCustomers } = useCustomers({ pageSize: 250, onAuthError, onError: setError });
  const { lessonPricingOptions, load: loadLessonPricing } = useLessonPricing({ onAuthError, onError: setError });
  const { teachers: teacherOptions } = useTeachers({ onAuthError, onError: setError });
  const singleTeacherOptionId = teacherOptions.length === 1 ? teacherOptions[0]?.id ?? "" : "";
  const { 
    history: emailHistory, 
    syncWarning: emailHistoryWarning,
    loading: loadingEmailHistory, 
    sending: sendingEmail, 
    syncing: syncingEmail,
    load: loadEmailHistory, 
    send: sendEmailApi,
    sync: syncEmailApi
  } = useEmailHistory({ onAuthError, onError: setError });
  const { materials: materialsList, loading: materialsLoading, uploading: materialsUploading, deletingId: materialsDeletingId, load: loadMaterials, upload: uploadMaterialApi, remove: removeMaterialApi } = useLearningMaterials({ onAuthError, onError: setError });
  const { templates: lessonPlanTemplates, loading: lessonPlanTemplatesLoading, load: loadLessonPlanTemplates } = useLessonPlanTemplates({ onAuthError, onError: setError });
  const {
    lessonPlan,
    loading: lessonPlanLoading,
    saving: lessonPlanSaving,
    load: loadBookingLessonPlan,
    save: saveBookingLessonPlan,
    clear: clearBookingLessonPlan,
    reset: resetBookingLessonPlan
  } = useBookingLessonPlan({ onAuthError, onError: setError });
  const { presets } = usePresets({ onAuthError, onError: setError });
  const activeLessonPricingOptions = useMemo(
    () => lessonPricingOptions.filter((option) => option.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.durationMinutes - b.durationMinutes),
    [lessonPricingOptions]
  );
  const configuredDurationChoices = useMemo(
    () =>
      activeLessonPricingOptions.map((option) => ({
        value: durationMinutesToChoiceValue(option.durationMinutes),
        label: `${option.durationMinutes} minutes`
      })),
    [activeLessonPricingOptions]
  );
  const configuredDurationValues = useMemo(
    () => new Set(activeLessonPricingOptions.map((option) => option.durationMinutes)),
    [activeLessonPricingOptions]
  );

  const selectedEvent = useMemo(() => events.find((event) => event.id === selectedKey) || null, [events, selectedKey]);
  const filteredEvents = useMemo(() => {
    if (teacherFilter === "all") return events;
    if (teacherFilter === "unassigned") {
      return events.filter((event) => !event.row.assignedTeacherId);
    }
    return events.filter((event) => event.row.assignedTeacherId === teacherFilter);
  }, [events, teacherFilter]);
  const teacherFilterLabel = useMemo(() => {
    if (teacherFilter === "all") {
      return "All teachers";
    }
    if (teacherFilter === "unassigned") {
      return "Unassigned only";
    }
    return teacherOptions.find((teacher) => teacher.id === teacherFilter)?.displayName || "Teacher filter";
  }, [teacherFilter, teacherOptions]);
  const viewLabel = useMemo(() => {
    if (view === "day") return "Day view";
    if (view === "week") return "Week view";
    if (view === "month") return "Month view";
    return "Year view";
  }, [view]);
  const bookingWorkspaceStats = useMemo(() => {
    const pending = filteredEvents.filter((event) => event.status === "pending").length;
    const confirmed = filteredEvents.filter((event) => event.status === "approved").length;
    const unassigned = filteredEvents.filter((event) => !event.row.assignedTeacherId).length;
    return {
      total: filteredEvents.length,
      pending,
      confirmed,
      unassigned
    };
  }, [filteredEvents]);
  const workspaceSummary = useMemo(() => {
    if (loadingBookings || !hasLoadedInitialBookings) {
      return `Loading bookings for this ${view} window...`;
    }
    if (bookingWorkspaceStats.total === 0) {
      return `No bookings or requests are visible in this ${view} window for ${teacherFilterLabel.toLowerCase()}.`;
    }

    const summaryParts = [`${countLabel(bookingWorkspaceStats.total, "visible item")}`];

    if (bookingWorkspaceStats.pending > 0) {
      summaryParts.push(`${countLabel(bookingWorkspaceStats.pending, "pending request", "pending requests")}`);
    }

    if (bookingWorkspaceStats.unassigned > 0) {
      summaryParts.push(`${countLabel(bookingWorkspaceStats.unassigned, "unassigned lesson", "unassigned lessons")}`);
    }

    return `${summaryParts.join(" · ")} across ${teacherFilterLabel.toLowerCase()}.`;
  }, [bookingWorkspaceStats, hasLoadedInitialBookings, loadingBookings, teacherFilterLabel, view]);
  const canManageSelectedEvent = useMemo(() => {
    if (!currentAdmin || !selectedEvent) return false;
    return currentAdmin.role === "owner" || selectedEvent.row.assignedTeacherId === currentAdmin.id;
  }, [currentAdmin, selectedEvent]);
  const canApproveSelectedRequest = Boolean(currentAdmin?.role === "owner" && selectedEvent?.entityType === "booking_request");
  
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
    let cancelled = false;

    void loadBookings(view, dateStr).finally(() => {
      if (!cancelled) {
        setHasLoadedInitialBookings(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [view, dateStr, loadBookings]);

  useEffect(() => {
    void loadLessonPricing();
  }, [loadLessonPricing]);

  useEffect(() => {
    if (isManualDialogMounted && !manualDurationChoice && configuredDurationChoices[0]) {
      setManualDurationChoice(configuredDurationChoices[0].value);
    }
  }, [configuredDurationChoices, isManualDialogMounted, manualDurationChoice]);

  /** Navigation utility for changing calendar views. */
  const navigate = useCallback((newView: CalendarView, newDate: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", newView);
    params.set("date", newDate);
    params.delete("bookingId");
    params.delete("open");
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
    // Resolve rich notes: prefer notesContent (TipTap JSON), fall back to
    // converting plain-text notes for existing bookings that predate the editor.
    const resolvedNotesContent: JSONContent | null =
      row.notesContent && typeof row.notesContent === "object"
        ? (row.notesContent as JSONContent)
        : typeof row.notes === "string" && row.notes.trim()
          ? plainTextToTiptapJson(row.notes)
          : null;

    setDialogForm({
      notes: typeof row.notes === "string" ? row.notes : "",
      notesContent: resolvedNotesContent,
      startAtLocal: toDateTimeLocalValue(event.startAt),
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
      assignedTeacherId:
        typeof row.assignedTeacherId === "string" && row.assignedTeacherId
          ? row.assignedTeacherId
          : singleTeacherOptionId,
      durationChoice: durationMinutesToChoiceValue(
        typeof row.lessonDuration === "string" && (row.lessonDuration === "min30" || row.lessonDuration === "min60")
          ? getPersistedDurationMinutes({
              lessonDuration: row.lessonDuration,
              customDurationMinutes:
                typeof row.customDurationMinutes === "number"
                  ? row.customDurationMinutes
                  : typeof row.customDurationMinutes === "string" && row.customDurationMinutes.trim()
                    ? Number(row.customDurationMinutes)
                    : null
            })
          : 30
      ),
      customDurationMinutes: row.customDurationMinutes == null ? "" : String(row.customDurationMinutes)
    });
    setActiveTab("appointment");
    setDialogMatchDismissed(false);
    setLessonPlanDraft(null);
    setLessonPlanTemplateSelection("");
    setError("");
    setNotice("");
    resetBookingLessonPlan();

    void loadCustomers();

    const emailTarget = getEmailHistoryTargetForEvent(event as EventWithRow);
    if (emailTarget) {
      void loadEmailHistory(emailTarget);
      if (currentAdmin?.role === "owner" || row.assignedTeacherId === currentAdmin?.id) {
        if (typeof row.customerId === "string" && row.customerId) {
          void loadMaterials(row.customerId, event.id);
        }
      }
    }

    if (event.entityType === "booking") {
      void loadLessonPlanTemplates();
      void loadBookingLessonPlan(event.id);
    }

    showDialog();
    if (dialogRootRef.current) animateIn(dialogRootRef.current);
  }, [currentAdmin, loadBookingLessonPlan, loadCustomers, loadEmailHistory, loadLessonPlanTemplates, loadMaterials, resetBookingLessonPlan, showDialog, singleTeacherOptionId]);

  useEffect(() => {
    if (!deepLinkedBookingId || !shouldOpenDeepLinkedBooking) {
      handledDeepLinkedBookingIdRef.current = null;
      return;
    }

    if (handledDeepLinkedBookingIdRef.current === deepLinkedBookingId) {
      return;
    }

    const matchedEvent = events.find((event) => event.id === deepLinkedBookingId && event.entityType === "booking");
    if (matchedEvent) {
      handledDeepLinkedBookingIdRef.current = deepLinkedBookingId;
      openDialog(matchedEvent);
      return;
    }

    if (loadingBookings) {
      return;
    }

    handledDeepLinkedBookingIdRef.current = deepLinkedBookingId;
    setNotice("The requested booking was not found in the selected day view.");
  }, [deepLinkedBookingId, events, loadingBookings, openDialog, shouldOpenDeepLinkedBooking]);

  const closeDialog = useCallback(() => {
    const root = dialogRootRef.current;
    hideDialog(() => {
      setSelectedKey(null);
      setDialogForm(null);
      setInvoiceCandidates([]);
      setLessonPlanDraft(null);
      setLessonPlanTemplateSelection("");
      resetBookingLessonPlan();
    });
    void animateOut(root).catch(() => undefined);
  }, [hideDialog, resetBookingLessonPlan]);

  useEffect(() => {
    if (!lessonPlan) {
      return;
    }

    setLessonPlanTemplateSelection(lessonPlan.sourceTemplateId || "");
    setLessonPlanDraft({
      sections: lessonPlan.sections,
      status: lessonPlan.status,
      sourceTemplateId: lessonPlan.sourceTemplateId,
      seriesId: lessonPlan.seriesId,
      seriesSequence: lessonPlan.seriesSequence
    });
  }, [lessonPlan]);

  const openInvoiceById = useCallback(async (invoiceId: string, noticeMessage: string) => {
    setNotice(noticeMessage);
    setInvoiceCandidates([]);
    await closeDialog();
    void beginExitTransition(null, 0, () => router.push(`/admin/invoices?openInvoiceId=${encodeURIComponent(invoiceId)}`));
  }, [beginExitTransition, closeDialog, router]);

  const createBookingInvoiceDraft = useCallback(async (bookingId: string) => {
    const lessonPreset = presets.find((preset) => `${preset.label} ${preset.description}`.toLowerCase().includes("lesson")) || presets[0] || null;
    const res = await fetch(`/api/admin/bookings/${bookingId}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineItems: [{
          description: lessonPreset?.description || lessonPreset?.label || "Standard Lesson Fee",
          quantity: 1,
          unitPriceCents: lessonPreset?.unitPriceCents ?? 6000,
          kind: "lesson_fee",
          discountKind: lessonPreset?.discountKind ?? null,
          discountValue: lessonPreset?.discountValue ?? null
        }]
      })
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error || "Unable to create invoice draft.");
    }

    const payload = await res.json() as { invoice?: { id?: string } };
    if (!payload.invoice?.id) {
      throw new Error("Invoice draft was created but no invoice id was returned.");
    }

    await openInvoiceById(payload.invoice.id, "Draft invoice created.");
  }, [openInvoiceById, presets]);

  const openManualDialog = useCallback(async () => {
    setManualStep("customer");
    setCustomerQuery("");
    setManualCustomerId("");
    setManualIsRecurring(false);
    setManualDurationChoice(configuredDurationChoices[0]?.value ?? "");
    setManualMatch(null);
    setError("");
    setNotice("");
    void loadCustomers();
    void loadLessonPricing();
    showManualDialog();
    if (manualDialogRootRef.current) animateIn(manualDialogRootRef.current);
  }, [configuredDurationChoices, loadCustomers, loadLessonPricing, showManualDialog]);

  const closeManualDialog = useCallback(() => {
    const root = manualDialogRootRef.current;
    hideManualDialog();
    void animateOut(root).catch(() => undefined);
  }, [hideManualDialog]);


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
    const nextDurationMinutes = Number.parseInt(dialogForm.durationChoice, 10);
    if (!Number.isInteger(nextDurationMinutes)) {
      setError("Select a configured lesson duration before saving.");
      return;
    }
    if (!configuredDurationValues.has(nextDurationMinutes)) {
      setError("This booking uses a duration that is not configured in Lesson Info / Prices. Add that duration in settings or choose a configured duration before saving.");
      return;
    }

    const normalizedDuration = durationMinutesToBookingPayload(nextDurationMinutes);
    setBusyAction("save");
    const result = await updateBookingApi(selectedKey, event.entityType, "edit", {
      ...dialogForm,
      lessonDuration: normalizedDuration.lessonDuration,
      customDurationMinutes: normalizedDuration.customDurationMinutes
    });
    setBusyAction(null);
    if (result.ok) {
      setNotice(result.notice || "Booking updated.");
      void loadBookings(view, dateStr);
    }
  }

  async function deleteBooking() {
    const event = events.find(e => e.id === selectedKey);
    if (!selectedKey || !event || !window.confirm("Are you sure you want to cancel this booking?")) return;
    setBusyAction("delete");
    const result = await removeBookingApi(selectedKey, event.entityType);
    setBusyAction(null);
    if (result.ok) {
      setNotice(result.notice || "Booking cancelled.");
      void closeDialog();
      void loadBookings(view, dateStr);
    }
  }

  async function moveBooking() {
    const event = events.find(e => e.id === selectedKey);
    if (!selectedKey || !event || !moveNewStart) return;
    setBusyAction("move");
    const result = await updateBookingApi(selectedKey, event.entityType, "move", { newStartAt: moveNewStart });
    setBusyAction(null);
    if (result.ok) {
      setNotice(result.notice || "Booking moved.");
      setIsMoveOpen(false);
      void loadBookings(view, dateStr);
    }
  }

  async function sendCustomEmail(subject: string, message: string, captcha?: { captchaToken: string; captchaAnswer: string }) {
    const event = events.find(e => e.id === selectedKey);
    const emailTarget = getEmailHistoryTargetForEvent((event as EventWithRow | undefined) || null);
    if (!emailTarget || !subject || !message) return { success: false };
    
    setError("");
    const result = await sendEmailApi(emailTarget, subject, message, captcha);
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

  function createScratchLessonPlanDraft() {
    setLessonPlanDraft({
      sections: buildDefaultLessonPlanSections(),
      status: "in_progress",
      sourceTemplateId: null,
      seriesId: null,
      seriesSequence: null
    });
  }

  function applySelectedLessonPlanTemplate() {
    if (!lessonPlanTemplateSelection) {
      setError("Choose a lesson-plan template first.");
      return;
    }

    const template = lessonPlanTemplates.find((row) => row.id === lessonPlanTemplateSelection);
    if (!template) {
      setError("Selected lesson-plan template could not be loaded.");
      return;
    }

    if (lessonPlanDraft) {
      const shouldReplace = window.confirm(`Replace the current booking lesson plan with "${template.title}"? Unsaved changes in this draft will be overwritten.`);
      if (!shouldReplace) {
        return;
      }
    }

    setLessonPlanDraft({
      sections: template.sections.length > 0
        ? template.sections.map((s) => ({ ...s, content: { ...s.content, content: [...(s.content.content ?? [])] } }))
        : buildDefaultLessonPlanSections(),
      status: "in_progress",
      sourceTemplateId: template.id,
      seriesId: null,
      seriesSequence: null
    });
    setNotice(lessonPlan ? `Template "${template.title}" copied into this booking draft. Save to keep it.` : `Template "${template.title}" copied into this booking.`);
  }

  async function clearLessonPlanDraft() {
    if (!lessonPlanDraft) {
      return;
    }

    const shouldClear = window.confirm(
      lessonPlan
        ? "Clear this booking lesson plan? This will remove the saved lesson plan for this booking."
        : "Clear this unsaved booking lesson-plan draft?"
    );
    if (!shouldClear) {
      return;
    }

    if (lessonPlan && selectedEvent?.entityType === "booking") {
      const cleared = await clearBookingLessonPlan(selectedEvent.id);
      if (!cleared) {
        return;
      }
      setNotice("Lesson plan cleared.");
    } else {
      setNotice("Lesson-plan draft cleared.");
    }

    setLessonPlanDraft(null);
    setLessonPlanTemplateSelection("");
  }

  async function saveLessonPlan() {
    if (!selectedEvent || selectedEvent.entityType !== "booking") return;
    if (!lessonPlanDraft) {
      setError("Create a lesson plan draft before saving.");
      return;
    }

    const saved = await saveBookingLessonPlan(selectedEvent.id, lessonPlanDraft);
    if (!saved) {
      return;
    }

    setLessonPlanDraft({
      sections: saved.sections,
      status: saved.status,
      sourceTemplateId: saved.sourceTemplateId,
      seriesId: saved.seriesId,
      seriesSequence: saved.seriesSequence
    });
    setNotice(lessonPlan ? "Lesson plan saved." : "Lesson plan created.");
  }

  function updateLessonPlanDraftSections(sections: LessonPlanSection[]) {
    setLessonPlanDraft((prev) => prev ? { ...prev, sections } : prev);
  }

  function updateLessonPlanDraftStatus(status: LessonPlanSectionsInput["status"]) {
    setLessonPlanDraft((prev) => prev ? { ...prev, status } : prev);
  }

  /** logic for resolving manual booking with potential duplicates. */
  async function addManualBooking(resolution?: "use_existing" | "update_existing" | "create_new") {
    if (!manualFormRef.current) return;
    if (activeLessonPricingOptions.length === 0) {
      setError("Add at least one active lesson duration in Lesson Info / Prices before creating manual bookings.");
      return;
    }
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
    const payload =
      action === "approve" && dialogForm
        ? { assignedTeacherId: dialogForm.assignedTeacherId || null }
        : {};
    const result = await updateBookingApi(selectedKey!, event.entityType, action, payload);
    setBusyAction(null);
    
    if (result.ok) {
      setNotice(result.notice || `Booking ${action}ed.`);
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
      loading={loadingBookings || !hasLoadedInitialBookings}
      className="admin-shell-bookings"
    >
      <div className="admin-layout-content">
        <AdminCard className="admin-toolbar-card admin-range-card admin-bookings-workspace">
          <div className="admin-bookings-workspace-hero">
            <div className="admin-bookings-workspace-copy">
              <p className="admin-console-kicker">Schedule Workspace</p>
              <div className="admin-bookings-workspace-heading">
                <h2>{rangeLabel}</h2>
                <span className="admin-bookings-workspace-view-pill">{viewLabel}</span>
              </div>
              <p className="helper-text admin-bookings-workspace-summary">{workspaceSummary}</p>

              <div className="admin-bookings-workspace-chips" aria-label="Current bookings context">
                <span className="admin-bookings-workspace-chip">
                  <UserRound size={15} aria-hidden="true" />
                  {teacherFilterLabel}
                </span>
                <span className="admin-bookings-workspace-chip">
                  <CalendarRange size={15} aria-hidden="true" />
                  {rangeLabel}
                </span>
                <span className="admin-bookings-workspace-chip">
                  <Clock3 size={15} aria-hidden="true" />
                  {loadingBookings || !hasLoadedInitialBookings
                    ? "Loading bookings"
                    : countLabel(bookingWorkspaceStats.confirmed, "confirmed booking", "confirmed bookings")}
                </span>
              </div>
            </div>

            <div className="admin-bookings-workspace-stats" aria-label="Visible booking totals">
              <div className="admin-bookings-workspace-stat">
                <span className="admin-bookings-workspace-stat-label">Visible items</span>
                <strong>{loadingBookings || !hasLoadedInitialBookings ? "—" : bookingWorkspaceStats.total}</strong>
              </div>
              <div className="admin-bookings-workspace-stat">
                <span className="admin-bookings-workspace-stat-label">Confirmed</span>
                <strong>{loadingBookings || !hasLoadedInitialBookings ? "—" : bookingWorkspaceStats.confirmed}</strong>
              </div>
              <div className="admin-bookings-workspace-stat">
                <span className="admin-bookings-workspace-stat-label">Pending</span>
                <strong>{loadingBookings || !hasLoadedInitialBookings ? "—" : bookingWorkspaceStats.pending}</strong>
              </div>
              <div className="admin-bookings-workspace-stat is-warning">
                <span className="admin-bookings-workspace-stat-label">Unassigned</span>
                <strong>{loadingBookings || !hasLoadedInitialBookings ? "—" : bookingWorkspaceStats.unassigned}</strong>
              </div>
            </div>
          </div>

          <div className="admin-range-row">
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
              <div className="field admin-inline-field booking-teacher-filter-field">
                <label htmlFor="booking-teacher-filter">Teacher</label>
                <select id="booking-teacher-filter" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
                  <option value="all">All teachers</option>
                  <option value="unassigned">Unassigned</option>
                  {teacherOptions.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-range-divider" />
              <Tooltip content="Create a new booking directly from the admin calendar.">
                <button className="btn btn-primary" type="button" onClick={openManualDialog}>Add Manual Booking</button>
              </Tooltip>
            </div>
          </div>

          {!loadingBookings && hasLoadedInitialBookings && bookingWorkspaceStats.unassigned > 0 ? (
            <div className="admin-bookings-workspace-alert" role="status">
              <AlertCircle size={16} aria-hidden="true" />
              <span>
                {countLabel(bookingWorkspaceStats.unassigned, "unassigned lesson", "unassigned lessons")} still need a teacher in this window.
              </span>
            </div>
          ) : null}
        </AdminCard>

        <AdminCard noPadding className="admin-bookings-calendar-card">
          <div className="admin-bookings-calendar-scroll">
            <AdminBookingCalendar
              view={view}
              date={dateStr}
              events={filteredEvents}
              selectedEventId={selectedKey}
              onSelect={openDialog}
              teacherFilterLabel={teacherFilterLabel}
            />
          </div>
        </AdminCard>
      </div>

      {isDialogMounted && (
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
          canManageAppointment={canManageSelectedEvent}
          canApproveRequest={canApproveSelectedRequest}
          canEditTeacherAssignment={currentAdmin?.role === "owner"}
          canInvoice={currentAdmin?.role === "owner"}
          teacherOptions={teacherOptions}
          lessonDurationOptions={configuredDurationChoices}
          durationIsConfigured={configuredDurationValues.has(Number.parseInt(dialogForm?.durationChoice || "", 10))}
          onMove={() => {
            const event = events.find(e => e.id === selectedKey);
            if (event) {
              setMoveNewStart(toDateTimeLocalValue(event.startAt));
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
            setBusyAction("invoice");
            try {
              const res = await fetch(`/api/admin/bookings/${event.id}/invoice`, {
                cache: "no-store"
              });
              if (!res.ok) {
                const payload = await res.json().catch(() => null);
                setError(payload?.error || "Unable to resolve invoice billing.");
                return;
              }

              const payload = await res.json() as BookingInvoiceResolveResponse;
              if (payload.outcome === "open_existing") {
                await openInvoiceById(payload.invoiceId, "Linked invoice opened.");
                return;
              }
              if (payload.outcome === "choose_candidate") {
                setInvoiceCandidates(payload.candidates);
                return;
              }

              await createBookingInvoiceDraft(event.id);
            } catch (error) {
              setError(error instanceof Error ? error.message : "Network error resolving invoice billing.");
            } finally {
              setBusyAction(null);
            }
          }}
          onDismissMatchedCustomer={() => setDialogMatchDismissed(true)}
          emailHistory={emailHistory}
          emailHistoryWarning={emailHistoryWarning}
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
            const emailTarget = getEmailHistoryTargetForEvent((event as EventWithRow | undefined) || null);
            if (emailTarget) {
              void syncEmailApi(emailTarget);
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
          lessonPlanDialogProps={{
            lessonPlan,
            draft: lessonPlanDraft,
            loading: lessonPlanLoading,
            saving: lessonPlanSaving,
            templates: lessonPlanTemplates,
            templatesLoading: lessonPlanTemplatesLoading,
            materials: materialsList.map((m) => ({ id: m.id, title: m.title, description: m.description })),
            templateSelection: lessonPlanTemplateSelection,
            onTemplateSelectionChange: setLessonPlanTemplateSelection,
            onCreateFromScratch: createScratchLessonPlanDraft,
            onApplyTemplate: applySelectedLessonPlanTemplate,
            onClearLessonPlan: clearLessonPlanDraft,
            onDraftSectionsChange: updateLessonPlanDraftSections,
            onDraftStatusChange: updateLessonPlanDraftStatus,
            onSave: saveLessonPlan
          }}
        />
      )}

      <AdminDialog
        isOpen={invoiceCandidates.length > 0}
        onClose={() => setInvoiceCandidates([])}
        title="Possible Existing Invoices"
        description="Choose an existing invoice for this booking or create a new booking-linked draft."
        footer={(
          <div className="dialog-footer-row dialog-footer-row-end">
            <button className="btn btn-secondary" type="button" onClick={() => setInvoiceCandidates([])}>
              Close
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busyAction === "invoice" || !selectedEvent || selectedEvent.entityType !== "booking"}
              onClick={async () => {
                if (!selectedEvent || selectedEvent.entityType !== "booking") return;
                setBusyAction("invoice");
                try {
                  await createBookingInvoiceDraft(selectedEvent.id);
                } catch (error) {
                  setError(error instanceof Error ? error.message : "Unable to create invoice draft.");
                } finally {
                  setBusyAction(null);
                }
              }}
            >
              {busyAction === "invoice" ? "Creating..." : "Create New"}
            </button>
          </div>
        )}
      >
        <AdminCard ghost>
          {invoiceCandidates.length === 0 ? (
            <p className="helper-text">No candidate invoices found.</p>
          ) : (
            <div className="invoice-dialog-preset-list">
              {invoiceCandidates.map((candidate) => (
                <div key={candidate.invoiceId} className="invoice-dialog-preset-option">
                  <div className="admin-list-strong">
                    {candidate.invoiceNumber} · {candidate.status}
                  </div>
                  <div className="helper-text">
                    Issued {formatDateTime(candidate.issuedAt)} · Due {formatDateTime(candidate.dueAt)} · {formatCurrency(candidate.totalCents, candidate.currency)}
                  </div>
                  <div className="helper-text">{candidate.matchReason}</div>
                  <div className="button-row">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={busyAction === "invoice"}
                      onClick={() => void openInvoiceById(candidate.invoiceId, "Candidate invoice opened.")}
                    >
                      Open Existing
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </AdminDialog>

      {isMoveOpen && (
        <AdminDialog
          isOpen={true}
          onClose={() => setIsMoveOpen(false)}
          title="Move Lesson Time"
          size="wide"
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

      {isManualDialogMounted && (
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
          canEditAssignment={currentAdmin?.role === "owner"}
          teacherOptions={teacherOptions}
          currentTeacherId={currentAdmin?.role === "teacher" ? currentAdmin.id : null}
          durationChoice={manualDurationChoice}
          setDurationChoice={setManualDurationChoice}
          lessonDurationOptions={configuredDurationChoices}
          manualMatch={manualMatch}
          onResolveMatch={(resolution) => void addManualBooking(resolution)}
          onSave={() => void addManualBooking()}
          busyAction={busyAction}
        />
      )}
    </AdminShell>
  );
}
