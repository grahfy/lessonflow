"use client";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { AppDialog } from "@/components/ui/app-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { formatDateTime } from "@/lib/admin/formatters";
import {
  describeBookingIneligibility,
  type CustomerInvoiceBookingOption
} from "@/lib/invoices/invoice-display-helpers";

interface InvoiceBookingPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  createUsesSingleBookingLesson: boolean;
  bookingFilterFrom: string;
  setBookingFilterFrom: (value: string) => void;
  bookingFilterTo: string;
  setBookingFilterTo: (value: string) => void;
  onRefresh: () => void;
  bookingOptionsLoading: boolean;
  bookingOptions: CustomerInvoiceBookingOption[];
  selectedBookingIds: string[];
  setSelectedBookingIds: (updater: (current: string[]) => string[]) => void;
  setSelectedBookingIdsExact: (ids: string[]) => void;
}

/**
 * Booking selector for the new-invoice flow.
 *
 * RATIONALE: Choosing one or many approved bookings drives lesson-charge line
 * items. The picker is its own dialog so the create editor stays focused while
 * date-filtered booking selection runs against the customer's booking options.
 */
export function InvoiceBookingPickerDialog({
  isOpen,
  onClose,
  createUsesSingleBookingLesson,
  bookingFilterFrom,
  setBookingFilterFrom,
  bookingFilterTo,
  setBookingFilterTo,
  onRefresh,
  bookingOptionsLoading,
  bookingOptions,
  selectedBookingIds,
  setSelectedBookingIds,
  setSelectedBookingIdsExact
}: InvoiceBookingPickerDialogProps) {
  return (
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      title={createUsesSingleBookingLesson ? "Select Single Lesson Booking" : "Select Customer Bookings"}
      size="lg"
      footer={
        <div className="dialog-footer-row dialog-footer-row-end">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            CLOSE
          </button>
        </div>
      }
    >
      <div className="booking-dialog-scroll">
        <AdminForm className="dialog-form-grid">
          <AdminField label="From" tooltip="Optional inclusive start date filter for the booking list.">
            <input type="date" value={bookingFilterFrom} onChange={(event) => setBookingFilterFrom(event.target.value)} />
          </AdminField>
          <AdminField label="To" tooltip="Optional inclusive end date filter for the booking list.">
            <input type="date" value={bookingFilterTo} onChange={(event) => setBookingFilterTo(event.target.value)} />
          </AdminField>
          <div className="field">
            <label className="admin-field-label">Actions</label>
            <div className="button-row">
              <button className="btn btn-secondary" type="button" onClick={onRefresh}>
                Refresh
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setBookingFilterFrom("");
                  setBookingFilterTo("");
                }}
              >
                Clear Dates
              </button>
            </div>
          </div>
        </AdminForm>

        <AdminCard ghost className="invoice-dialog-section">
          {bookingOptionsLoading ? (
            <p className="helper-text">Loading bookings...</p>
          ) : bookingOptions.length === 0 ? (
            <p className="helper-text">No bookings found for the selected customer and date range.</p>
          ) : (
            <div className="invoice-dialog-preset-list">
              {bookingOptions.map((booking) => {
                const disabled = !booking.isInvoiceSelectable;
                return (
                  <label key={booking.id} className="admin-inline-checkbox invoice-dialog-preset-option">
                    <input
                      type={createUsesSingleBookingLesson ? "radio" : "checkbox"}
                      name={createUsesSingleBookingLesson ? "single-create-booking" : undefined}
                      checked={selectedBookingIds.includes(booking.id)}
                      disabled={disabled}
                      onChange={(event) => {
                        if (event.target.checked) {
                          if (createUsesSingleBookingLesson) {
                            setSelectedBookingIdsExact([booking.id]);
                          } else {
                            setSelectedBookingIds((current) =>
                              current.includes(booking.id) ? current : [...current, booking.id]
                            );
                          }
                        } else {
                          setSelectedBookingIds((current) => current.filter((bookingId) => bookingId !== booking.id));
                        }
                      }}
                    />
                    <span>
                      {formatDateTime(booking.startAt)} · {booking.durationMinutes} min · {booking.lessonMode === "video" ? "Video" : "In-person"} · {booking.status}
                      {disabled ? ` · ${describeBookingIneligibility(booking.invoiceIneligibilityReason)}` : ""}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </AdminCard>
      </div>
    </AppDialog>
  );
}
