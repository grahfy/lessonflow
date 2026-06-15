/**
 * Booking Lifecycle & Detal Management Console
 * 
 * Centralized dialog for managing a single booking event (Request or Confirmed).
 * Orchestrates customer details, scheduling, communication history, 
 * learning materials, and billing.
 * 
 * DESIGN RATIONALE:
 * 1. Unified Request/Booking Flow: Uses the same UI for both "Booking Requests" 
 *    and "Confirmed Bookings" to maintain design consistency and reduce 
 *    code duplication.
 * 2. Heuristic Matching logic: If a booking comes in from a guest email that 
 *    partially matches an existing customer, the UI provides a "Match Found" 
 *    guard to prevent duplicate profile creation.
 * 3. Bidirectional Communication: Integrates an Email History viewer (fetched
 *    from persisted outbound logs plus provider-backed inbound snapshots) alongside a
 *    custom composer.
 * 4. Modular Actions: Provides entry points to adjacent domains:
 *    - Invoicing (Financial)
 *    - Learning Materials (Educational)
 *    - Address Autocomplete (UX)
 */

"use client";

import { Dispatch, RefObject, SetStateAction, useRef, useEffect, useLayoutEffect } from "react";
import gsap from "gsap";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { AppDialog } from "@/components/ui/app-dialog";
import { AdminEmailPanel } from "@/components/admin/ui/admin-email-panel";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import {
  type MaterialsFolderActions,
  type MaterialsFolderField
} from "@/components/admin/ui/admin-materials-panel";
import { AdminTabBar } from "@/components/admin/ui/admin-tab-bar";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { STREET_TYPES } from "@/lib/admin/constants";
import { getEmailSourceLabel } from "@/lib/admin/email-history";
import { formatDateTime } from "@/lib/admin/formatters";
import { type BookingEvent } from "@/lib/admin/use-bookings";
import { type EmailRecord, type SendEmailResult } from "@/lib/admin/use-email-history";
import { AU_STATES, type LearningMaterialBooking, type LearningMaterialRow } from "@/lib/admin/types";
import { toAuState } from "@/lib/admin/utils";
import { AddressAutocomplete } from "@/components/admin/ui/address-autocomplete";
import type {
  LessonPlanSection,
  LessonPlanSectionsInput,
  LessonPlanV2State,
  LessonPlanTemplateV2State
} from "@/lib/lesson-plan-contract";

import { BookingMaterialsDialog } from "./booking-materials-dialog";
import { BookingLessonPlanPanelV2 } from "@/components/admin/lesson-plans/booking-lesson-plan-panel-v2";
import { TipTapEditor } from "@/components/admin/lesson-plans/editor/tiptap-editor";
import { bookingNotesExtensions } from "./booking-notes-extensions";
import {
  type BookingCustomerLookupState,
  type BookingDialogForm,
  type BookingMatchedCustomer
} from "./types";

