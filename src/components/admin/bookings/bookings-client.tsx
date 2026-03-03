"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, addYears, subYears } from "date-fns";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminBookingCalendar } from "@/components/admin-booking-calendar";
import { formatDateTime } from "@/lib/admin/formatters";
import { animateIn, animateOut } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";

import { useBookings, type BookingEvent } from "@/lib/admin/use-bookings";
import { useCustomers } from "@/lib/admin/use-customers";
import { usePresets } from "@/lib/admin/use-presets";
import { useEmailHistory } from "@/lib/admin/use-email-history";
import { useLearningMaterials } from "@/lib/admin/use-learning-materials";
import { usePortalCredentials } from "@/lib/admin/use-portal-credentials";

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
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
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

  const goToday = () => navigate(view, format(new Date(), 'yyyy-MM-dd'));

  // Handlers
  const openDialog = useCallback(async (event: EventWithRow) => {
    setSelectedKey(event.id);
    setDialogForm({
      notes: event.row.notes || "",
      startAtLocal: event.startAt.slice(0, 16),
      firstName: event.row.customerFirstName || "",
      lastName: event.row.customerLastName || "",
      email: event.row.customerEmail || "",
      phone: event.row.customerPhone || "",
      suburb: event.row.customerSuburb || "",
      postcode: event.row.customerPostcode || ""
    });
    setActiveTab("appointment");
    setIsEditingCustomer(false);
    setError("");
    setNotice("");

    if (event.row.customerId) {
      void loadEmailHistory(event.row.customerId);
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
    setSelectedCustomer(null);
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

  // Action Logic
  async function saveBooking() {
    if (!selectedKey || !dialogForm) return;
    setBusyAction("save");
    const success = await updateBookingApi(selectedKey, dialogForm);
    setBusyAction(null);
    if (success) {
      setNotice("Booking updated.");
      void loadBookings(view, dateStr);
    }
  }

  async function deleteBooking() {
    if (!selectedKey || !window.confirm("Are you sure you want to cancel this booking?")) return;
    setBusyAction("delete");
    const success = await removeBookingApi(selectedKey);
    setBusyAction(null);
    if (success) {
      setNotice("Booking cancelled.");
      void closeDialog();
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
            <button className="btn btn-secondary" onClick={goToday}>TODAY</button>
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
          onPerformAction={() => {}}
          onOpenMaterials={openMaterialsDialog}
          onOpenInvoice={() => {}}
        />
      )}

      {manualDialogPresence.isMounted && (
        <ManualBookingDialog
          isOpen={true}
          onClose={closeManualDialog}
          rootRef={manualDialogRootRef}
          step={manualStep}
          setStep={setManualStep}
          customerQuery={customerQuery}
          setCustomerQuery={setCustomerQuery}
          customerOptions={customerOptions}
          selectedCustomer={selectedCustomer}
          setSelectedCustomer={setSelectedCustomer}
          onSave={() => {}}
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
