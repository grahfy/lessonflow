"use client";

import { RefObject } from "react";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { type ManualStep, MANUAL_STEP_LABEL, MANUAL_STEP_ORDER, AU_STATES } from "@/lib/admin/types";
import { type BookingMatchedCustomer } from "./types";

interface ManualBookingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  formRef: RefObject<HTMLFormElement | null>;
  step: ManualStep;
  setStep: (step: ManualStep) => void;
  customerQuery: string;
  setCustomerQuery: (query: string) => void;
  customerOptions: BookingMatchedCustomer[];
  manualCustomerId: string;
  setManualCustomerId: (id: string) => void;
  onApplyCustomer: (customer: BookingMatchedCustomer) => void;
  onClearCustomer: () => void;
  updateCustomerFromBooking: boolean;
  setUpdateCustomerFromBooking: (val: boolean) => void;
  durationChoice: string;
  setDurationChoice: (val: string) => void;
  manualMatch: BookingMatchedCustomer | null;
  onResolveMatch: (resolution: "use_existing" | "update_existing" | "create_new") => void;
  onSave: () => void;
  busyAction: string | null;
}

function toDigits(val: string, max: number) {
  return val.replace(/\D/g, "").slice(0, max);
}

export function ManualBookingDialog({
  isOpen,
  onClose,
  rootRef,
  formRef,
  step,
  setStep,
  customerQuery,
  setCustomerQuery,
  customerOptions,
  manualCustomerId,
  setManualCustomerId,
  onApplyCustomer,
  onClearCustomer,
  updateCustomerFromBooking,
  setUpdateCustomerFromBooking,
  durationChoice,
  setDurationChoice,
  manualMatch,
  onResolveMatch,
  onSave,
  busyAction
}: ManualBookingDialogProps) {
  const stepIndex = MANUAL_STEP_ORDER.indexOf(step);

  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      rootRef={rootRef}
      title="Add Manual Booking"
      wide
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div>
            {step !== 'customer' && (
              <button className="btn btn-secondary" onClick={() => setStep(MANUAL_STEP_ORDER[stepIndex - 1])}>Back</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            {step === 'schedule' ? (
              <button className="btn btn-primary" disabled={!!busyAction} onClick={onSave}>
                {busyAction === 'create' ? 'Adding...' : 'Add booking'}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setStep(MANUAL_STEP_ORDER[stepIndex + 1])}>
                Next: {MANUAL_STEP_LABEL[MANUAL_STEP_ORDER[stepIndex + 1]]}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="manual-steps" style={{ marginBottom: '24px' }}>
        {MANUAL_STEP_ORDER.map((s, idx) => (
          <div
            key={s}
            className={`manual-step-chip ${idx === stepIndex ? "is-active" : ""} ${idx < stepIndex ? "is-complete" : ""}`}
          >
            <span>{idx + 1}</span>
            <strong>{MANUAL_STEP_LABEL[s]}</strong>
          </div>
        ))}
      </div>

      <form ref={formRef} onSubmit={e => e.preventDefault()}>
        <div className="manual-booking-scroll" style={{ display: step === "customer" ? "block" : "none" }} aria-hidden={step !== "customer"}>
            <h3 className="manual-section-title">Customer Selection</h3>
            <AdminForm className="manual-grid manual-grid-3">
              <AdminField label="Search existing students">
                <input 
                  value={customerQuery} 
                  onChange={e => setCustomerQuery(e.target.value)} 
                  placeholder="Filter by name, email, or phone..."
                />
              </AdminField>
              <AdminField label="Select from list" className="manual-span-2">
                <select 
                  value={manualCustomerId} 
                  onChange={e => {
                    const cid = e.target.value;
                    setManualCustomerId(cid);
                    const selected = customerOptions.find(c => c.id === cid);
                    if (selected) onApplyCustomer(selected);
                  }}
                >
                  <option value="">-- Choose student (optional) --</option>
                  {customerOptions.filter(c => 
                    c.fullName.toLowerCase().includes(customerQuery.toLowerCase()) ||
                    c.email.toLowerCase().includes(customerQuery.toLowerCase()) ||
                    c.phone?.includes(customerQuery)
                  ).map(c => (
                    <option key={c.id} value={c.id}>{c.fullName} · {c.email}</option>
                  ))}
                </select>
              </AdminField>
              <div className="field manual-span-3">
                <label className="helper-toggle">
                  <input
                    type="checkbox"
                    checked={updateCustomerFromBooking}
                    onChange={(e) => setUpdateCustomerFromBooking(e.target.checked)}
                  />{" "}
                  Update linked customer profile from this booking
                </label>
                {manualCustomerId && (
                  <div style={{ marginTop: "8px" }}>
                    <button type="button" className="btn btn-secondary" onClick={onClearCustomer}>
                      Clear selected customer
                    </button>
                  </div>
                )}
              </div>
            </AdminForm>

            <h3 className="manual-section-title" style={{ marginTop: '24px' }}>Student Details</h3>
            <AdminForm className="manual-grid manual-grid-2">
              <AdminField label="First Name" required>
                <input name="firstName" required />
              </AdminField>
              <AdminField label="Last Name" required>
                <input name="lastName" required />
              </AdminField>
              <AdminField label="Email" required>
                <input name="email" type="email" required />
              </AdminField>
              <AdminField label="Phone" required>
                <input name="phone" required maxLength={10} onInput={e => e.currentTarget.value = toDigits(e.currentTarget.value, 10)} />
              </AdminField>
            </AdminForm>

            <h3 className="manual-section-title" style={{ marginTop: '24px' }}>Address</h3>
            <AdminForm className="manual-grid manual-grid-3">
              <AdminField label="Unit">
                <input name="unitNumber" maxLength={5} onInput={e => e.currentTarget.value = toDigits(e.currentTarget.value, 5)} />
              </AdminField>
              <AdminField label="House Number" required>
                <input name="houseNumber" required maxLength={5} onInput={e => e.currentTarget.value = toDigits(e.currentTarget.value, 5)} />
              </AdminField>
              <AdminField label="Street Type" required>
                <select name="streetType" required defaultValue="Street">
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
              <AdminField label="Street Name" required className="manual-span-2">
                <input name="streetName" required />
              </AdminField>
              <AdminField label="Suburb" required>
                <input name="suburb" required />
              </AdminField>
              <AdminField label="State" required className="manual-span-2">
                <select name="state" required defaultValue="VIC">
                  {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </AdminField>
              <AdminField label="Postcode" required>
                <input name="postcode" required maxLength={4} onInput={e => e.currentTarget.value = toDigits(e.currentTarget.value, 4)} />
              </AdminField>
            </AdminForm>
          </div>

        <div className="manual-booking-scroll" style={{ display: step === "lesson" ? "block" : "none" }} aria-hidden={step !== "lesson"}>
            <h3 className="manual-section-title">Lesson Details</h3>
            <AdminForm className="manual-grid manual-grid-3">
              <AdminField label="Mode" required>
                <select name="lessonMode" defaultValue="in_person">
                  <option value="in_person">In-person</option>
                  <option value="video">Video</option>
                </select>
              </AdminField>
              <AdminField label="Skill Level" required>
                <select name="skillLevel" defaultValue="beginner">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </AdminField>
              <AdminField label="Duration" required>
                <select
                  name="lessonDuration"
                  value={durationChoice}
                  onChange={(e) => setDurationChoice(e.target.value)}
                >
                  <option value="min30">30 minutes</option>
                  <option value="min60">60 minutes</option>
                  <option value="custom">Other amount</option>
                </select>
              </AdminField>
              {durationChoice === "custom" && (
                <AdminField label="Custom Minutes" required>
                  <input name="customDurationMinutes" required maxLength={3} onInput={e => e.currentTarget.value = toDigits(e.currentTarget.value, 3)} />
                </AdminField>
              )}
            </AdminForm>
          </div>

        <div className="manual-booking-scroll" style={{ display: step === "schedule" ? "block" : "none" }} aria-hidden={step !== "schedule"}>
            <h3 className="manual-section-title">Schedule & Confirm</h3>
            <AdminForm className="manual-grid manual-grid-2">
              <AdminField label="Start Time" required>
                <input name="requestedStartAt" type="datetime-local" required />
              </AdminField>
              <AdminField label="Weekly Recurring">
                <div style={{ display: 'flex', alignItems: 'center', height: '40px' }}>
                  <input type="checkbox" name="isRecurring" style={{ width: 'auto', margin: 0 }} />
                </div>
              </AdminField>
              <AdminField label="Recurrence End (Optional)">
                <input name="recurrenceEndAt" type="datetime-local" />
              </AdminField>
            </AdminForm>

            {manualMatch && (
              <AdminCard style={{ marginTop: '24px', border: '1px solid var(--yellow)', background: 'rgba(255, 193, 7, 0.05)' }}>
                <h4 style={{ color: 'var(--yellow)', marginBottom: '8px' }}>Duplicate Student Detected</h4>
                <p className="helper-text">{manualMatch.fullName} · {manualMatch.email} · {manualMatch.phone}</p>
                <div className="button-row" style={{ marginTop: '16px' }}>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => onResolveMatch(updateCustomerFromBooking ? "update_existing" : "use_existing")}
                  >
                    Use Existing
                  </button>
                  <button className="btn btn-secondary" onClick={() => onResolveMatch("create_new")}>
                    Create New
                  </button>
                </div>
              </AdminCard>
            )}
          </div>
      </form>
    </AdminDialog>
  );
}
