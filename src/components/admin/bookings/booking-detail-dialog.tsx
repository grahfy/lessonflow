"use client";

import { RefObject, ReactNode, useState } from "react";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { formatDateTime, formatBytes } from "@/lib/admin/formatters";
import { type BookingEvent } from "@/lib/admin/use-bookings";
import { type EmailRecord } from "@/lib/admin/use-email-history";
import { type LearningMaterialRow, AU_STATES } from "@/lib/admin/types";

interface BookingDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  event: BookingEvent | null;
  dialogForm: any;
  setDialogForm: (form: any) => void;
  busyAction: string | null;
  onSave: () => void;
  onDelete: () => void;
  onMove: () => void;
  
  // Tabs
  activeTab: "appointment" | "emails";
  setActiveTab: (tab: "appointment" | "emails") => void;

  // Customer
  selectedCustomer: any;
  isEditingCustomer: boolean;
  setIsEditingCustomer: (editing: boolean) => void;
  onEditCustomer: () => void;

  // Email
  emailHistory: ReadonlyArray<EmailRecord>;
  loadingEmailHistory: boolean;
  sendingEmail: boolean;
  emailSubject: string;
  setEmailSubject: (val: string) => void;
  emailMessage: string;
  setEmailMessage: (val: string) => void;
  onSendEmail: () => void;

  // Additional Actions
  onPerformAction: (action: string) => void;
  onOpenMaterials: () => void;
  onOpenInvoice: () => void;
}

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
  selectedCustomer,
  isEditingCustomer,
  setIsEditingCustomer,
  onEditCustomer,
  emailHistory,
  loadingEmailHistory,
  sendingEmail,
  emailSubject,
  setEmailSubject,
  emailMessage,
  setEmailMessage,
  onSendEmail,
  onPerformAction,
  onOpenMaterials,
  onOpenInvoice
}: BookingDetailDialogProps) {
  if (!event || !dialogForm) return null;

  const updateForm = (patch: any) => setDialogForm({ ...dialogForm, ...patch });

  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      rootRef={rootRef}
      title={event.entityType === 'booking' ? "Edit Booking" : "Booking Request"}
      description={`Status: ${event.status} / Type: ${event.entityType === 'booking' ? "Confirmed" : "Request"}`}
      wide
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeTab === 'appointment' ? (
              <>
                <button className="btn btn-primary" disabled={!!busyAction} onClick={onSave}>
                  {busyAction === 'save' ? 'Saving...' : 'Save Changes'}
                </button>
                {event.status === 'pending' && (
                  <button className="btn btn-primary" disabled={!!busyAction} onClick={() => onPerformAction('approve')}>
                    Approve Request
                  </button>
                )}
              </>
            ) : (
              <button className="btn btn-secondary" onClick={() => setActiveTab('appointment')}>Back to appointment</button>
            )}
          </div>
        </div>
      }
    >
      <div className="dialog-tabs" style={{ marginBottom: '16px' }}>
        <button className={`btn ${activeTab === 'appointment' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('appointment')} style={{ borderRadius: '8px 0 0 8px', minWidth: '140px' }}>Appointment</button>
        <button className={`btn ${activeTab === 'emails' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('emails')} style={{ borderRadius: '0 8px 8px 0', minWidth: '140px' }}>Communication</button>
      </div>

      <div className="booking-dialog-scroll">
        <div className="dialog-layout" style={{ minHeight: '650px' }}>
          {activeTab === 'appointment' ? (
            <>
              <div className="dialog-col">
                <h3 className="manual-section-title">Customer Details</h3>
                {selectedCustomer && !isEditingCustomer ? (
                  <AdminCard ghost style={{ marginBottom: '16px' }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Read-only customer</span>
                      <button type="button" className="btn btn-secondary" onClick={onEditCustomer}>Edit</button>
                    </div>
                    <AdminForm className="dialog-form-grid">
                      <AdminField label="Full Name">
                        <input value={selectedCustomer.fullName} readOnly />
                      </AdminField>
                      <AdminField label="Email">
                        <input value={selectedCustomer.email} readOnly />
                      </AdminField>
                      <AdminField label="Phone">
                        <input value={selectedCustomer.phone} readOnly />
                      </AdminField>
                      <AdminField label="Address" fullWidth>
                        <input value={selectedCustomer.address || ""} readOnly />
                      </AdminField>
                    </AdminForm>
                  </AdminCard>
                ) : (
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
                )}

                <h3 className="manual-section-title" style={{ marginTop: '20px' }}>Lesson Config</h3>
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
              <div className="dialog-col is-notes">
                <h3 className="manual-section-title">Notes & Actions</h3>
                <AdminField label="Lesson notes">
                  <textarea className="dialog-notes" value={dialogForm.notes} onChange={(e) => updateForm({ notes: e.target.value })} style={{ minHeight: '120px' }} />
                </AdminField>
                <div className="button-row" style={{ flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                  <button className="btn btn-secondary" onClick={onMove}>Move Lesson Time</button>
                  <button className="btn btn-secondary" onClick={onOpenMaterials}>Learning Materials</button>
                  <button className="btn btn-secondary" onClick={onOpenInvoice}>Invoice / Billing</button>
                  <button className="btn btn-danger" disabled={!!busyAction} onClick={onDelete}>Cancel Booking</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="dialog-col">
                <h3 className="manual-section-title">Email History</h3>
                <AdminCard ghost style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--line)', padding: '12px' }}>
                  {loadingEmailHistory ? (
                    <p className="helper-text">Loading history...</p>
                  ) : (
                    <div className="email-history-list">
                      {emailHistory.length === 0 ? (
                        <p className="helper-text">No emails recorded.</p>
                      ) : (
                        emailHistory.map(email => (
                          <div key={email.id} className="email-history-item" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '12px', marginBottom: '12px' }}>
                            <div className="email-history-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <strong style={{ color: 'var(--ink-0)' }}>{email.subject}</strong>
                              <span className={`status-badge status-${email.status.toLowerCase()}`}>{email.status}</span>
                            </div>
                            <div className="email-history-meta" style={{ fontSize: '0.75rem', color: 'var(--ink-2)' }}>
                              {formatDateTime(email.createdAt)}
                              {email.error && <span style={{ color: 'var(--brand-danger)', marginLeft: '8px' }}>· {email.error}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </AdminCard>
              </div>

              <div className="dialog-col is-notes">
                <h3 className="manual-section-title">Send Custom Email</h3>
                <AdminCard ghost>
                  <AdminForm>
                    <AdminField label="Subject" required fullWidth>
                      <input placeholder="Email subject..." value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                    </AdminField>
                    <AdminField label="Message" required fullWidth>
                      <textarea className="dialog-notes" placeholder="Type message here..." value={emailMessage} onChange={e => setEmailMessage(e.target.value)} style={{ minHeight: '180px' }} />
                    </AdminField>
                    <button className="btn btn-primary" disabled={sendingEmail || !emailSubject.trim() || !emailMessage.trim()} onClick={onSendEmail} style={{ width: '100%', marginTop: '8px' }}>
                      {sendingEmail ? 'Sending...' : 'Send Email'}
                    </button>
                  </AdminForm>
                </AdminCard>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminDialog>
  );
}
