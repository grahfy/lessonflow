/**
 * Shared invoice lifecycle transition rules used by UI and API.
 */
export type InvoiceLifecycleStatus = "draft" | "sent" | "paid" | "void";

export type InvoiceLifecycleAction = "mark_paid" | "mark_unpaid" | "void";

const ACTION_ALLOWED_STATUSES: Record<InvoiceLifecycleAction, readonly InvoiceLifecycleStatus[]> = {
  mark_paid: ["sent"],
  mark_unpaid: ["paid"],
  void: ["sent", "paid"]
};

/**
 * Returns statuses where the given action is allowed.
 */
export function allowedStatusesForAction(action: InvoiceLifecycleAction): readonly InvoiceLifecycleStatus[] {
  return ACTION_ALLOWED_STATUSES[action];
}

/**
 * Returns true when action is valid for the current invoice status.
 */
export function canApplyInvoiceAction(status: InvoiceLifecycleStatus, action: InvoiceLifecycleAction): boolean {
  return ACTION_ALLOWED_STATUSES[action].includes(status);
}
