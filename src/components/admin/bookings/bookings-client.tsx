"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, addYears, subYears } from "date-fns";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminBookingCalendar } from "@/components/admin-booking-calendar";
import { animateIn, animateOut } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";

import { useBookings, type BookingEvent } from "@/lib/admin/use-bookings";
import { useCustomers } from "@/lib/admin/use-customers";
import { useEmailHistory } from "@/lib/admin/use-email-history";
import { useLearningMaterials } from "@/lib/admin/use-learning-materials";

import { BookingDetailDialog } from "./booking-detail-dialog";
import { ManualBookingDialog } from "./manual-booking-dialog";
import { BookingMaterialsDialog } from "./booking-materials-dialog";

import { 
  type ManualStep, 
} from "@/lib/admin/types";

type CalendarView = "day" | "week" | "month" | "year";

interface EventWithRow extends BookingEvent {
  row: any;
}

/**
 * Main admin bookings console client.
 * Refactored to use modular components and hooks.
 */
export function AdminBookingsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const view = (searchParams.get("view") as CalendarView) || "week";
  const dateStr = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Dialog & Selection State
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"appointment" | "emails">("appointment");
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [dialogForm, setDialogForm] = useState<any>(null);

  // Manual Booking State
  const [manualStep, setManualStep] = useState<ManualStep>("customer");
  const [customerQuery, setCustomerQuery] = useState("");
  const [manualCustomerId, setManualCustomerId] = useState("");
  const [manualUpdateCustomerFromBooking, setManualUpdateCustomerFromBooking] = useState(true);
  const [manualDurationChoice, setManualDurationChoice] = useState("min30");
  const [manualMatch, setManualMatch] = useState<any | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
  // Move State
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [moveNewStart, setMoveNewStart] = useState("");

  // Email Composer State
  const [emailComposerSubject, setEmailComposerSubject] = useState("");
  const [emailComposerMessage, setEmailComposerMessage] = useState("");

  const dialogPresence = usePresenceExit();
  const manualDialogPresence = usePresenceExit();
  const materialsDialogPresence = usePresenceExit();
  const dialogRootRef = useRef<HTMLDivElement | null>(null);
  const manualDialogRootRef = useRef<HTMLDivElement | null>(null);
  const materialsDialogRootRef = useRef<HTMLDivElement | null>(null);
  const materialsUploadFormRef = useRef<HTMLFormElement | null>(null);
  const manualFormRef = useRef<HTMLFormElement | null>(null);

  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);

  // Data Hooks
  const { 
    events: rawEvents, 
    loading: loadingBookings, 
    load: loadBookings, 
    update: updateBookingApi,
    remove: removeBookingApi,
    notify: notifyBookingApi
  } = useBookings({
    onError: setError,
    onAuthError
  });

  const events = useMemo(() => rawEvents as any as EventWithRow[], [rawEvents]);

  const { customers: customerOptions, load: loadCustomers } = useCustomers({ pageSize: 1000, onAuthError, onError: setError });
  const { history: emailHistory, loading: loadingEmailHistory, sending: sendingEmail, load: loadEmailHistory, send: sendEmailApi } = useEmailHistory({ onAuthError, onError: setError });
  const { materials: materialsList, loading: materialsLoading, uploading: materialsUploading, load: loadMaterials, upload: uploadMaterialApi, remove: removeMaterialApi } = useLearningMaterials({ onAuthError, onError: setError });

  // Effects
  useEffect(() => {
    void loadBookings(view, dateStr);
  }, [view, dateStr, loadBookings]);

  // Navigation
  const navigate = useCallback((newView: CalendarView, newDate: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", newView);
    params.set("date", newDate);
    router.push(`/admin/bookings?${params.toString()}`);
  }, [router, searchParams]);

  const goPrev = () => {
    const d = parseISO(dateStr);
    let next;
    if (view === 'day') next = subDays(d, 1);
    else if (view === 'week') next = subWeeks(d, 1);
    else if (view === 'month') next = subMonths(d, 1);
    else next = subYears(d, 1);
    navigate(view, format(next, 'yyyy-MM-dd'));
  };

  const goNext = () => {
    const d = parseISO(dateStr);
    let next;
    if (view === 'day') next = addDays(d, 1);
    else if (view === 'week') next = addWeeks(d, 1);
    else if (view === 'month') next = addMonths(d, 1);
    else next = addYears(d, 1);
    navigate(view, format(next, 'yyyy-MM-dd'));
  };

  // Handlers
  const openDialog = useCallback(async (event: EventWithRow) => {
    setSelectedKey(event.id);
    const row = event.row;
    setDialogForm({
      notes: row.notes || "",
      startAtLocal: event.startAt.slice(0, 16),
      firstName: row.firstName || "",
      lastName: row.lastName || "",
      email: row.email || "",
      phone: row.phone || "",
      unitNumber: row.unitNumber || "",
      houseNumber: row.houseNumber || "",
      streetName: row.streetName || "",
      streetType: row.streetType || "Street",
      suburb: row.suburb || "",
      state: row.state || "VIC",
      postcode: row.postcode || "",
      lessonMode: row.lessonMode || "in_person",
      skillLevel: row.skillLevel || "beginner",
      durationChoice: row.lessonDuration || "min30",
      customDurationMinutes: row.customDurationMinutes || ""
    });
    setActiveTab("appointment");
    setIsEditingCustomer(false);
    setError("");
    setNotice("");

    if (row.customerId) {
      void loadEmailHistory(row.customerId);
    }

    dialogPresence.show();
    if (dialogRootRef.current) animateIn(dialogRootRef.current);
  }, [dialogPresence, loadEmailHistory]);

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
    setSelectedCustomer(null);
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

  const openMaterialsDialog = useCallback(async () => {
    const event = events.find(e => e.id === selectedKey);
    if (!event?.row.customerId) return;
    
    void loadMaterials(event.row.customerId);
    materialsDialogPresence.show();
    if (materialsDialogRootRef.current) animateIn(materialsDialogRootRef.current);
  }, [events, selectedKey, loadMaterials, materialsDialogPresence]);

  const closeMaterialsDialog = useCallback(async () => {
    if (materialsDialogRootRef.current) await animateOut(materialsDialogRootRef.current);
    materialsDialogPresence.hide();
  }, [materialsDialogPresence]);

  const applyCustomerToManual = useCallback((customer: any) => {
    if (!manualFormRef.current) return;
    const f = manualFormRef.current;
    f.firstName.value = customer.firstName || customer.fullName.split(" ")[0];
    f.lastName.value = customer.lastName || customer.fullName.split(" ").slice(1).join(" ");
    f.email.value = customer.email;
    f.phone.value = customer.phone;
    f.unitNumber.value = customer.unitNumber || "";
    f.houseNumber.value = customer.houseNumber || "";
    f.streetName.value = customer.streetName || "";
    f.streetType.value = customer.streetType || "Street";
    f.suburb.value = customer.suburb || "";
    f.state.value = customer.state || "VIC";
    f.postcode.value = customer.postcode || "";
    f.skillLevel.value = customer.skillLevel || "beginner";
    f.lessonMode.value = customer.lessonMode || "in_person";
    setSelectedCustomer(customer);
  }, []);

  const clearManualCustomer = useCallback(() => {
    if (!manualFormRef.current) return;
    const f = manualFormRef.current;
    f.firstName.value = "";
    f.lastName.value = "";
    f.email.value = "";
    f.phone.value = "";
    f.unitNumber.value = "";
    f.houseNumber.value = "";
    f.streetName.value = "";
    f.streetType.value = "Street";
    f.suburb.value = "";
    f.state.value = "VIC";
    f.postcode.value = "";
    f.skillLevel.value = "beginner";
    f.lessonMode.value = "in_person";
    setManualCustomerId("");
    setSelectedCustomer(null);
  }, []);

  // Action Logic
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

  async function sendCustomEmail() {
    if (!selectedKey || !emailComposerSubject || !emailComposerMessage) return;
    const success = await sendEmailApi(selectedKey, emailComposerSubject, emailComposerMessage);
    if (success) {
      setNotice("Email sent.");
      setEmailComposerSubject("");
      setEmailComposerMessage("");
    }
  }

  async function uploadMaterial() {
    const event = events.find(e => e.id === selectedKey);
    if (!event?.row.customerId || !materialsUploadFormRef.current) return;
    const success = await uploadMaterialApi(event.row.customerId, event.id, materialsUploadFormRef.current);
    if (success) {
      setNotice("Material uploaded.");
    }
  }

  async function addManualBooking(resolution?: string) {
    if (!manualFormRef.current) return;
    setBusyAction("create");
    setError("");

    const formData = new FormData(manualFormRef.current);
    const payload: any = Object.fromEntries(formData.entries());
    
    // Add additional fields
    payload.manualCustomerId = manualCustomerId || undefined;
    payload.resolution = resolution;
    payload.isRecurring = formData.get("isRecurring") === "on";
    payload.updateCustomerFromBooking = manualUpdateCustomerFromBooking;

    try {
      const response = await fetch("/api/admin/bookings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.status === 409) {
        const data = await response.json();
        setManualMatch(data.match);
        setManualStep("schedule");
        setBusyAction(null);
        return;
      }

      if (!response.ok) {
        setError("Unable to create booking.");
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

  const rangeLabel = useMemo(() => {
    const d = parseISO(dateStr);
    if (view === 'day') return format(d, 'EEEE, d MMMM yyyy');
    if (view === 'week') return `Week of ${format(startOfWeek(d, { weekStartsOn: 1 }), 'd MMMM yyyy')}`;
    if (view === 'month') return format(d, 'MMMM yyyy');
    return format(d, 'yyyy');
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
    >
      <div 
        className="admin-layout-content" 
        style={{ height: 'calc(100vh - 120px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <AdminCard className="booking-row admin-range-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="button-row" style={{ marginRight: '8px' }}>
              <button className="btn btn-secondary btn-icon" onClick={goPrev}>←</button>
              <button className="btn btn-secondary btn-icon" onClick={goNext}>→</button>
            </div>
            <strong style={{ fontSize: '1.1rem', minWidth: '200px' }}>{rangeLabel}</strong>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="site-nav" style={{ margin: 0 }}>
              <button className={`btn ${view === 'day' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => navigate('day', dateStr)}>DAY</button>
              <button className={`btn ${view === 'week' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => navigate('week', dateStr)}>WEEK</button>
              <button className={`btn ${view === 'month' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => navigate('month', dateStr)}>MONTH</button>
              <button className={`btn ${view === 'year' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => navigate('year', dateStr)}>YEAR</button>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'var(--line)' }} />
            <button className="btn btn-primary" onClick={openManualDialog}>ADD MANUAL BOOKING</button>
          </div>
        </AdminCard>

        <AdminCard noPadding style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <AdminBookingCalendar
            view={view}
            date={dateStr}
            events={events as any}
            selectedEventId={selectedKey}
            onSelect={(event) => openDialog(event as any)}
          />
        </AdminCard>
      </div>

      {dialogPresence.isMounted && (
        <BookingDetailDialog
          isOpen={true}
          onClose={closeDialog}
          rootRef={dialogRootRef}
          event={events.find(e => e.id === selectedKey) || null}
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
          selectedCustomer={null}
          isEditingCustomer={isEditingCustomer}
          setIsEditingCustomer={setIsEditingCustomer}
          onEditCustomer={() => setIsEditingCustomer(true)}
          emailHistory={emailHistory}
          loadingEmailHistory={loadingEmailHistory}
          sendingEmail={sendingEmail}
          emailSubject={emailComposerSubject}
          setEmailSubject={setEmailComposerSubject}
          emailMessage={emailComposerMessage}
          setEmailMessage={setEmailComposerMessage}
          onSendEmail={sendCustomEmail}
          onPerformAction={async (action) => {
            const event = events.find(e => e.id === selectedKey);
            if (event) {
              const success = await updateBookingApi(selectedKey!, event.entityType, action, {});
              if (success) {
                setNotice(`Booking ${action}ed.`);
                void loadBookings(view, dateStr);
              }
            }
          }}
          onOpenMaterials={openMaterialsDialog}
          onOpenInvoice={() => {
            const event = events.find(e => e.id === selectedKey);
            if (event?.row.customerName) {
              router.push(`/admin/invoices?q=${encodeURIComponent(event.row.customerName)}&openCreate=true&customerId=${event.row.customerId}`);
            }
          }}
        />
      )}

      {isMoveOpen && (
        <AdminDialog
          isOpen={true}
          onClose={() => setIsMoveOpen(false)}
          title="Move Lesson Time"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
              <button className="btn btn-secondary" onClick={() => setIsMoveOpen(false)}>CANCEL</button>
              <button className="btn btn-primary" disabled={!!busyAction} onClick={moveBooking}>
                {busyAction === 'move' ? 'MOVING...' : 'CONFIRM MOVE'}
              </button>
            </div>
          }
        >
          <AdminForm>
            <AdminField label="New Start Time" required>
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
          durationChoice={manualDurationChoice}
          setDurationChoice={setManualDurationChoice}
          manualMatch={manualMatch}
          onResolveMatch={(resolution) => void addManualBooking(resolution)}
          onSave={() => void addManualBooking()}
          busyAction={busyAction}
        />
      )}

      {materialsDialogPresence.isMounted && (
        <BookingMaterialsDialog
          isOpen={true}
          onClose={closeMaterialsDialog}
          rootRef={materialsDialogRootRef}
          materialsList={materialsList}
          materialsLoading={materialsLoading}
          materialsUploading={materialsUploading}
          onUpload={uploadMaterial}
          onDelete={removeMaterialApi}
          uploadFormRef={materialsUploadFormRef}
        />
      )}
    </AdminShell>
  );
}
