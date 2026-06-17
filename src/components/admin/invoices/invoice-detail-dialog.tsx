"use client";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { AppDialog } from "@/components/ui/app-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import {
  type InvoiceDiscountKind,
  type InvoiceRow
} from "@/lib/admin/use-invoices";
import { type Preset } from "@/lib/admin/use-presets";
import { type LessonPackage } from "@/lib/admin/use-packages";
import {
  describeDiscount,
  formatPaidVia,
  toCurrency,
  type InvoiceDisplayStatus
} from "@/lib/invoices/invoice-display-helpers";
import { type useInvoiceDetailForm } from "@/lib/admin/use-invoice-detail-form";
import { type PendingConfirm } from "@/lib/admin/use-invoice-actions";
import { InvoiceAccountCreditPanel } from "./invoice-account-credit-panel";

type DetailForm = ReturnType<typeof useInvoiceDetailForm>;

interface InvoiceDetailDialogProps {
  selectedInvoice: InvoiceRow | null;
  onClose: () => void;
  detailForm: DetailForm;
  busyAction: string | null;
  presets: Preset[];
  packages: LessonPackage[];
  activeLessonPricingChoices: Array<{ durationMinutes: number; priceCents: number }>;
  editingTaxLabel: string;
  canMarkAsPaid: boolean;
  canMarkAsUnpaid: boolean;
  canVoidInvoice: boolean;
  canEditSelectedInvoice: boolean;
  isUsingSystemPaymentDetails: boolean;
  selectedInvoiceDisplayStatus: InvoiceDisplayStatus | null;
  onSave: () => void;
  onPerformAction: (action: "send" | "remind" | "mark_paid" | "mark_unpaid" | "void") => void;
  onOpenLinkedCustomer: () => void;
  onDeleteInvoice: () => void;
  setPendingConfirm: (value: PendingConfirm | null) => void;
  /** Called with the updated invoice after account credit is applied. */
  onAccountCreditApplied?: (updated: InvoiceRow) => void;
}

/**
 * Detail editor for a single invoice: recipient + payment details, line items,
 * lifecycle actions, and totals.
 *
 * RATIONALE: All editable fields live in the detail form hook so this component
 * stays presentational. Lifecycle actions are delegated up to the orchestrator,
 * which reconciles the list after each mutation.
 */
