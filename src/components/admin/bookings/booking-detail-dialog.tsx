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

import { RefObject, useState } from "react";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { EmailViewerDialog } from "@/components/admin/ui/email-viewer-dialog";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { formatDateTime } from "@/lib/admin/formatters";
import { type BookingEvent } from "@/lib/admin/use-bookings";
import { type EmailRecord } from "@/lib/admin/use-email-history";
import { AU_STATES } from "@/lib/admin/types";
import { toAuState } from "@/lib/admin/utils";
import { type BookingDialogForm, type BookingMatchedCustomer } from "./types";
import { AddressAutocomplete } from "@/components/admin/ui/address-autocomplete";

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
  activeTab: "appointment" | "emails";
  setActiveTab: (tab: "appointment" | "emails") => void;

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
  onSendEmail: () => void;
  onSyncEmail: () => void;

  // Domain Actions
  onPerformAction: (action: string) => void;
  onOpenMaterials: () => void;
  onOpenInvoice: () => void | Promise<void>;
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
  onOpenMaterials,
  onOpenInvoice
}: BookingDetailDialogProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);

  if (!event || !dialogForm) return null;

  /** Local helper for atomic form updates. */
  const updateForm = (patch: Partial<BookingDialogForm>) => setDialogForm({ ...dialogForm, ...patch });

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
              <>
                <Tooltip content="Send this custom email to the booking contact.">
                  <button
                    className="btn btn-primary"
                    disabled={sendingEmail || !emailSubject.trim() || !emailMessage.trim()}
                    onClick={onSendEmail}
                  >
                    {sendingEmail ? "Sending..." : "Send Email"}
                  </button>
                </Tooltip>
                <Tooltip content="Clear the current subject/message draft fields.">
                  <button
                    className="btn btn-danger"
                    disabled={sendingEmail || (!emailSubject.trim() && !emailMessage.trim())}
                    onClick={() => {
                      setEmailSubject("");
                      setEmailMessage("");
                    }}
                  >
                    Clear Draft
                  </button>
                </Tooltip>
                <Tooltip content="Return to appointment details and actions.">
                  <button className="btn btn-secondary" onClick={() => setActiveTab("appointment")}>
                    Back to Appointment
                  </button>
                </Tooltip>
              </>
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
      <div className="dialog-tabs dialog-tabs-booking">
        <div className="dialog-tabs-left">
          <Tooltip content="View and edit appointment details for this booking.">
            <button className={`btn ${activeTab === "appointment" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("appointment")}>
              Appointment
            </button>
          </Tooltip>
          <Tooltip content="View email history and send a custom message to the student.">
            <button className={`btn ${activeTab === "emails" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("emails")}>
              Communication
            </button>
          </Tooltip>
        </div>
        {matchedCustomer ? (
          <Tooltip content="Open the linked customer profile in the customer directory.">
            <button type="button" className="btn btn-secondary" onClick={onOpenMatchedCustomer}>
              Open Customer
            </button>
          </Tooltip>
        ) : null}
      </div>

      <div className="dialog-layout booking-dialog-layout">
          {activeTab === 'appointment' ? (
            <>
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
                  <AdminField label="First Name">
                    <input value={dialogForm.firstName} onChange={e => updateForm({ firstName: e.target.value })} />
                  </AdminField>
                  <AdminField label="Last Name">
                    <input value={dialogForm.lastName} onChange={e => updateForm({ lastName: e.target.value })} />
                  </AdminField>
                  <AdminField label="Email" fullWidth>
                    <input value={dialogForm.email} onChange={e => updateForm({ email: e.target.value })} />
                  </AdminField>
                  <AdminField label="Phone">
                    <input value={dialogForm.phone} maxLength={10} onChange={e => updateForm({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                  </AdminField>
                  
                  {/* UX: Address predictive search for lesson travel or billing accuracy. */}
                  <div style={{ gridColumn: "1 / -1", padding: "8px 0" }}>
                     <AddressAutocomplete 
                        onAddressSelect={(addr) => updateForm({ ...addr, state: toAuState(addr.state) })} 
                        disabled={!!busyAction} 
                     />
                  </div>
                  
                  <AdminField label="Unit">
                    <input value={dialogForm.unitNumber} onChange={e => updateForm({ unitNumber: e.target.value })} />
                  </AdminField>
                  <AdminField label="House #">
                    <input value={dialogForm.houseNumber} onChange={e => updateForm({ houseNumber: e.target.value })} />
                  </AdminField>
                  <AdminField label="Street Name">
                    <input value={dialogForm.streetName} onChange={e => updateForm({ streetName: e.target.value })} />
                  </AdminField>
                  <AdminField label="Street Type">
                    <select value={dialogForm.streetType} onChange={e => updateForm({ streetType: e.target.value })}>
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
                  </AdminField>
                  <AdminField label="Suburb">
                    <input value={dialogForm.suburb} onChange={e => updateForm({ suburb: e.target.value })} />
                  </AdminField>
                  <AdminField label="State">
                    <select value={dialogForm.state} onChange={e => updateForm({ state: e.target.value })}>
                      {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </AdminField>
                  <AdminField label="Postcode">
                    <input value={dialogForm.postcode} maxLength={4} onChange={e => updateForm({ postcode: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                  </AdminField>
                </AdminForm>

                {/* SECTION: LESSON LOGISTICS */}
                <h3 className="manual-section-title booking-section-title">Lesson Config</h3>
                <AdminForm className="dialog-form-grid">
                  <AdminField label="Start Time">
                    <input type="datetime-local" value={dialogForm.startAtLocal} onChange={e => updateForm({ startAtLocal: e.target.value })} />
                  </AdminField>
                  <AdminField label="Mode">
                    <select value={dialogForm.lessonMode} onChange={e => updateForm({ lessonMode: e.target.value })}>
                      <option value="in_person">In-person</option>
                      <option value="video">Video</option>
                    </select>
                  </AdminField>
                  <AdminField label="Skill Level">
                    <select value={dialogForm.skillLevel} onChange={e => updateForm({ skillLevel: e.target.value })}>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </AdminField>
                  <AdminField label="Duration">
                    <select value={dialogForm.durationChoice} onChange={e => updateForm({ durationChoice: e.target.value })}>
                      <option value="min30">30 minutes</option>
                      <option value="min60">60 minutes</option>
                      <option value="custom">Custom</option>
                    </select>
                  </AdminField>
                  {dialogForm.durationChoice === 'custom' && (
                    <AdminField label="Minutes">
                      <input value={dialogForm.customDurationMinutes} onChange={e => updateForm({ customDurationMinutes: e.target.value.replace(/\D/g, '') })} />
                    </AdminField>
                  )}
                </AdminForm>
              </div>

              {/* SECTION: NOTES & DOMAIN ACTIONS */}
              <div className="dialog-col is-notes">
                <h3 className="manual-section-title">Notes & Actions</h3>
                <AdminField label="Lesson notes">
                  <textarea className="dialog-notes booking-notes-area" value={dialogForm.notes} onChange={(e) => updateForm({ notes: e.target.value })} />
                </AdminField>
                <div className="button-row booking-notes-actions">
                  <Tooltip content="Reschedule the lesson to a new start time.">
                    <button className="btn btn-secondary" onClick={onMove}>Move Lesson Time</button>
                  </Tooltip>
                  <Tooltip content="Open the learning materials manager for this booking.">
                    <button className="btn btn-secondary" onClick={onOpenMaterials}>Learning Materials</button>
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
            </>
          ) : (
            <>
              {/* SECTION: COMMUNICATION HISTORY */}
              <div className="dialog-col">
                <div className="section-header-with-action">
                  <h3 className="manual-section-title">Email History</h3>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={onSyncEmail}
                    disabled={syncingEmail || loadingEmailHistory}
                  >
                    {syncingEmail ? "Syncing..." : "Sync Now"}
                  </button>
                </div>
                <AdminCard ghost className="booking-email-history-card">
                  {loadingEmailHistory ? (
                    <p className="helper-text">Loading history...</p>
                  ) : (
                    <div className="email-history-list">
                      {emailHistory.length === 0 ? (
                        <p className="helper-text">No emails recorded.</p>
                      ) : (
                        emailHistory.map(email => (
                          <div key={email.id} className="email-history-item booking-email-history-item" onClick={() => setSelectedEmail(email)} style={{ cursor: "pointer" }}>
                            <div className="email-history-header booking-email-history-header">
                              <strong>{email.subject}</strong>
                              <span className={`status-badge status-${email.status.toLowerCase()}`}>{email.status}</span>
                            </div>
                            <div className="email-history-meta booking-email-history-meta">
                              {formatDateTime(email.createdAt)}
                              {email.provider && <span className="email-provider-tag"> · {email.provider.toUpperCase()}</span>}
                              {email.source && (
                                <span className="email-source-tag">
                                  {" "}
                                  · {email.source === "app" ? "via App" : "via Gmail"}
                                </span>
                              )}
                              {email.error && <span className="booking-email-history-error">· {email.error}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </AdminCard>
              </div>

              {/* SECTION: EMAIL COMPOSER */}
              <div className="dialog-col is-notes">
                <h3 className="manual-section-title">Send Custom Email</h3>
                <AdminCard ghost className="booking-email-composer-card">
                  <AdminForm>
                    <AdminField label="Subject" required fullWidth>
                      <input placeholder="Email subject..." value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                    </AdminField>
                    <AdminField label="Message" required fullWidth>
                      <textarea className="dialog-notes booking-email-message-area" placeholder="Type message here..." value={emailMessage} onChange={e => setEmailMessage(e.target.value)} />
                    </AdminField>
                  </AdminForm>
                </AdminCard>
              </div>
            </>
          )}
      </div>
    </AdminDialog>
    
    {/* Specialized sub-dialog for viewing full HTML content of sent emails. */}
    <EmailViewerDialog
      isOpen={!!selectedEmail}
      onClose={() => setSelectedEmail(null)}
      email={selectedEmail}
    />
    </>
  );
}
