/**
 * Invoice Lifecycle State Machine
 * 
 * Defines the finite state machine (FSM) for invoice status transitions. 
 * This ensures that sensitive financial operations (like marking as paid) 
 * only occur when the document is in a valid precursor state.
 * 
 * DESIGN RATIONALE:
 * 1. Financial Integrity: Prevents illogical jumps (e.g. 'void' -> 'paid').
 *    An invoice must normally be 'sent' before it can accept payment, though
 *    'draft' -> 'paid' is also permitted as an explicit escape hatch for
 *    recording payments collected outside the system (no email is sent on
 *    that path, since 'sent' is what triggers the email).
 * 2. Audit Safety: Defines 'voiding' as a terminal state for sent/paid docs, 
 *    preserving the record rather than deleting it, which is standard 
 *    accounting practice.
 * 3. UI Guarding: These rules drive the visibility of action buttons in 
 *    the Admin UI, ensuring users can only attempt legal operations.
 */

import { InvoiceStatus as InvoiceLifecycleStatus } from "@/generated/prisma/client";
export type { InvoiceLifecycleStatus };

/** Logical operations an administrator can perform on an invoice document. */
export type InvoiceLifecycleAction = "mark_paid" | "mark_unpaid" | "void";

/** 
 * Map of permitted precursor states for each action.
 * RATIONALE: We explicitly exclude 'draft' from most operations until 
 * it has been 'issued' (sent).
 */
const ACTION_ALLOWED_STATUSES: Record<InvoiceLifecycleAction, readonly InvoiceLifecycleStatus[]> = {
  /**
   * 'mark_paid': Normally occurs once the client has actually received
   * the document ('sent'). Also allowed directly from 'draft' so an
   * admin can record a payment that was collected outside this system
   * (e.g. migrated from a legacy invoicing tool) without emailing the
   * customer — the 'sent' status is what triggers that email, and this
   * path never passes through it.
   */
  mark_paid: ["draft", "sent"],
  
  /** 
   * 'mark_unpaid': Reversal status if a payment was marked in error.
   */
  mark_unpaid: ["paid"],
  
  /** 
   * 'void': Cancellation of an active document. Drafts should be 
   * deleted, while sent/paid docs must be voided for audit history.
   */
  void: ["sent", "paid"]
};

/**
 * Returns the list of statuses where a specific action is legally allowed.
 * Used by the UI to dynamically show/hide buttons.
 */
export function allowedStatusesForAction(action: InvoiceLifecycleAction): readonly InvoiceLifecycleStatus[] {
  return ACTION_ALLOWED_STATUSES[action];
}

/**
 * Verifies if a specific action is permitted given the current document state.
 * 
 * RATIONALE: This check is used as a security gate in API handlers 
 * and a visibility gate in React components.
 * 
 * @param status - Current status from the database
 * @param action - Intended operation
 */
export function canApplyInvoiceAction(status: InvoiceLifecycleStatus, action: InvoiceLifecycleAction): boolean {
  return ACTION_ALLOWED_STATUSES[action].includes(status);
}
