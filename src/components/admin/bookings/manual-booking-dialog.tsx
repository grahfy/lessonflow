"use client";

import { RefObject } from "react";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { type ManualStep, MANUAL_STEP_LABEL } from "@/lib/admin/types";

interface ManualBookingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  step: ManualStep;
  setStep: (step: ManualStep) => void;
  customerQuery: string;
  setCustomerQuery: (query: string) => void;
  customerOptions: any[];
  selectedCustomer: any;
  setSelectedCustomer: (customer: any) => void;
  onSave: () => void;
  busyAction: string | null;
}

export function ManualBookingDialog({
  isOpen,
  onClose,
  rootRef,
  step,
  setStep,
  customerQuery,
  setCustomerQuery,
  customerOptions,
  selectedCustomer,
  setSelectedCustomer,
  onSave,
  busyAction
}: ManualBookingDialogProps) {
  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      rootRef={rootRef}
      title="Add Manual Booking"
      description={`Step: ${MANUAL_STEP_LABEL[step]}`}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {step === 'schedule' ? (
            <button className="btn btn-primary" disabled={!!busyAction} onClick={onSave}>
              Create Booking
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => {
              if (step === 'customer') setStep('lesson');
              else if (step === 'lesson') setStep('schedule');
            }}>Next</button>
          )}
        </>
      }
    >
      <div className="manual-booking-scroll">
        {step === 'customer' && (
          <div className="manual-step-container">
            <h4>Select or Create Customer</h4>
            <AdminForm>
              <AdminField label="Search existing students">
                <input 
                  value={customerQuery} 
                  onChange={e => setCustomerQuery(e.target.value)} 
                  placeholder="Name, email or phone..."
                />
              </AdminField>
            </AdminForm>
            
            <div className="customer-selection-list" style={{ marginTop: '16px', maxHeight: '300px', overflowY: 'auto' }}>
              {customerOptions.filter(c => 
                c.fullName.toLowerCase().includes(customerQuery.toLowerCase()) ||
                c.email.toLowerCase().includes(customerQuery.toLowerCase())
              ).map(c => (
                <div 
                  key={c.id} 
                  className={`customer-select-item ${selectedCustomer?.id === c.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedCustomer(c)}
                  style={{ padding: '10px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                >
                  <strong>{c.fullName}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--ink-2)' }}>{c.email}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lesson and Schedule steps would follow similar patterns */}
        {step === 'lesson' && (
          <div className="manual-step-container">
            <h4>Lesson Details</h4>
            <p className="helper-text">Configure lesson mode and duration.</p>
            {/* ... */}
          </div>
        )}

        {step === 'schedule' && (
          <div className="manual-step-container">
            <h4>Schedule & Confirm</h4>
            <p className="helper-text">Pick a time and confirm.</p>
            {/* ... */}
          </div>
        )}
      </div>
    </AdminDialog>
  );
}
