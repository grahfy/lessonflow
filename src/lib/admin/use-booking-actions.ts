"use client";

import { useCallback } from "react";

import { buildManualBookingPayload } from "@/lib/admin/manual-booking-payload";
import { durationMinutesToBookingPayload } from "@/lib/lesson-duration-utils";
import { type BookingMutationResult } from "@/lib/admin/use-bookings";
import { type EmailHistoryTarget } from "@/lib/admin/use-email-history";
import { sanitizeBookingEditPayload, type BookingDialogForm, type BookingMatchedCustomer } from "@/components/admin/bookings/types";

type CaptchaPayload = { captchaToken: string; captchaAnswer: string };

type BookingEntityType = "booking" | "booking_request";

/** Minimal shape the booking actions need from a calendar event. */
interface BookingActionEvent {
  id: string;
  entityType: BookingEntityType;
}

/** Resolved email-history target for the selected event (or null). */
type EmailTarget = EmailHistoryTarget | null;

/** Result shape returned by the email send API hook. */
type SendEmailResult = { success: boolean; errorCode?: string };

interface UseBookingActionsOptions<TEvent extends BookingActionEvent> {
  events: TEvent[];
  selectedKey: string | null;
  /** Latest dialog form snapshot via ref (mirrors dialogFormRef in the orchestrator). */
  getDialogForm: () => BookingDialogForm | null;
  /** Reactive dialogForm value (used for approve/promote teacher carry-through). */
  dialogForm: BookingDialogForm | null;
  view: string;
  dateStr: string;
  configuredDurationValues: Set<number>;
  activeLessonPricingOptions: Array<unknown>;
  presets: Array<{
    label: string;
    description: string;
    unitPriceCents?: number | null;
    discountKind?: string | null;
    discountValue?: number | null;
  }>;
  manualCustomerId: string;
  manualUpdateCustomerFromBooking: boolean;
  manualFormRef: { current: HTMLFormElement | null };
  getEmailHistoryTargetForEvent: (event: TEvent | null) => EmailTarget;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setBusyAction: (action: string | null) => void;
  setPendingConfirm: (confirm: {
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
  }) => void;
  setIsMoveOpen: (open: boolean) => void;
  setManualMatch: (match: BookingMatchedCustomer | null) => void;
  setManualStep: (step: "schedule") => void;
  setEmailComposerSubject: (value: string) => void;
  setEmailComposerMessage: (value: string) => void;
  loadBookings: (view: string, dateStr: string) => Promise<unknown> | void;
  updateBookingApi: (
    key: string,
    entityType: BookingEntityType,
    action: string,
    payload: Record<string, unknown>
  ) => Promise<BookingMutationResult>;
  removeBookingApi: (key: string, entityType: BookingEntityType) => Promise<BookingMutationResult>;
  sendEmailApi: (
    target: EmailHistoryTarget,
    subject: string,
    message: string,
    captcha?: CaptchaPayload
  ) => Promise<SendEmailResult>;
  closeDialog: () => void;
  closeManualDialog: () => void;
  openInvoiceById: (invoiceId: string, noticeMessage: string) => Promise<void>;
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
 * Booking lifecycle actions for the bookings orchestrator.
 *
 * Extracted verbatim: save/delete/move, lifecycle (approve/reject/promote/
 * waitlist/attendance) via performAction, manual-booking create with duplicate
 * resolution, the custom-email send wrapper, and the invoice draft helper. Each
 * action mutates the shared busy/notice/error state and reloads bookings exactly
 * as before. No behavior change.
 */
export function useBookingActions<TEvent extends BookingActionEvent>(options: UseBookingActionsOptions<TEvent>) {
  const {
    events,
    selectedKey,
    getDialogForm,
    dialogForm,
    view,
    dateStr,
    configuredDurationValues,
    activeLessonPricingOptions,
    presets,
    manualCustomerId,
    manualUpdateCustomerFromBooking,
    manualFormRef,
    getEmailHistoryTargetForEvent,
    setError,
    setNotice,
    setBusyAction,
    setPendingConfirm,
    setIsMoveOpen,
    setManualMatch,
    setManualStep,
    setEmailComposerSubject,
    setEmailComposerMessage,
    loadBookings,
    updateBookingApi,
    removeBookingApi,
    sendEmailApi,
    closeDialog,
    closeManualDialog,
    openInvoiceById
  } = options;

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

  const saveBooking = useCallback(async () => {
    const event = events.find(e => e.id === selectedKey);
    const currentDialogForm = getDialogForm();
    if (!selectedKey || !currentDialogForm || !event) return;
    const nextDurationMinutes = Number.parseInt(currentDialogForm.durationChoice, 10);
    if (!Number.isInteger(nextDurationMinutes)) {
      setError("Select a configured lesson duration before saving.");
      return;
    }
    if (configuredDurationValues.size > 0 && !configuredDurationValues.has(nextDurationMinutes)) {
      setError("This booking uses a duration that is not configured in Lesson Info / Prices. Add that duration in settings or choose a configured duration before saving.");
      return;
    }

    const normalizedDuration = durationMinutesToBookingPayload(nextDurationMinutes);
    setBusyAction("save");
    const payload: Record<string, unknown> = {
      ...sanitizeBookingEditPayload(currentDialogForm),
      lessonDuration: normalizedDuration.lessonDuration,
      customDurationMinutes: normalizedDuration.customDurationMinutes
    };
    if (event.entityType === "booking_request") {
      payload.customerId = currentDialogForm.linkedCustomerId || null;
      payload.startAtLocal = currentDialogForm.startAtLocal;
    }
    const result = await updateBookingApi(selectedKey, event.entityType, "edit", {
      ...payload
    });
    setBusyAction(null);
    if (result.ok) {
      setNotice(result.notice || "Booking updated.");
      void loadBookings(view, dateStr);
    }
  }, [events, selectedKey, getDialogForm, configuredDurationValues, setError, setBusyAction, updateBookingApi, setNotice, loadBookings, view, dateStr]);

  const doDeleteBooking = useCallback(async (key: string, event: TEvent) => {
    setBusyAction("delete");
    const result = await removeBookingApi(key, event.entityType);
    setBusyAction(null);
    if (result.ok) {
      setNotice(result.notice || "Booking cancelled.");
      void closeDialog();
      void loadBookings(view, dateStr);
    }
  }, [setBusyAction, removeBookingApi, setNotice, closeDialog, loadBookings, view, dateStr]);

  const deleteBooking = useCallback(() => {
    const event = events.find(e => e.id === selectedKey);
    if (!selectedKey || !event) return;
    setPendingConfirm({
      title: "Cancel Booking",
      description: "Are you sure you want to cancel this booking?",
      confirmLabel: "Cancel Booking",
      destructive: true,
      onConfirm: () => void doDeleteBooking(selectedKey, event)
    });
  }, [events, selectedKey, setPendingConfirm, doDeleteBooking]);

  const moveBooking = useCallback(async (moveNewStart: string) => {
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
  }, [events, selectedKey, setBusyAction, updateBookingApi, setNotice, setIsMoveOpen, loadBookings, view, dateStr]);

  const sendCustomEmail = useCallback(async (subject: string, message: string, captcha?: CaptchaPayload) => {
    const event = events.find(e => e.id === selectedKey);
    const emailTarget = getEmailHistoryTargetForEvent(event || null);
    if (!emailTarget || !subject || !message) return { success: false };

    setError("");
    const result = await sendEmailApi(emailTarget, subject, message, captcha);
    if (result.success) {
      setNotice("Email sent.");
      setEmailComposerSubject("");
      setEmailComposerMessage("");
    }
    return result;
  }, [events, selectedKey, getEmailHistoryTargetForEvent, setError, sendEmailApi, setNotice, setEmailComposerSubject, setEmailComposerMessage]);

  const addManualBooking = useCallback(async (resolution?: "use_existing" | "update_existing" | "create_new") => {
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
  }, [manualFormRef, activeLessonPricingOptions, setError, setBusyAction, manualCustomerId, manualUpdateCustomerFromBooking, setManualMatch, setManualStep, setNotice, closeManualDialog, loadBookings, view, dateStr]);

  const performAction = useCallback(async (action: string) => {
    const event = events.find(e => e.id === selectedKey);
    if (!event) return;

    // Attendance actions are UI-namespaced (set_attendance:attended|no_show|clear) so the dialog can
    // track per-button busy state, but they all map to the single `set_attendance` API action.
    if (action.startsWith("set_attendance:")) {
      const choice = action.slice("set_attendance:".length);
      const attendanceStatus = choice === "clear" ? null : choice;
      setBusyAction(action);
      const result = await updateBookingApi(selectedKey!, event.entityType, "set_attendance", {
        attendanceStatus
      });
      setBusyAction(null);
      if (result.ok) {
        setNotice(
          result.notice ||
            (attendanceStatus === null
              ? "Attendance cleared."
              : `Attendance marked as ${attendanceStatus === "no_show" ? "no-show" : "attended"}.`)
        );
        void loadBookings(view, dateStr);
      }
      return;
    }

    setBusyAction(action);
    // Approve and promote both create bookings, so carry through any teacher assignment picked in the dialog.
    const payload =
      (action === "approve" || action === "promote") && dialogForm
        ? { assignedTeacherId: dialogForm.assignedTeacherId || null }
        : {};
    const result = await updateBookingApi(selectedKey!, event.entityType, action, payload);
    setBusyAction(null);

    if (result.ok) {
      setNotice(result.notice || `Booking ${action}ed.`);
      // Approve/reject/promote resolve the request out of its current state; close the dialog so it
      // doesn't keep showing stale actions. Waitlist keeps the request open for further handling.
      if (action === "approve" || action === "reject" || action === "promote") {
        void closeDialog();
      }
      void loadBookings(view, dateStr);
    }
  }, [events, selectedKey, dialogForm, setBusyAction, updateBookingApi, setNotice, loadBookings, view, dateStr, closeDialog]);

  return {
    createBookingInvoiceDraft,
    saveBooking,
    deleteBooking,
    moveBooking,
    sendCustomEmail,
    addManualBooking,
    performAction
  };
}