interface BookingDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  event: BookingEvent | null;
  /** Current state of the editing form, extracted from the event entity. */
  dialogForm: BookingDialogForm | null;
  setDialogForm: Dispatch<SetStateAction<BookingDialogForm | null>>;
  /** Tracks which button (Save/Approve/Invoice) is currently requesting. */
  busyAction: string | null;
  onSave: () => void;
  onDelete: () => void;
  onMove: () => void;
  canManageAppointment: boolean;
  canApproveRequest: boolean;
  canEditTeacherAssignment: boolean;
  canInvoice: boolean;
  teacherOptions: Array<{ id: string; displayName: string }>;
  lessonDurationOptions: Array<{ value: string; label: string }>;
  durationIsConfigured: boolean;

  // Tabs Navigation
  activeTab: "appointment" | "emails" | "materials" | "lesson-plan";
  setActiveTab: (tab: "appointment" | "emails" | "materials" | "lesson-plan") => void;

  // CRM Integration
  customerLookup: BookingCustomerLookupState;
  matchedCustomer: BookingMatchedCustomer | null;
  onApplyMatchedCustomer: () => void;
  onOpenMatchedCustomer: () => void | Promise<void>;
  onDismissMatchedCustomer: () => void;

  // Communication Engine
  emailHistory: ReadonlyArray<EmailRecord>;
  emailHistoryWarning?: string | null;
  loadingEmailHistory: boolean;
  sendingEmail: boolean;
  syncingEmail: boolean;
  emailSubject: string;
  setEmailSubject: (val: string) => void;
  emailMessage: string;
  setEmailMessage: (val: string) => void;
  onSendEmail: (subject: string, message: string, captcha?: { captchaToken: string; captchaAnswer: string }) => Promise<SendEmailResult>;
  onSyncEmail: () => void;

  // Domain Actions
  onPerformAction: (action: string) => void;
  onOpenInvoice: () => void | Promise<void>;

  // Learning Materials
  materialsDialogProps: {
    materialsList: LearningMaterialRow[];
    materialsLoading: boolean;
    materialsUploading: boolean;
    materialsDeletingId: string | null;
    onUpload: (captcha?: { captchaToken: string; captchaAnswer: string }) => void;
    onDelete: (id: string) => void;
    uploadFormRef: RefObject<HTMLFormElement | null>;
    bookingField?: {
      bookingId: string;
      bookings: LearningMaterialBooking[];
      onChange: (bookingId: string) => void;
    };
    folderField?: MaterialsFolderField;
    folderActions?: MaterialsFolderActions;
  };
  lessonPlanDialogProps: {
    lessonPlan: LessonPlanV2State | null;
    draft: LessonPlanSectionsInput | null;
    loading: boolean;
    saving: boolean;
    templates: LessonPlanTemplateV2State[];
    templatesLoading: boolean;
    materials: Array<{ id: string; title: string; description?: string | null }>;
    templateSelection: string;
    onTemplateSelectionChange: (value: string) => void;
    onCreateFromScratch: () => void;
    onApplyTemplate: () => void;
    onClearLessonPlan: () => void;
    onDraftSectionsChange: (sections: LessonPlanSection[]) => void;
    onDraftStatusChange: (status: LessonPlanSectionsInput["status"]) => void;
    onSave: () => void;
  };
}

/**
 * Renders the full-screen admin dialog for a specific booking.
 */
