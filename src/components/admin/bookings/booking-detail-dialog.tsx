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
 *    from `OutboundEmail` logs and optionally Gmail API) alongside a 
 *    custom composer.
 * 4. Modular Actions: Provides entry points to adjacent domains:
 *    - Invoicing (Financial)
 *    - Learning Materials (Educational)
 *    - Address Autocomplete (UX)
 */

"use client";

import { RefObject } from "react";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminEmailPanel } from "@/components/admin/ui/admin-email-panel";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { AdminTabBar } from "@/components/admin/ui/admin-tab-bar";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { STREET_TYPES } from "@/lib/admin/constants";
import { formatDateTime } from "@/lib/admin/formatters";
import { type BookingEvent } from "@/lib/admin/use-bookings";
import { type EmailRecord, type SendEmailResult } from "@/lib/admin/use-email-history";
import { AU_STATES, type LearningMaterialRow } from "@/lib/admin/types";
import { toAuState } from "@/lib/admin/utils";
import { AddressAutocomplete } from "@/components/admin/ui/address-autocomplete";

import { BookingMaterialsDialog } from "./booking-materials-dialog";
import { type BookingDialogForm, type BookingMatchedCustomer } from "./types";

interface BookingDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  event: BookingEvent | null;
  /** Current state of the editing form, extracted from the event entity. */
  dialogForm: BookingDialogForm | null;
  setDialogForm: (form: BookingDialogForm) => void;
  /** Tracks which button (Save/Approve/Invoice) is currently requesting. */
  busyAction: string | null;
  onSave: () => void;
  onDelete: () => void;
  onMove: () => void;

  // Tabs Navigation
  activeTab: "appointment" | "emails" | "materials";
  setActiveTab: (tab: "appointment" | "emails" | "materials") => void;

  // CRM Integration
  matchedCustomer: BookingMatchedCustomer | null;
  hasHeuristicMatch: boolean;
  onApplyMatchedCustomer: () => void;
  onOpenMatchedCustomer: () => void | Promise<void>;
  onDismissMatchedCustomer: () => void;

  // Communication Engine
  emailHistory: ReadonlyArray<EmailRecord>;
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
  activeTab,
  setActiveTab,
  matchedCustomer,
  hasHeuristicMatch,
  onApplyMatchedCustomer,
  onOpenMatchedCustomer,
  onDismissMatchedCustomer,
  emailHistory,
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
  materialsDialogProps
}: BookingDetailDialogProps) {
  if (!event || !dialogForm) return null;

  /** Local helper for atomic form updates. */
  const updateForm = (patch: Partial<BookingDialogForm>) => setDialogForm({ ...dialogForm, ...patch });
  const tabBodyClassName = "booking-dialog-layout";

  return (
    <>
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      rootRef={rootRef}
      id="booking-detail-dialog"
      title={event.entityType === 'booking' ? "Edit Booking" : "Booking Request"}
      description={`Status: ${event.status} / Type: ${event.entityType === 'booking' ? "Confirmed" : "Request"}`}
      wide
      bodyClassName="booking-dialog-body-lock"
      lockBodyScrollArea
      footer={
        <div className="dialog-footer-row">
          <div className="dialog-footer-left">
            <Tooltip content="Close this booking dialog without applying new changes.">
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </Tooltip>
          </div>
          <div className="dialog-footer-right">
            {activeTab === 'appointment' ? (
              <>
                <Tooltip content="Save edits to booking details, schedule, and notes.">
                  <button className="btn btn-primary" disabled={!!busyAction} onClick={onSave}>
                    {busyAction === 'save' ? 'Saving...' : 'Save Changes'}
                  </button>
                </Tooltip>
                {/* RATIONALE: Requests can be 'Approved' to create a Booking linked to a Teacher/Room. */}
                {event.status === 'pending' && (
                  <Tooltip content="Approve this pending request and convert it into a confirmed booking.">
                    <button className="btn btn-primary" disabled={!!busyAction} onClick={() => onPerformAction('approve')}>
                      Approve Request
                    </button>
                  </Tooltip>
                )}
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
            tooltip: "View email history and send a custom message to the student."
          },
          {
            key: "materials",
            label: "Learning Materials",
            tooltip: "View and manage learning materials for this booking."
          }
        ]}
        rightSlot={
          matchedCustomer ? (
            <Tooltip content="Open the linked customer profile in the customer directory.">
              <button type="button" className="btn btn-secondary" onClick={onOpenMatchedCustomer}>
                Open Customer
              </button>
            </Tooltip>
          ) : null
        }
      />

      <div className={tabBodyClassName}>
          {activeTab === 'appointment' ? (
            <div className="dialog-layout customer-tab-panel booking-appointment-panel">
              {/* SECTION: CUSTOMER INFORMATION */}
              <div className="dialog-col">
                <div className="dialog-section-heading">
                  <h3 className="manual-section-title">Customer Details</h3>
                  {matchedCustomer ? (
                    <span className="helper-text">
                      {hasHeuristicMatch ? "Possible customer match found." : "Booking is linked to an existing customer."}
                    </span>
                  ) : null}
                </div>
                
                {/* RATIONALE: Prompting the admin to link a request to a profile 
                    early ensures data deduplication. */}
                {hasHeuristicMatch && matchedCustomer && (
                  <AdminCard
                    ghost
                    className="booking-customer-match-card booking-customer-match-card-heuristic"
                  >
                    <div className="button-row">
                      <button type="button" className="btn btn-secondary" onClick={onApplyMatchedCustomer}>
                        Use Matched Customer
                      </button>
                      <Tooltip content="Ignore the suggested profile match and keep this booking as standalone details.">
                        <button type="button" className="btn btn-secondary" onClick={onDismissMatchedCustomer}>
                          Keep Booking-Only Details
                        </button>
                      </Tooltip>
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
                  <AdminField label="Email" tooltip="Primary email address for communication and portal login." fullWidth>
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
                  <AdminField label="Duration" tooltip="Length of the lesson in minutes.">
                    <select value={dialogForm.durationChoice} onChange={e => updateForm({ durationChoice: e.target.value })}>
                      <option value="min30">30 minutes</option>
                      <option value="min60">60 minutes</option>
                      <option value="custom">Custom</option>
                    </select>
                  </AdminField>
                  {dialogForm.durationChoice === 'custom' && (
                    <AdminField label="Minutes" tooltip="Custom duration in minutes.">
                      <input value={dialogForm.customDurationMinutes} onChange={e => updateForm({ customDurationMinutes: e.target.value.replace(/\D/g, '') })} />
                    </AdminField>
                  )}
                </AdminForm>
              </div>

              {/* SECTION: NOTES & DOMAIN ACTIONS */}
              <div className="dialog-col is-notes">
                <h3 className="manual-section-title">Notes & Actions</h3>
                <AdminField label="Lesson notes" tooltip="Internal notes about the student's progress or goals.">
                  <textarea className="dialog-notes booking-notes-area" value={dialogForm.notes} onChange={(e) => updateForm({ notes: e.target.value })} />
                </AdminField>
                <div className="button-row booking-notes-actions">
                  <Tooltip content="Reschedule the lesson to a new start time.">
                    <button className="btn btn-secondary" onClick={onMove}>Move Lesson Time</button>
                  </Tooltip>

                  {/* RATIONALE: Invoicing is only available once a Request is converted to a Booking. */}
                  {event.entityType === "booking" && (
                    <Tooltip content="Create or open a draft invoice linked to this booking.">
                      <button className="btn btn-secondary" disabled={busyAction === "invoice"} onClick={onOpenInvoice}>
                        {busyAction === "invoice" ? "Creating Invoice..." : "Invoice / Billing"}
                      </button>
                    </Tooltip>
                  )}

                  <Tooltip content="Cancel this booking. This action will notify the student.">
                    <button className="btn btn-danger" disabled={!!busyAction} onClick={onDelete}>Cancel Booking</button>
                  </Tooltip>
                </div>
              </div>
            </div>
          ) : activeTab === 'emails' ? (
            <AdminEmailPanel
              emptyLabel="No emails recorded."
              history={emailHistory}
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
                  {email.provider ? <span className="email-provider-tag"> · {email.provider.toUpperCase()}</span> : null}
                  {email.source ? (
                    <span className="email-source-tag"> · {email.source === "app" ? "via App" : "via Gmail"}</span>
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
              />
            </>
          ) : null}
      </div>
    </AdminDialog>
    </>
  );
}
