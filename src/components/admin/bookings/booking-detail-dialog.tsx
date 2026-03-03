"use client";

import { RefObject, useState } from "react";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { formatDateTime } from "@/lib/admin/formatters";
import { type BookingEvent } from "@/lib/admin/use-bookings";
import { type EmailRecord } from "@/lib/admin/use-email-history";
import { type LearningMaterialRow } from "@/lib/admin/types";

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

  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      rootRef={rootRef}
      title={event.entityType === 'booking' ? "Edit Booking" : "Booking Request"}
      description={`Status: ${event.status} / Type: ${event.entityType === 'booking' ? "Confirmed" : "Request"}`}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
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
        </>
      }
    >
      <div className="dialog-tabs">
        <button className={`tab-btn ${activeTab === 'appointment' ? 'is-active' : ''}`} onClick={() => setActiveTab('appointment')}>Appointment</button>
        <button className={`tab-btn ${activeTab === 'emails' ? 'is-active' : ''}`} onClick={() => setActiveTab('emails')}>Communication</button>
      </div>

      <div className="booking-dialog-scroll">
        <div className="dialog-layout">
          {activeTab === 'appointment' ? (
            <>
              <div className="dialog-col">
                <h4>Customer details</h4>
                {selectedCustomer && !isEditingCustomer ? (
                  <AdminCard ghost style={{ marginBottom: '16px' }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Read-only customer</span>
                      <button type="button" className="btn btn-secondary" onClick={onEditCustomer}>Edit</button>
                    </div>
                    <AdminForm className="dialog-form-grid">
                      <AdminField label="First Name">
                        <input value={selectedCustomer.firstName || selectedCustomer.fullName.split(' ')[0]} readOnly />
                      </AdminField>
                      <AdminField label="Last Name">
                        <input value={selectedCustomer.lastName || selectedCustomer.fullName.split(' ').slice(1).join(' ')} readOnly />
                      </AdminField>
                      <AdminField label="Email" fullWidth>
                        <input value={selectedCustomer.email} readOnly />
                      </AdminField>
                      <AdminField label="Phone">
                        <input value={selectedCustomer.phone} readOnly />
                      </AdminField>
                      <AdminField label="Suburb">
                        <input value={selectedCustomer.suburb} readOnly />
                      </AdminField>
                      <AdminField label="Postcode">
                        <input value={selectedCustomer.postcode} readOnly />
                      </AdminField>
                    </AdminForm>
                  </AdminCard>
                ) : (
                  <AdminForm className="dialog-form-grid">
                    <AdminField label="First Name">
                      <input value={dialogForm.firstName} onChange={e => setDialogForm({...dialogForm, firstName: e.target.value})} />
                    </AdminField>
                    <AdminField label="Last Name">
                      <input value={dialogForm.lastName} onChange={e => setDialogForm({...dialogForm, lastName: e.target.value})} />
                    </AdminField>
                    <AdminField label="Email" fullWidth>
                      <input value={dialogForm.email} onChange={e => setDialogForm({...dialogForm, email: e.target.value})} />
                    </AdminField>
                    <AdminField label="Phone">
                      <input value={dialogForm.phone} maxLength={10} onChange={e => setDialogForm({...dialogForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})} />
                    </AdminField>
                    <AdminField label="Suburb">
                      <input value={dialogForm.suburb} onChange={e => setDialogForm({...dialogForm, suburb: e.target.value})} />
                    </AdminField>
                    <AdminField label="Postcode">
                      <input value={dialogForm.postcode} maxLength={4} onChange={e => setDialogForm({...dialogForm, postcode: e.target.value.replace(/\D/g, '').slice(0, 4)})} />
                    </AdminField>
                  </AdminForm>
                )}
                <AdminForm>
                  <AdminField label="Start Time">
                    <input type="datetime-local" value={dialogForm.startAtLocal} onChange={e => setDialogForm({...dialogForm, startAtLocal: e.target.value})} />
                  </AdminField>
                </AdminForm>
              </div>
              <div className="dialog-col is-notes">
                <h4>Notes & Actions</h4>
                <AdminField label="Lesson notes">
                  <textarea className="dialog-notes" value={dialogForm.notes} onChange={e => setDialogForm({...dialogForm, notes: e.target.value})} />
                </AdminField>
                <div className="button-row" style={{ flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                  <button className="btn btn-secondary" onClick={onOpenMaterials}>Learning Materials</button>
                  <button className="btn btn-secondary" onClick={onOpenInvoice}>Invoice / Billing</button>
                  <button className="btn btn-danger" disabled={!!busyAction} onClick={onDelete}>Cancel Booking</button>
                </div>
              </div>
            </>
          ) : (
            <div className="dialog-col full">
              <h4>Email History</h4>
              {loadingEmailHistory ? (
                <p className="helper-text">Loading history...</p>
              ) : (
                <div className="email-history-list">
                  {emailHistory.length === 0 ? (
                    <p className="helper-text">No emails recorded.</p>
                  ) : (
                    emailHistory.map(email => (
                      <div key={email.id} className="email-history-item">
                        <div className="email-history-header">
                          <strong>{email.subject}</strong>
                          <span className={`status-badge status-${email.status.toLowerCase()}`}>{email.status}</span>
                        </div>
                        <div className="email-history-meta">
                          {formatDateTime(email.createdAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="email-composer" style={{ marginTop: '20px' }}>
                <h5>Send Custom Email</h5>
                <AdminForm>
                  <AdminField label="Subject">
                    <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                  </AdminField>
                  <AdminField label="Message">
                    <textarea className="dialog-notes" value={emailMessage} onChange={e => setEmailMessage(e.target.value)} />
                  </AdminField>
                  <button className="btn btn-primary" disabled={sendingEmail || !emailSubject || !emailMessage} onClick={onSendEmail}>
                    {sendingEmail ? 'Sending...' : 'Send Email'}
                  </button>
                </AdminForm>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminDialog>
  );
}
