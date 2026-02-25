/**
 * Shared admin calendar presentation helpers.
 *
 * These values are reused when building event payloads and rendering status chips so color/recency
 * semantics stay consistent across server and client code.
 */
export function getRecencyCutoff(now: Date): Date {
  // Keep recently resolved items visible briefly after reload so admins can confirm a cancel/reject
  // action without the event disappearing immediately.
  return new Date(now.getTime() - 48 * 60 * 60 * 1000);
}

export function bookingColor(status: "approved" | "cancelled"): "green" | "slate" {
  return status === "approved" ? "green" : "slate";
}

export function bookingRequestColor(status: "pending" | "rejected" | "approved" | "cancelled"): "yellow" | "red" | "green" | "slate" {
  // Pending and rejected requests get distinct triage colors; approved/cancelled align with the
  // booking palette to reflect resolved states in the calendar.
  if (status === "pending") {
    return "yellow";
  }
  if (status === "rejected") {
    return "red";
  }
  return status === "approved" ? "green" : "slate";
}
