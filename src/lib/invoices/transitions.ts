/**
 * Invoice Lifecycle Transition Rules
 * 
 * Defines the finite state machine (FSM) for invoice status changes. 
 * This ensures that business operations (like marking an invoice as paid) 
 * only occur when the document is in a valid precursor state.
 * 
 * RATIONALE:
 * Financial documents are sensitive. We must prevent illogical state 
 * transitions (e.g. marking a 'draft' as 'paid' without ever sending it, 
 * or 'voiding' an already deleted invoice) to maintain audit integrity.
 */

import { InvoiceStatus as InvoiceLifecycleStatus } from "@/generated/prisma/client";
export type { InvoiceLifecycleStatus };

/** Actions an admin can perform on an invoice to trigger a state change. */
export type InvoiceLifecycleAction = "mark_paid" | "mark_unpaid" | "void";

/** Mapping of actions to the statuses where they are legally permissible. */
const ACTION_ALLOWED_STATUSES: Record<InvoiceLifecycleAction, readonly InvoiceLifecycleStatus[]> = {
  // Only sent invoices can be transitioned to 'paid'.
  mark_paid: ["sent"],
  // Allows reversing an accidental payment mark.
  mark_unpaid: ["paid"],
  // Cancellation only allowed for active documents that aren't drafts.
  void: ["sent", "paid"]
};

/**
 * Returns the list of statuses where a specific action is allowed.
 * Used by the UI to show/hide action buttons in the admin console.
 * 
 * @param action - The lifecycle operation (e.g. 'void')
 */
export function allowedStatusesForAction(action: InvoiceLifecycleAction): readonly InvoiceLifecycleStatus[] {
  return ACTION_ALLOWED_STATUSES[action];
}

/**
 * Validates if an action can be performed on an invoice in its current status.
 * RATIONALE: This check is used in both the API route (security) and 
 * the UI (UX/Guard) to prevent invalid state corruption.
 * 
 * @param status - The current status in the DB
 * @param action - The intented operation
 * @returns boolean
 */
export function canApplyInvoiceAction(status: InvoiceLifecycleStatus, action: InvoiceLifecycleAction): boolean {
  return ACTION_ALLOWED_STATUSES[action].includes(status);
}