export function InvoiceDetailDialog({
  selectedInvoice,
  onClose,
  detailForm,
  busyAction,
  presets,
  packages,
  activeLessonPricingChoices,
  editingTaxLabel,
  canMarkAsPaid,
  canMarkAsUnpaid,
  canVoidInvoice,
  canEditSelectedInvoice,
  isUsingSystemPaymentDetails,
  selectedInvoiceDisplayStatus,
  onSave,
  onPerformAction,
  onOpenLinkedCustomer,
  onDeleteInvoice,
  setPendingConfirm,
  onAccountCreditApplied
}: InvoiceDetailDialogProps) {
  const {
    editingNotes,
    setEditingNotes,
    editingDueAt,
    setEditingDueAt,
    editingLineItems,
    editingDiscountKind,
    setEditingDiscountKind,
    editingDiscountValueInput,
    setEditingDiscountValueInput,
    editingCurrency,
    setEditingCurrency,
    editingQuickLessonDurationMinutes,
    setEditingQuickLessonDurationMinutes,
    editingProductPresetId,
    editingPackageId,
    editingCustomerFirstName,
    setEditingCustomerFirstName,
    editingCustomerLastName,
    setEditingCustomerLastName,
    editingPaymentDetailsSource,
    setEditingPaymentDetailsSource,
    editingBankName,
    setEditingBankName,
    editingBankBsb,
    setEditingBankBsb,
    editingBankAccountName,
    setEditingBankAccountName,
    editingBankAccountNumber,
    setEditingBankAccountNumber,
    resolvedEditingCurrency,
    editingCalculation,
    addLineItem,
    addPresetToInvoice,
    addPackageToInvoice,
    addQuickLessonToInvoice,
    removeLineItem,
    updateLineItem
  } = detailForm;

  return (
    <AppDialog
      isOpen={!!selectedInvoice}
      onClose={onClose}
      title={`Invoice ${selectedInvoice?.invoiceNumber}`}
      size="lg"
      id="invoice-detail-dialog"
      bodyClassName="invoice-dialog-body-lock"
      lockBodyScrollArea
      footer={
        <div className="dialog-footer-row invoice-dialog-footer">
          <div className="dialog-footer-left">
            <Tooltip content="Close invoice details and return to the invoice list.">
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </Tooltip>

            {canMarkAsPaid && (
              <Tooltip content="Record payment and move this invoice to paid status.">
                <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void onPerformAction('mark_paid')}>
                  {busyAction === 'mark_paid' ? 'Saving...' : 'Mark Paid'}
                </button>
              </Tooltip>
            )}
            {canMarkAsUnpaid && (
              <Tooltip content="Move this invoice back to unpaid status.">
                <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void onPerformAction('mark_unpaid')}>
                  {busyAction === 'mark_unpaid' ? 'Saving...' : 'Mark Unpaid'}
                </button>
              </Tooltip>
            )}
            {canVoidInvoice && (
              <Tooltip content="Void this invoice so it is no longer collectible.">
                <button className="btn btn-danger" disabled={!!busyAction} onClick={() => void onPerformAction('void')}>
                  {busyAction === 'void' ? 'Voiding...' : 'Void Invoice'}
                </button>
              </Tooltip>
            )}
            <Tooltip content="Permanently delete this invoice record when allowed.">
              <button className="btn btn-danger" disabled={!!busyAction} onClick={() => {
                setPendingConfirm({
                  title: "Delete Invoice",
                  description: "Delete this invoice permanently?",
                  confirmLabel: "Delete",
                  destructive: true,
                  onConfirm: onDeleteInvoice
                });
              }}>DELETE</button>
            </Tooltip>
          </div>
          <div className="dialog-footer-right">
            <Tooltip content="Save edits to recipient details, payment details, due date, notes, and line items. This does not send the invoice to the customer.">
              <button className="btn btn-secondary" disabled={!!busyAction || !canEditSelectedInvoice} onClick={onSave}>
                {busyAction === 'save' ? 'Saving...' : 'Save'}
              </button>
            </Tooltip>
            {selectedInvoice?.status === 'draft' && (
              <Tooltip content="Email this invoice and attached PDF to the customer, then mark it as sent.">
                <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void onPerformAction('send')}>
                  {busyAction === 'send' ? 'Sending...' : 'Send'}
                </button>
              </Tooltip>
            )}
            {selectedInvoice?.status !== 'draft' && selectedInvoice?.status !== 'void' && (
              <Tooltip content="Resend invoice notification to the customer.">
                <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void onPerformAction('remind')}>
                  {busyAction === 'remind' ? 'Sending...' : 'Resend'}
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      }
    >
      {selectedInvoice && (
        <div className="invoice-dialog-body">
          <div className="dialog-layout invoice-dialog-layout">
            <div className="dialog-col invoice-dialog-main-col">
              <h3 className="manual-section-title">Invoice Details</h3>
              <AdminCard ghost className="invoice-dialog-section">
                <AdminForm className="dialog-form-grid">
                  <AdminField label="First Name" tooltip="Customer's first name.">
                    <input
                      value={editingCustomerFirstName}
                      disabled={!canEditSelectedInvoice}
                      onChange={e => setEditingCustomerFirstName(e.target.value)}
                    />
                  </AdminField>
                  <AdminField label="Last Name" tooltip="Customer's last name.">
                    <input
                      value={editingCustomerLastName}
                      disabled={!canEditSelectedInvoice}
                      onChange={e => setEditingCustomerLastName(e.target.value)}
                    />
                  </AdminField>
                  <AdminField label="Email" tooltip="Primary email for sending the invoice." fullWidth>
                    <input value={selectedInvoice.customerEmail} readOnly />
                  </AdminField>
                  <AdminField label="Due Date" tooltip="When the invoice payment is required.">
                    <input
                      type="datetime-local"
                      value={editingDueAt}
                      disabled={!canEditSelectedInvoice}
                      onChange={(e) => setEditingDueAt(e.target.value)}
                    />
                  </AdminField>
                  <AdminField label="Currency" tooltip="Three-letter ISO currency code used for totals and tax rendering.">
                    <input
                      value={editingCurrency}
                      disabled={!canEditSelectedInvoice}
                      maxLength={3}
                      onChange={(e) => setEditingCurrency(e.target.value.toUpperCase())}
                    />
                  </AdminField>
                  <AdminField label="Invoice Discount Type" tooltip={`Optional discount applied to the full invoice subtotal before ${editingTaxLabel}.`}>
                    <select
                      value={editingDiscountKind ?? ""}
                      disabled={!canEditSelectedInvoice}
                      onChange={(e) => {
                        const nextKind = e.target.value ? (e.target.value as InvoiceDiscountKind) : null;
                        setEditingDiscountKind(nextKind);
                        if (!nextKind) {
                          setEditingDiscountValueInput("");
                        }
                      }}
                    >
                      <option value="">No discount</option>
                      <option value="amount">Fixed amount</option>
                      <option value="percent">Percentage</option>
                    </select>
                  </AdminField>
                  <AdminField label="Invoice Discount Value" tooltip={`Amount discounts use ${resolvedEditingCurrency}. Percentage discounts use %.`}>
                    <input
                      value={editingDiscountValueInput}
                      disabled={!editingDiscountKind || !canEditSelectedInvoice}
                      placeholder={editingDiscountKind === "percent" ? "10%" : "0.00"}
                      onChange={(e) => setEditingDiscountValueInput(e.target.value)}
                    />
                  </AdminField>
                </AdminForm>
              </AdminCard>

              {onAccountCreditApplied ? (
                <InvoiceAccountCreditPanel
                  invoice={selectedInvoice}
                  canApply={canEditSelectedInvoice}
                  onApplied={onAccountCreditApplied}
                />
              ) : null}

              <h3 className="manual-section-title">Payment Details</h3>
              <AdminCard ghost className="invoice-dialog-section">
                <AdminForm className="dialog-form-grid">
                  <AdminField label="Payment Source" tooltip="Choose whether this invoice follows the current system payment settings or stores custom payment instructions." fullWidth>
                    <select
                      value={editingPaymentDetailsSource}
                      disabled={!canEditSelectedInvoice}
                      onChange={(e) => setEditingPaymentDetailsSource(e.target.value as InvoiceRow["paymentDetailsSource"])}
                    >
                      <option value="system">Use system payment details</option>
                      <option value="custom">Custom payment details</option>
                    </select>
                  </AdminField>
                  <div className="field full">
                    <p className="helper-text">
                      {isUsingSystemPaymentDetails
                        ? "These payment details come from Admin Settings and will update automatically when the system values change."
                        : "These payment details are saved on this invoice only and will override the system defaults."}
                    </p>
                  </div>
                  <AdminField label="Bank Name" tooltip="Bank shown in the PDF payment instructions.">
                    <input
                      value={editingBankName}
                      disabled={!canEditSelectedInvoice || isUsingSystemPaymentDetails}
                      onChange={(e) => setEditingBankName(e.target.value)}
                    />
                  </AdminField>
                  <AdminField label="BSB" tooltip="BSB shown in the PDF payment instructions.">
                    <input
                      value={editingBankBsb}
                      disabled={!canEditSelectedInvoice || isUsingSystemPaymentDetails}
                      onChange={(e) => setEditingBankBsb(e.target.value)}
                    />
                  </AdminField>
                  <AdminField label="Account Name" tooltip="Account name shown in the PDF payment instructions.">
                    <input
                      value={editingBankAccountName}
                      disabled={!canEditSelectedInvoice || isUsingSystemPaymentDetails}
                      onChange={(e) => setEditingBankAccountName(e.target.value)}
                    />
                  </AdminField>
                  <AdminField label="Account Number" tooltip="Account number shown in the PDF payment instructions.">
                    <input
                      value={editingBankAccountNumber}
                      disabled={!canEditSelectedInvoice || isUsingSystemPaymentDetails}
                      onChange={(e) => setEditingBankAccountNumber(e.target.value)}
                    />
                  </AdminField>
                </AdminForm>
              </AdminCard>

              <h3 className="manual-section-title">Line Items</h3>
              <AdminCard ghost className="invoice-dialog-line-items-card">
                <div className="invoice-dialog-line-items-shell">
                  <div className="invoice-dialog-line-items">
                    {editingLineItems.map((li) => (
                      <div
                        key={li.key}
                        className={`invoice-dialog-line-item${li.quantityLocked ? " invoice-dialog-line-item-fixed-quantity" : ""}`}
                      >
                        <div className="invoice-dialog-line-item-main">
                          <AdminField label="Description" tooltip="Line item name or service provided.">
                            <input
                              value={li.description}
                              disabled={!canEditSelectedInvoice}
                              onChange={(e) => updateLineItem(li.key, { description: e.target.value })}
                            />
                          </AdminField>
                        </div>
                        {!li.quantityLocked && (
                          <div className="invoice-dialog-line-item-qty">
                            <AdminField label="Qty" tooltip="Quantity.">
                              <input
                                type="number"
                                value={li.quantity}
                                disabled={!canEditSelectedInvoice}
                                onChange={(e) => updateLineItem(li.key, { quantity: e.target.value })}
                              />
                            </AdminField>
                          </div>
                        )}
                        <div className="invoice-dialog-line-item-price">
                          <AdminField label="Price" tooltip={`Unit price in ${resolvedEditingCurrency}.`}>
                            <input
                              value={li.unitPriceInput}
                              disabled={!canEditSelectedInvoice}
                              onChange={(e) => updateLineItem(li.key, { unitPriceInput: e.target.value })}
                            />
                          </AdminField>
                        </div>
                        <div className="invoice-dialog-line-item-qty">
                          <AdminField label="Discount Type" tooltip="Optional line-level discount for this item.">
                            <select
                              value={li.discountKind ?? ""}
                              disabled={!canEditSelectedInvoice}
                              onChange={(e) => {
                                const nextKind = e.target.value ? (e.target.value as InvoiceDiscountKind) : null;
                                updateLineItem(li.key, {
                                  discountKind: nextKind,
                                  discountValueInput: nextKind ? li.discountValueInput : ""
                                });
                              }}
                            >
                              <option value="">No discount</option>
                              <option value="amount">Fixed amount</option>
                              <option value="percent">Percentage</option>
                            </select>
                          </AdminField>
                        </div>
                        <div className="invoice-dialog-line-item-price">
                          <AdminField label="Discount Value" tooltip={`Amount discounts use ${resolvedEditingCurrency}. Percentage discounts use %.`}>
                            <input
                              value={li.discountValueInput}
                              disabled={!li.discountKind || !canEditSelectedInvoice}
                              placeholder={li.discountKind === "percent" ? "10%" : "0.00"}
                              onChange={(e) => updateLineItem(li.key, { discountValueInput: e.target.value })}
                            />
                          </AdminField>
                        </div>
                        <Tooltip content="Remove this line item from the invoice.">
                          <button
                            className="btn btn-danger invoice-dialog-remove-item"
                            type="button"
                            disabled={!canEditSelectedInvoice}
                            onClick={() => removeLineItem(li.key)}
                          >
                            ×
                          </button>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                  <div className="button-row invoice-dialog-button-row invoice-dialog-line-actions">
                    <Tooltip content="Add a blank custom item or service that you can customize manually.">
                      <button className="btn btn-secondary" type="button" disabled={!canEditSelectedInvoice} onClick={addLineItem}>Add Custom Item / Service</button>
                    </Tooltip>
                    <div className="invoice-dialog-preset-row invoice-dialog-single-lesson-row">
                      <select
                        className="invoice-product-preset-select invoice-dialog-preset-select"
                        value={editingQuickLessonDurationMinutes}
                        disabled={!canEditSelectedInvoice || activeLessonPricingChoices.length === 0}
                        onChange={(e) => {
                          const selectedDuration = e.target.value;
                          setEditingQuickLessonDurationMinutes(selectedDuration);
                          if (selectedDuration) {
                            addQuickLessonToInvoice(selectedDuration);
                          }
                        }}
                      >
                        <option value="">Add single lesson...</option>
                        {activeLessonPricingChoices.map((option) => (
                          <option key={`edit-quick-lesson-${option.durationMinutes}`} value={String(option.durationMinutes)}>
                            {option.durationMinutes} minutes ({toCurrency(option.priceCents, resolvedEditingCurrency)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="invoice-dialog-preset-row invoice-dialog-add-preset-row">
                      <select
                        className="invoice-product-preset-select invoice-dialog-preset-select"
                        value={editingProductPresetId}
                        disabled={!canEditSelectedInvoice}
                        onChange={(e) => addPresetToInvoice(e.target.value)}
                      >
                        <option value="">Add preset...</option>
                        {presets.map(p => <option key={p.id} value={p.id}>{p.label} ({toCurrency(p.unitPriceCents, resolvedEditingCurrency)}{p.discountKind ? `, ${describeDiscount(p.discountKind, p.discountValue ?? null, resolvedEditingCurrency)} off` : ""})</option>)}
                      </select>
                    </div>
                    <div className="invoice-dialog-preset-row invoice-dialog-add-package-row">
                      <select
                        className="invoice-product-preset-select invoice-dialog-preset-select"
                        value={editingPackageId}
                        disabled={!canEditSelectedInvoice || packages.length === 0}
                        onChange={(e) => {
                          // Adding a package line carries packageId so paying the
                          // invoice grants the package's prepaid lesson credits.
                          if (e.target.value) {
                            addPackageToInvoice(e.target.value);
                          }
                        }}
                      >
                        <option value="">Add lesson package...</option>
                        {packages.map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.label} ({pkg.lessonCount} {pkg.lessonCount === 1 ? "lesson" : "lessons"}{pkg.durationMinutes ? `, ${pkg.durationMinutes} min` : ""}, {toCurrency(pkg.priceCents, resolvedEditingCurrency)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {canEditSelectedInvoice && activeLessonPricingChoices.length === 0 && (
                    <p className="helper-text">
                      Add active lesson durations and prices in Lesson Info / Prices before adding single lessons here.
                    </p>
                  )}
                </div>
              </AdminCard>
            </div>

            <div className="dialog-col is-notes invoice-dialog-side-col">
              <h3 className="manual-section-title">Actions & History</h3>
              <AdminCard ghost>
                <p className="helper-text">Manage the lifecycle of this invoice.</p>

                <div className="invoice-dialog-status-card">
                  <div className="invoice-dialog-status-row">
                    <span>Subtotal:</span>
                    <span>{toCurrency(editingCalculation.totals.subtotalCents, resolvedEditingCurrency)}</span>
                  </div>
                  {editingCalculation.totals.discountCents !== 0 && (
                    <div className="invoice-dialog-status-row">
                      <span>Discount:</span>
                      <span>{toCurrency(-editingCalculation.totals.discountCents, resolvedEditingCurrency)}</span>
                    </div>
                  )}
                  <div className="invoice-dialog-status-row">
                    <span>{editingTaxLabel}:</span>
                    <span>{toCurrency(editingCalculation.totals.gstCents, resolvedEditingCurrency)}</span>
                  </div>
                  <div className="invoice-dialog-status-row">
                    <span>Total:</span>
                    <span>{toCurrency(editingCalculation.totals.totalCents, resolvedEditingCurrency)}</span>
                  </div>
                  <div className="invoice-dialog-status-row">
                    <span>Status:</span>
                    <span className={`status-badge status-${selectedInvoiceDisplayStatus ?? selectedInvoice.status}`}>
                      {selectedInvoiceDisplayStatus ?? selectedInvoice.status}
                    </span>
                  </div>
                  {selectedInvoice.status === 'paid' && (
                    <div className="invoice-dialog-status-row">
                      <span>Paid via:</span>
                      <span>{formatPaidVia(selectedInvoice.paidVia)}</span>
                    </div>
                  )}
                  {selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'void' && (
                    <div className="invoice-dialog-status-row invoice-dialog-status-row-alert">
                      <span>Outstanding:</span>
                      <span>{selectedInvoice.overdueDays ?? 0} days</span>
                    </div>
                  )}
                </div>

                {selectedInvoice.status === 'draft' && (
                  <p className="helper-text invoice-dialog-help-copy">
                    Mark as Paid becomes available after sending the invoice.
                  </p>
                )}
                {selectedInvoice.status === 'sent' && (
                  <p className="helper-text invoice-dialog-help-copy">
                    This sent invoice can still be edited until it is paid or voided.
                  </p>
                )}
                {(selectedInvoice.status === 'paid' || selectedInvoice.status === 'void') && (
                  <p className="helper-text invoice-dialog-help-copy">
                    Financial edits are locked once an invoice is {selectedInvoice.status}.
                  </p>
                )}

                <AdminField label="Notes" tooltip="Visible to the customer on the public invoice.">
                  <textarea
                    className="invoice-dialog-notes"
                    value={editingNotes}
                    disabled={!canEditSelectedInvoice}
                    onChange={(e) => setEditingNotes(e.target.value)}
                    placeholder="Customer-facing notes..."
                  />
                </AdminField>

                <div className="button-row invoice-dialog-button-row invoice-dialog-side-actions">
                  <Tooltip content="Save edits to recipient details, payment details, due date, notes, and line items. This does not send the invoice to the customer.">
                    <button className="btn btn-secondary invoice-dialog-full-width" disabled={!!busyAction || !canEditSelectedInvoice} onClick={onSave}>
                      {busyAction === 'save' ? 'Saving...' : 'Save Details'}
                    </button>
                  </Tooltip>
                  <Tooltip content="Open this invoice's customer profile in the customers page.">
                    <button className="btn btn-secondary invoice-dialog-full-width" onClick={onOpenLinkedCustomer}>Open Customer</button>
                  </Tooltip>
                  <Tooltip content="Open the printable invoice PDF in a new browser tab.">
                    <button className="btn btn-secondary invoice-dialog-full-width" onClick={() => window.open(`/api/admin/invoices/${selectedInvoice.id}/pdf`, '_blank')}>VIEW PDF</button>
                  </Tooltip>
                </div>
              </AdminCard>
            </div>
          </div>
        </div>
      )}
    </AppDialog>
  );
}
