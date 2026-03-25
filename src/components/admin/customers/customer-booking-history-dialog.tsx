import { AdminCard } from "@/components/admin/ui/admin-card";
import { formatDateTime } from "@/lib/admin/formatters";
import { type CustomerBookingHistoryRow } from "@/lib/admin/types";

type Props = {
  bookingsLoading: boolean;
  bookings: CustomerBookingHistoryRow[];
  onOpenBooking: (booking: CustomerBookingHistoryRow) => void;
};

function getDurationLabel(booking: CustomerBookingHistoryRow): string {
  if (booking.lessonDuration === "min30") {
    return "30 min";
  }
  if (booking.lessonDuration === "min60") {
    return "60 min";
  }
  return booking.customDurationMinutes ? `${booking.customDurationMinutes} min` : "Custom";
}

function getStatusLabel(status: CustomerBookingHistoryRow["status"]): string {
  return status === "approved" ? "Approved" : "Cancelled";
}

export function CustomerBookingHistoryDialog({
  bookingsLoading,
  bookings,
  onOpenBooking
}: Props) {
  return (
    <div className="customer-tab-panel customer-booking-history-panel">
      <AdminCard className="customer-booking-history-card">
        <div className="customer-booking-history-head">
          <div>
            <h4>Lesson History</h4>
            <p className="helper-text">Confirmed and cancelled lesson bookings for this customer, newest first.</p>
          </div>
        </div>

        {bookingsLoading ? (
          <p className="helper-text">Loading lesson history...</p>
        ) : bookings.length === 0 ? (
          <div className="customer-booking-history-empty">
            <strong>No lesson history yet.</strong>
            <p className="helper-text">This customer does not have any booking records yet.</p>
          </div>
        ) : (
          <div className="customer-booking-history-list">
            {bookings.map((booking) => (
              <div key={booking.id} className="customer-booking-history-item">
                <div className="customer-booking-history-copy">
                  <div className="customer-booking-history-title-row">
                    <strong>{formatDateTime(booking.startAt)}</strong>
                    <span className="customer-booking-history-status">{getStatusLabel(booking.status)}</span>
                  </div>
                  <p className="helper-text">
                    {booking.assignedTeacher?.displayName || "Unassigned"} · {booking.lessonMode === "in_person" ? "In-person" : "Video"} · {getDurationLabel(booking)}
                  </p>
                  <p className="customer-booking-history-notes">{booking.notes?.trim() || "No lesson notes were saved for this booking."}</p>
                </div>

                <div className="customer-booking-history-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => onOpenBooking(booking)}
                  >
                    Open Booking
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
