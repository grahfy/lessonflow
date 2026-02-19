export function getRecencyCutoff(now: Date): Date {
  return new Date(now.getTime() - 48 * 60 * 60 * 1000);
}

export function bookingColor(status: "approved" | "cancelled"): "green" | "slate" {
  return status === "approved" ? "green" : "slate";
}

export function bookingRequestColor(status: "pending" | "rejected" | "approved" | "cancelled"): "yellow" | "red" | "green" | "slate" {
  if (status === "pending") {
    return "yellow";
  }
  if (status === "rejected") {
    return "red";
  }
  return status === "approved" ? "green" : "slate";
}
