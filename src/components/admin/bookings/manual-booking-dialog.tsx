"use client";

import { RefObject } from "react";
import { AppDialog } from "@/components/ui/app-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { STREET_TYPES } from "@/lib/admin/constants";
import { type ManualStep, MANUAL_STEP_LABEL, MANUAL_STEP_ORDER, AU_STATES } from "@/lib/admin/types";
import { toAuState, toDigits } from "@/lib/admin/utils";
import { type BookingMatchedCustomer } from "./types";
import { AddressAutocomplete, type ParsedAddress } from "@/components/admin/ui/address-autocomplete";
import { Tooltip } from "@/components/admin/ui/tooltip";

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
  isRecurring: boolean;
  setIsRecurring: (val: boolean) => void;
  canEditAssignment: boolean;
  teacherOptions: Array<{ id: string; displayName: string }>;
  currentTeacherId: string | null;
  durationChoice: string;
  setDurationChoice: (val: string) => void;
  lessonDurationOptions: Array<{ value: string; label: string }>;
  manualMatch: BookingMatchedCustomer | null;
  onResolveMatch: (resolution: "use_existing" | "update_existing" | "create_new") => void;
  onSave: () => void;
  busyAction: string | null;
}

/**
 * Multi-step dialog for creating a manual booking from the admin calendar.
 *
 * RATIONALE: The flow intentionally separates customer, lesson, and scheduling
 * data so admins can resolve customer matches before committing a booking row.
 */
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
  isRecurring,
  setIsRecurring,
  canEditAssignment,
  teacherOptions,
  currentTeacherId,
  durationChoice,
  setDurationChoice,
  lessonDurationOptions,
  manualMatch,
  onResolveMatch,
  onSave,
  busyAction
}: ManualBookingDialogProps) {
  const stepIndex = MANUAL_STEP_ORDER.indexOf(step);

  /**
   * Applies address-autocomplete results directly to the uncontrolled form
   * fields so admins keep the speed of native inputs without mirroring every
   * address field in React state.
   */
  const handleAddressSelect = (addr: ParsedAddress) => {
    if (!formRef.current) return;
    const form = formRef.current;
    
    const updateInput = (name: string, value: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el) {
        el.value = value;
      }
    };

    // NOTE: AddressAutocomplete returns normalized text, but state still needs
    // to be clamped to the app's supported AU state union.
    updateInput("unitNumber", addr.unitNumber);
    updateInput("houseNumber", addr.houseNumber);
    updateInput("streetName", addr.streetName);
    updateInput("streetType", addr.streetType);
    updateInput("suburb", addr.suburb);
    updateInput("state", toAuState(addr.state));
    updateInput("postcode", addr.postcode);
  };

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      rootRef={rootRef}
      title="Add Manual Booking"
      size="lg"
      footer={
        <div className="dialog-footer-row">
          <div className="dialog-footer-left">
            {step !== 'customer' && (
              <Tooltip content="Return to the previous step.">
                <button className="btn btn-secondary" onClick={() => setStep(MANUAL_STEP_ORDER[stepIndex - 1])}>Back</button>
              </Tooltip>
            )}
          </div>
          <div className="dialog-footer-right">
            <Tooltip content="Close this dialog without saving.">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            </Tooltip>
            {step === 'schedule' ? (
              <Tooltip content="Confirm and create this manual booking.">
                <button className="btn btn-primary" disabled={!!busyAction} onClick={onSave}>
                  {busyAction === 'create' ? 'Adding...' : 'Add booking'}
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Proceed to the next step.">
                <button className="btn btn-primary" onClick={() => setStep(MANUAL_STEP_ORDER[stepIndex + 1])}>
                  {/* RATIONALE: Step labels reinforce what data will be reviewed
                      next, which matters because the form is split across hidden
                      panes instead of one long scrolling sheet. */}
                  Next: {MANUAL_STEP_LABEL[MANUAL_STEP_ORDER[stepIndex + 1]]}
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      }
    >
      <div className="manual-steps manual-steps-row">
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
        <div className={`manual-booking-scroll ${step === "customer" ? "is-active" : "is-hidden"}`} aria-hidden={step !== "customer"}>
            <h3 className="manual-section-title">Customer Selection</h3>
            <AdminForm className="manual-grid manual-grid-3">
              <AdminField label="Search existing students" tooltip="Search for an existing customer to pre-fill details.">
                <input 
                  value={customerQuery} 
                  onChange={e => setCustomerQuery(e.target.value)} 
                  placeholder="Filter by name, email, or phone..."
                />
              </AdminField>
              <AdminField label="Select from list" tooltip="Choose a customer from the search results." className="manual-span-2">
                <select 
                  value={manualCustomerId} 
                  onChange={e => {
                    const cid = e.target.value;
                    setManualCustomerId(cid);
                    const selected = customerOptions.find(c => c.id === cid);
                    // RATIONALE: Selecting a known customer pre-fills the form so
                    // admins can edit only what differs for this booking.
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
                  <div className="manual-clear-row">
                    <Tooltip content="Deselect this customer and clear the form.">
                      <button type="button" className="btn btn-secondary" onClick={onClearCustomer}>
                        Clear selected customer
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            </AdminForm>

            <h3 className="manual-section-title manual-subsection-heading">Student Details</h3>
            <AdminForm className="manual-grid manual-grid-2">
              <AdminField label="First Name" tooltip="Student's legal or preferred first name." required>
                <input name="firstName" required />
              </AdminField>
              <AdminField label="Last Name" tooltip="Student's family name." required>
                <input name="lastName" required />
              </AdminField>
              <AdminField label="Email" tooltip="Primary email address for communication and portal login." required>
                <input name="email" type="email" required />
              </AdminField>
              <AdminField label="Phone" tooltip="Contact phone number (10 digits)." required>
                <input name="phone" required maxLength={10} onInput={e => e.currentTarget.value = toDigits(e.currentTarget.value, 10)} />
              </AdminField>
            </AdminForm>

            <h3 className="manual-section-title manual-subsection-heading">Address</h3>
            <div className="admin-address-search-row">
              <AddressAutocomplete onAddressSelect={handleAddressSelect} disabled={!!busyAction} />
            </div>
            <AdminForm className="manual-grid manual-grid-3">
              <AdminField label="Unit" tooltip="Unit or apartment number (optional).">
                <input name="unitNumber" maxLength={5} onInput={e => e.currentTarget.value = toDigits(e.currentTarget.value, 5)} />
              </AdminField>
              <AdminField label="House Number" tooltip="Street or house number." required>
                <input name="houseNumber" required maxLength={5} onInput={e => e.currentTarget.value = toDigits(e.currentTarget.value, 5)} />
              </AdminField>
              <AdminField label="Street Type" tooltip="Type of street (e.g., Road, Avenue)." required>
                <select name="streetType" required defaultValue="Street">
                  {STREET_TYPES.map((streetType) => (
                    <option key={streetType} value={streetType}>{streetType}</option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Street Name" tooltip="Name of the street." required className="manual-span-2">
                <input name="streetName" required />
              </AdminField>
              <AdminField label="Suburb" tooltip="City or suburb name." required>
                <input name="suburb" required />
              </AdminField>
              <AdminField label="State" tooltip="Australian state or territory." required className="manual-span-2">
                <select name="state" required defaultValue="VIC">
                  {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </AdminField>
              <AdminField label="Postcode" tooltip="4-digit postal code." required>
                <input name="postcode" required maxLength={4} onInput={e => e.currentTarget.value = toDigits(e.currentTarget.value, 4)} />
              </AdminField>
            </AdminForm>
          </div>

        <div className={`manual-booking-scroll ${step === "lesson" ? "is-active" : "is-hidden"}`} aria-hidden={step !== "lesson"}>
            <h3 className="manual-section-title">Lesson Details</h3>
            <AdminForm className="manual-grid manual-grid-3">
              <AdminField label="Mode" tooltip="Physical location or virtual format of the lesson." required>
                <select name="lessonMode" defaultValue="in_person">
                  <option value="in_person">In-person</option>
                  <option value="video">Video</option>
                </select>
              </AdminField>
              <AdminField label="Skill Level" tooltip="The student's current proficiency level." required>
                <select name="skillLevel" defaultValue="beginner">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </AdminField>
              <AdminField label="Duration" tooltip="Length of the lesson in minutes." required>
                <select
                  name="lessonDuration"
                  value={durationChoice}
                  onChange={(e) => setDurationChoice(e.target.value)}
                  disabled={lessonDurationOptions.length === 0}
                >
                  {lessonDurationOptions.length === 0 ? (
                    <option value="">No lesson durations configured</option>
                  ) : (
                    lessonDurationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  )}
                </select>
              </AdminField>
            </AdminForm>
          </div>

        <div className={`manual-booking-scroll ${step === "schedule" ? "is-active" : "is-hidden"}`} aria-hidden={step !== "schedule"}>
            <h3 className="manual-section-title">Schedule & Confirm</h3>
            <AdminForm className="manual-grid manual-grid-2">
              <AdminField label="Start Time" tooltip="The date and time this lesson is scheduled to begin." required>
                <input name="requestedStartAt" type="datetime-local" required />
              </AdminField>
              <AdminField label="Assigned Teacher" tooltip="Teacher responsible for this lesson. Teachers are auto-assigned to themselves.">
                {canEditAssignment ? (
                  <select name="assignedTeacherId" defaultValue={teacherOptions.length === 1 ? teacherOptions[0]?.id ?? "" : ""}>
                    <option value="">Unassigned</option>
                    {teacherOptions.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input value={teacherOptions.find((teacher) => teacher.id === currentTeacherId)?.displayName || "Assigned to you"} readOnly />
                    <input type="hidden" name="assignedTeacherId" value={currentTeacherId || ""} />
                  </>
                )}
              </AdminField>
              <AdminField label="Weekly Recurring" tooltip="Check if this lesson repeats weekly.">
                <div className="manual-recurring-toggle">
                  <input
                    type="checkbox"
                    name="isRecurring"
                    className="manual-inline-checkbox"
                    checked={isRecurring}
                    onChange={(event) => {
                      const next = event.currentTarget.checked;
                      setIsRecurring(next);
                      if (!next && formRef.current) {
                        // NOTE: Clear the hidden end-date field when recurrence
                        // is disabled so a stale value is not submitted later.
                        const recurrenceField = formRef.current.elements.namedItem("recurrenceEndAt");
                        if (recurrenceField && "value" in recurrenceField) {
                          recurrenceField.value = "";
                        }
                      }
                    }}
                  />
                </div>
              </AdminField>
              <AdminField label="Recurrence End (Required if recurring)" tooltip="When the weekly recurrence should stop.">
                <input name="recurrenceEndAt" type="datetime-local" disabled={!isRecurring} required={isRecurring} />
              </AdminField>
            </AdminForm>

            {manualMatch && (
              <AdminCard className="manual-match-card">
                <h4 className="manual-match-title">Duplicate Student Detected</h4>
                <p className="helper-text">{manualMatch.fullName} · {manualMatch.email} · {manualMatch.phone}</p>
                <div className="button-row manual-match-actions">
                  <Tooltip content="Apply the booking to this existing customer profile.">
                    <button 
                      className="btn btn-primary" 
                      // RATIONALE: The primary action respects the checkbox state
                      // so admins can decide whether the booking should also
                      // refresh the existing customer profile details.
                      onClick={() => onResolveMatch(updateCustomerFromBooking ? "update_existing" : "use_existing")}
                    >
                      Use Existing
                    </button>
                  </Tooltip>
                  <Tooltip content="Force creation of a new, separate customer profile.">
                    <button className="btn btn-secondary" onClick={() => onResolveMatch("create_new")}>
                      Create New
                    </button>
                  </Tooltip>
                </div>
              </AdminCard>
            )}
          </div>
      </form>
    </AppDialog>
  );
}