export function BookingDetailDialog({
  isOpen,
  onClose,
  rootRef,
  event,
  dialogForm,
  setDialogForm,
  busyAction,
  onSave,
  onDelete,
  onMove,
  canManageAppointment,
  canApproveRequest,
  canEditTeacherAssignment,
  canInvoice,
  teacherOptions,
  lessonDurationOptions,
  durationIsConfigured,
  activeTab,
  setActiveTab,
  customerLookup,
  matchedCustomer,
  onApplyMatchedCustomer,
  onOpenMatchedCustomer,
  onDismissMatchedCustomer,
  emailHistory,
  emailHistoryWarning,
  loadingEmailHistory,
  sendingEmail,
  syncingEmail,
  emailSubject,
  setEmailSubject,
  emailMessage,
  setEmailMessage,
  onSendEmail,
  onSyncEmail,
  onPerformAction,
  onOpenInvoice,
  materialsDialogProps,
  lessonPlanDialogProps
}: BookingDetailDialogProps) {
  const tabContentRef = useRef<HTMLDivElement>(null);

  const useSafeLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

  useSafeLayoutEffect(() => {
    if (tabContentRef.current) {
      gsap.killTweensOf(tabContentRef.current);
      gsap.fromTo(
        tabContentRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }
      );
    }
  }, [activeTab]);

  if (!event || !dialogForm) return null;

  /** Local helper for atomic form updates. */
  const updateForm = (patch: Partial<BookingDialogForm>) =>
    setDialogForm((current) => (current ? { ...current, ...patch } : current));

  const tabBodyClassName = "booking-dialog-layout booking-tab-panel";

  return (
    <>
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      rootRef={rootRef}
      id="booking-detail-dialog"
      title={event.entityType === 'booking' ? "Edit Booking" : "Booking Request"}
      description={`Status: ${event.status} / Type: ${event.entityType === 'booking' ? "Confirmed" : "Request"}`}
      size="lg"
      bodyClassName="booking-dialog-body-lock"
      lockBodyScrollArea
      hideHeaderClose
      footer={
        <div className="dialog-footer-row">
          <div className="dialog-footer-left">
            <Tooltip content="Close this booking dialog without applying new changes.">
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </Tooltip>
            {activeTab === 'appointment' ? (
              <>
                <Tooltip content="Reschedule the lesson to a new start time.">
                  <button className="btn btn-secondary" disabled={!!busyAction || !canManageAppointment} onClick={onMove}>
                    Move Lesson Time
                  </button>
                </Tooltip>
                {event.entityType === "booking" && canInvoice ? (
                  <Tooltip content="Create or open a draft invoice linked to this booking.">
                    <button className="btn btn-secondary" disabled={busyAction === "invoice"} onClick={onOpenInvoice}>
                      {busyAction === "invoice" ? "Creating Invoice..." : "Invoice / Billing"}
                    </button>
                  </Tooltip>
                ) : null}
                <Tooltip content="Cancel this booking. This action will notify the student.">
                  <button className="btn btn-danger" disabled={!!busyAction || !canManageAppointment} onClick={onDelete}>
                    {event.entityType === "booking_request" ? "Delete / Reject Request" : "Cancel Booking"}
                  </button>
                </Tooltip>
              </>
            ) : null}
          </div>
          <div className="dialog-footer-right">
            {matchedCustomer ? (
              <Tooltip content="Open the linked customer profile in the customer directory.">
                <button type="button" className="btn btn-secondary" onClick={onOpenMatchedCustomer}>
                  Open Customer
                </button>
              </Tooltip>
            ) : null}
            {activeTab === 'appointment' ? (
              <>
                <Tooltip content="Save edits to booking details, schedule, and notes.">
                  <button className="btn btn-primary" disabled={!!busyAction || !canManageAppointment} onClick={onSave}>
                    {busyAction === 'save' ? 'Saving...' : 'Save Changes'}
                  </button>
                </Tooltip>
                {/* RATIONALE: Requests can be 'Approved' to create a Booking linked to a Teacher/Room. */}
                {event.status === 'pending' && canApproveRequest && (
                  <Tooltip content="Approve this pending request and convert it into a confirmed booking.">
                    <button className="btn btn-primary" disabled={!!busyAction} onClick={() => onPerformAction('approve')}>
                      Approve Request
                    </button>
                  </Tooltip>
                )}
                {/* RATIONALE: A pending request with no free slot can be parked on the waitlist
                    instead of being approved/rejected, keeping it visible for later promotion. */}
                {event.entityType === "booking_request" && event.status === 'pending' && canManageAppointment && (
                  <Tooltip content="Park this request on the waitlist. It stays visible and can be promoted to a booking when a slot frees up.">
                    <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => onPerformAction('waitlist')}>
                      Waitlist
                    </button>
                  </Tooltip>
                )}
                {/* RATIONALE: A waitlisted request is promoted to a confirmed booking, reusing the
                    same booking-creation path as approval. */}
                {event.entityType === "booking_request" && event.status === 'waitlisted' && canManageAppointment && (
                  <Tooltip content="Promote this waitlisted request into a confirmed booking and notify the student.">
                    <button className="btn btn-primary" disabled={!!busyAction} onClick={() => onPerformAction('promote')}>
                      Promote to Booking
                    </button>
                  </Tooltip>
                )}
              </>
            ) : activeTab === "lesson-plan" ? (
              <>
                <Tooltip content="Return to appointment details and actions.">
                  <button className="btn btn-secondary" onClick={() => setActiveTab("appointment")}>
                    Back to Appointment
                  </button>
                </Tooltip>
                {lessonPlanDialogProps.draft ? (
                  <Tooltip content="Clear this booking lesson plan and return the tab to its empty start state.">
                    <button
                      className="btn btn-danger"
                      disabled={!canManageAppointment || lessonPlanDialogProps.saving}
                      onClick={lessonPlanDialogProps.onClearLessonPlan}
                    >
                      Clear Lesson Plan
                    </button>
                  </Tooltip>
                ) : null}
                {lessonPlanDialogProps.draft ? (
                  <Tooltip content="Save this lesson plan to the selected booking.">
                    <button
                      className="btn btn-primary"
                      disabled={!canManageAppointment || lessonPlanDialogProps.saving}
                      onClick={lessonPlanDialogProps.onSave}
                    >
                      {lessonPlanDialogProps.saving
                        ? "Saving..."
                        : lessonPlanDialogProps.lessonPlan
                          ? "Save Lesson Plan"
                          : "Create Lesson Plan"}
                    </button>
                  </Tooltip>
                ) : null}
              </>
            ) : (
              <Tooltip content="Return to appointment details and actions.">
                <button className="btn btn-secondary" onClick={() => setActiveTab("appointment")}>
                  Back to Appointment
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      }
    >
      {/* 
          Main Nav Tabs
          RATIONALE: We separate 'Appointment' from 'Communication' to keep 
          the form clean while still providing deep history access. 
      */}
      <AdminTabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        className="dialog-tabs dialog-tabs-booking"
        listClassName="dialog-tabs-left"
        items={[
          {
            key: "appointment",
            label: "Appointment",
            tooltip: "View and edit appointment details for this booking."
          },
          {
            key: "emails",
            label: "Communication",
            tooltip: "View email history and send a custom message to the student.",
            disabled: !canManageAppointment
          },
          {
            key: "materials",
            label: "Learning Materials",
            tooltip: "View and manage learning materials for this booking.",
            disabled: !canManageAppointment
          },
          {
            key: "lesson-plan",
            label: "Lesson Plan",
            tooltip: "Create and edit the lesson plan snapshot attached to this booking.",
            disabled: !canManageAppointment || event.entityType !== "booking"
          }
        ]}
      />

      <div className={tabBodyClassName} ref={tabContentRef}>
          {activeTab === 'appointment' ? (
            <div className="dialog-layout customer-tab-panel booking-appointment-panel">
              {/* SECTION: CUSTOMER INFORMATION */}
              <div className="dialog-col">
                <div className="dialog-section-heading">
                  <h3 className="manual-section-title">Customer Details</h3>
                  {customerLookup.status === "loading" ? (
                    <span className="helper-text">
                      Searching customer database...
                    </span>
                  ) : customerLookup.status === "linked" ? (
                    <span className="helper-text">
                      Booking request is linked to an existing customer.
                    </span>
                  ) : customerLookup.status === "exact_match" ? (
                    <span className="helper-text">
                      Existing customer found in the database.
                    </span>
                  ) : customerLookup.status === "possible_match" ? (
                    <span className="helper-text">
                      Possible customer match found in the database.
                    </span>
                  ) : customerLookup.status === "no_match" ? (
                    <span className="helper-text">
                      No existing customer found for these details.
                    </span>
                  ) : customerLookup.status === "error" ? (
                    <span className="helper-text">
                      {customerLookup.message || "Customer lookup is currently unavailable."}
                    </span>
                  ) : null}
                </div>
                
                {matchedCustomer && (customerLookup.status === "linked" || customerLookup.status === "exact_match" || customerLookup.status === "possible_match") && (
                  <AdminCard
                    ghost
                    className={`booking-customer-match-card${customerLookup.status === "possible_match" ? " booking-customer-match-card-heuristic" : ""}`}
                  >
                    <div className="booking-customer-match-summary">
                      <strong>{matchedCustomer.fullName}</strong>
                      <span>{matchedCustomer.email}</span>
                      <span>{matchedCustomer.phone}</span>
                    </div>
                    <div className="button-row">
                      {customerLookup.status !== "linked" ? (
                        <button type="button" className="btn btn-secondary" onClick={onApplyMatchedCustomer}>
                          Use Existing Customer
                        </button>
                      ) : null}
                      <Tooltip content="Open the matched customer profile in the customer directory.">
                        <button type="button" className="btn btn-secondary" onClick={onOpenMatchedCustomer}>
                          Open Customer
                        </button>
                      </Tooltip>
                      {customerLookup.status !== "linked" ? (
                        <Tooltip content="Ignore the suggested profile match and keep this request as standalone details.">
                          <button type="button" className="btn btn-secondary" onClick={onDismissMatchedCustomer}>
                            Keep Booking-Only Details
                          </button>
                        </Tooltip>
                      ) : null}
                    </div>
                  </AdminCard>
                )}

                <AdminForm className="dialog-form-grid">
                  <AdminField label="First Name" tooltip="Student's legal or preferred first name.">
                    <input value={dialogForm.firstName} onChange={e => updateForm({ firstName: e.target.value })} />
                  </AdminField>
                  <AdminField label="Last Name" tooltip="Student's family name.">
                    <input value={dialogForm.lastName} onChange={e => updateForm({ lastName: e.target.value })} />
                  </AdminField>
                  <AdminField label="Email" tooltip="Primary email address for communication and portal login.">
                    <input value={dialogForm.email} onChange={e => updateForm({ email: e.target.value })} />
                  </AdminField>
                  <AdminField label="Phone" tooltip="Contact phone number (10 digits).">
                    <input value={dialogForm.phone} maxLength={10} onChange={e => updateForm({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                  </AdminField>
                  
                  {/* UX: Address predictive search for lesson travel or billing accuracy. */}
                  <div className="admin-address-search-row">
                     <AddressAutocomplete 
                        onAddressSelect={(addr) => updateForm({ ...addr, state: toAuState(addr.state) })} 
                        disabled={!!busyAction} 
                     />
                  </div>
                  
                  <AdminField label="Unit" tooltip="Unit or apartment number (optional).">
                    <input value={dialogForm.unitNumber} onChange={e => updateForm({ unitNumber: e.target.value })} />
                  </AdminField>
                  <AdminField label="House #" tooltip="Street or house number.">
                    <input value={dialogForm.houseNumber} onChange={e => updateForm({ houseNumber: e.target.value })} />
                  </AdminField>
                  <AdminField label="Street Name" tooltip="Name of the street.">
                    <input value={dialogForm.streetName} onChange={e => updateForm({ streetName: e.target.value })} />
                  </AdminField>
                  <AdminField label="Street Type" tooltip="Type of street (e.g., Road, Avenue).">
                    <select value={dialogForm.streetType} onChange={e => updateForm({ streetType: e.target.value })}>
                      {STREET_TYPES.map((streetType) => (
                        <option key={streetType} value={streetType}>{streetType}</option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminField label="Suburb" tooltip="City or suburb name.">
                    <input value={dialogForm.suburb} onChange={e => updateForm({ suburb: e.target.value })} />
                  </AdminField>
                  <AdminField label="State" tooltip="Australian state or territory.">
                    <select value={dialogForm.state} onChange={e => updateForm({ state: e.target.value })}>
                      {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </AdminField>
                  <AdminField label="Postcode" tooltip="4-digit postal code.">
                    <input value={dialogForm.postcode} maxLength={4} onChange={e => updateForm({ postcode: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                  </AdminField>
                </AdminForm>

                {/* SECTION: LESSON LOGISTICS */}
                <h3 className="manual-section-title booking-section-title">Lesson Config</h3>
                <AdminForm className="dialog-form-grid">
                  <AdminField label="Start Time" tooltip="The date and time this lesson is scheduled to begin.">
                    <input type="datetime-local" value={dialogForm.startAtLocal} onChange={e => updateForm({ startAtLocal: e.target.value })} />
                  </AdminField>
                  <AdminField label="Mode" tooltip="Physical location or virtual format of the lesson.">
                    <select value={dialogForm.lessonMode} onChange={e => updateForm({ lessonMode: e.target.value })}>
                      <option value="in_person">In-person</option>
                      <option value="video">Video</option>
                    </select>
                  </AdminField>
                  <AdminField label="Skill Level" tooltip="The student's current proficiency level.">
                    <select value={dialogForm.skillLevel} onChange={e => updateForm({ skillLevel: e.target.value })}>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </AdminField>
                  <AdminField label="Assigned Teacher" tooltip="Teacher responsible for this lesson.">
                    {canEditTeacherAssignment ? (
                      <select value={dialogForm.assignedTeacherId} onChange={e => updateForm({ assignedTeacherId: e.target.value })}>
                        <option value="">Unassigned</option>
                        {teacherOptions.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.displayName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={teacherOptions.find((teacher) => teacher.id === dialogForm.assignedTeacherId)?.displayName || "Unassigned"} readOnly />
                    )}
                  </AdminField>
                  <AdminField label="Duration" tooltip="Length of the lesson in minutes.">
                    <select value={dialogForm.durationChoice} onChange={e => updateForm({ durationChoice: e.target.value })}>
                      {!durationIsConfigured ? (
                        <option value={dialogForm.durationChoice}>{dialogForm.durationChoice} minutes (unconfigured)</option>
                      ) : null}
                      {lessonDurationOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                </AdminForm>
                {!durationIsConfigured ? (
                  <p className="helper-text">
                    This booking uses a duration that is not configured in Lesson Info / Prices. Add it in settings or change the booking to a configured duration before saving.
                  </p>
                ) : null}

                {/* SECTION: ATTENDANCE — only for confirmed lessons that have already started. */}
                {event.entityType === "booking" &&
                event.status === "approved" &&
                new Date(event.startAt).getTime() < Date.now() ? (
                  <>
                    <h3 className="manual-section-title booking-section-title">Attendance</h3>
                    <div className="booking-attendance-control" role="group" aria-label="Lesson attendance">
                      <Tooltip content="Mark this lesson as attended by the student.">
                        <button
                          type="button"
                          className={`btn ${event.attendanceStatus === "attended" ? "btn-primary is-attended-active" : "btn-secondary"}`}
                          disabled={!canManageAppointment || busyAction === "set_attendance:attended"}
                          aria-pressed={event.attendanceStatus === "attended"}
                          onClick={() => onPerformAction("set_attendance:attended")}
                        >
                          Attended
                        </button>
                      </Tooltip>
                      <Tooltip content="Mark this lesson as a no-show. Cancellation fees may still apply.">
                        <button
                          type="button"
                          className={`btn ${event.attendanceStatus === "no_show" ? "btn-danger" : "btn-secondary"}`}
                          disabled={!canManageAppointment || busyAction === "set_attendance:no_show"}
                          aria-pressed={event.attendanceStatus === "no_show"}
                          onClick={() => onPerformAction("set_attendance:no_show")}
                        >
                          No-show
                        </button>
                      </Tooltip>
                      {event.attendanceStatus ? (
                        <Tooltip content="Clear the recorded attendance for this lesson.">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={!canManageAppointment || busyAction === "set_attendance:clear"}
                            onClick={() => onPerformAction("set_attendance:clear")}
                          >
                            Clear
                          </button>
                        </Tooltip>
                      ) : null}
                    </div>
                    {!event.attendanceStatus ? (
                      <p className="helper-text">Attendance has not been recorded for this lesson yet.</p>
                    ) : null}
                  </>
                ) : null}
              </div>

              {/* SECTION: NOTES & DOMAIN ACTIONS */}
              <div className="dialog-col is-notes">
                <h3 className="manual-section-title">Notes & Actions</h3>
                <AdminField label="Lesson notes" tooltip="Internal notes about the student's progress or goals. Visible to the student in their portal.">
                  <div className="booking-notes-editor">
                    <TipTapEditor
                      content={dialogForm.notesContent}
                      onUpdate={(json) => updateForm({ notesContent: json })}
                      extensions={bookingNotesExtensions}
                      imageUploadTarget={
                        event.entityType === "booking"
                          ? { entityType: "booking", id: event.id }
                          : { entityType: "booking_request", id: event.id }
                      }
                    />
                  </div>
                </AdminField>
              </div>
            </div>
          ) : activeTab === 'emails' ? (
            <AdminEmailPanel
              emptyLabel="No emails recorded."
              history={emailHistory}
              historyWarning={emailHistoryWarning}
              loadingHistory={loadingEmailHistory}
              subject={emailSubject}
              setSubject={setEmailSubject}
              message={emailMessage}
              setMessage={setEmailMessage}
              sending={sendingEmail}
              syncing={syncingEmail}
              onSend={onSendEmail}
              onSync={onSyncEmail}
              panelClassName="booking-email-panel"
              historyClassName="booking-email-history-card"
              historyListClassName="email-history-list"
              historyItemClassName="booking-email-history-item"
              composerCardClassName="booking-email-composer-card"
              composerFormClassName="form-grid customer-email-composer-form"
              messageClassName="dialog-notes booking-email-message-area"
              messagePlaceholder="Type message here..."
              captchaIdPrefix="booking-email"
              renderHistoryHeader={(email) => (
                <div className="email-history-header booking-email-history-header">
                  <strong>{email.subject}</strong>
                  <span className={`status-badge status-${email.status.toLowerCase()}`}>{email.status}</span>
                </div>
              )}
              renderHistoryMeta={(email) => (
                <div className="email-history-meta booking-email-history-meta">
                  {formatDateTime(email.createdAt)}
                  <span className="email-direction-tag"> · {email.direction === "inbound" ? "Inbound" : "Outbound"}</span>
                  {email.provider ? <span className="email-provider-tag"> · {email.provider.toUpperCase()}</span> : null}
                  {getEmailSourceLabel(email.source) ? (
                    <span className="email-source-tag"> · {getEmailSourceLabel(email.source)}</span>
                  ) : null}
                  {email.error ? <span className="booking-email-history-error">· {email.error}</span> : null}
                </div>
              )}
            />
        ) : activeTab === 'materials' ? (
            <>
              {/* SECTION: LEARNING MATERIALS */}
              <BookingMaterialsDialog
                materialsLoading={materialsDialogProps.materialsLoading}
                materialsList={materialsDialogProps.materialsList}
                materialsUploading={materialsDialogProps.materialsUploading}
                materialsDeletingId={materialsDialogProps.materialsDeletingId}
                uploadFormRef={materialsDialogProps.uploadFormRef}
                onUpload={materialsDialogProps.onUpload}
                onDelete={materialsDialogProps.onDelete}
                bookingField={materialsDialogProps.bookingField}
                folderField={materialsDialogProps.folderField}
                folderActions={materialsDialogProps.folderActions}
              />
            </>
        ) : activeTab === 'lesson-plan' ? (
            <BookingLessonPlanPanelV2
              lessonPlan={lessonPlanDialogProps.lessonPlan}
              draft={lessonPlanDialogProps.draft}
              loading={lessonPlanDialogProps.loading}
              templates={lessonPlanDialogProps.templates}
              templatesLoading={lessonPlanDialogProps.templatesLoading}
              materials={lessonPlanDialogProps.materials}
              templateSelection={lessonPlanDialogProps.templateSelection}
              canManageLessonPlan={canManageAppointment}
              bookingId={event.entityType === "booking" ? event.id : null}
              onTemplateSelectionChange={lessonPlanDialogProps.onTemplateSelectionChange}
              onCreateFromScratch={lessonPlanDialogProps.onCreateFromScratch}
              onApplyTemplate={lessonPlanDialogProps.onApplyTemplate}
              onDraftSectionsChange={lessonPlanDialogProps.onDraftSectionsChange}
              onDraftStatusChange={lessonPlanDialogProps.onDraftStatusChange}
            />
          ) : null}
      </div>
    </AppDialog>
    </>
  );
}
