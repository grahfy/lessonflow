"use client";

import { CalendarDays } from "lucide-react";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { AppDialog } from "@/components/ui/app-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import {
  type InvoiceDiscountKind,
  type InvoiceTaxMode
} from "@/lib/admin/use-invoices";
import { type Preset } from "@/lib/admin/use-presets";
import { type LessonPackage } from "@/lib/admin/use-packages";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { describeDiscount, toCurrency } from "@/lib/invoices/invoice-display-helpers";
import { type useInvoiceCreateForm } from "@/lib/admin/use-invoice-create-form";
import { InvoiceBookingPickerDialog } from "./invoice-booking-picker-dialog";

type CreateForm = ReturnType<typeof useInvoiceCreateForm>;

interface InvoiceCreateDialogProps {
  createForm: CreateForm;
  busyAction: string | null;
  customerOptions: Array<{ id: string; firstName: string | null; lastName: string | null; fullName: string }>;
  presets: Preset[];
  packages: LessonPackage[];
  activeLessonPricingChoices: Array<{ durationMinutes: number; priceCents: number }>;
  createTaxLabel: string;
  onClose: () => void;
  onCreateInvoice: (shouldSend: boolean) => void;
}

/**
 * New-invoice editor combining lesson, custom, and preset sources.
 *
 * RATIONALE: All draft state, previews, and blocking validation come from the
 * create form hook so this component renders the editor and delegates submission
 * to the orchestrator, which handles the create/send recovery flow.
 */
export function InvoiceCreateDialog({
  createForm,
  busyAction,
  customerOptions,
  presets,
  packages,
  activeLessonPricingChoices,
  createTaxLabel,
  onClose,
  onCreateInvoice
}: InvoiceCreateDialogProps) {
  const {
    createOpen,
    createSelectedCustomerId,
    setCreateSelectedCustomerId,
    createLessonSourceMode,
    createIncludeStandalone,
    createIncludePresets,
    createIncludePackages,
    createStandaloneItems,
    createSelectedPresetIds,
    setCreateSelectedPresetIds,
    createSelectedPackageIds,
    setCreateSelectedPackageIds,
    createDueAt,
    setCreateDueAt,
    createCurrency,
    setCreateCurrency,
    createTaxMode,
    setCreateTaxMode,
    createDiscountKind,
    setCreateDiscountKind,
    createDiscountValueInput,
    setCreateDiscountValueInput,
    createBookingDialogOpen,
    setCreateBookingDialogOpen,
    createBookingOptionsLoading,
    createBookingOptions,
    createSelectedBookingIds,
    setCreateSelectedBookingIds,
    createQuickLessonDurationMinutes,
    setCreateQuickLessonDurationMinutes,
    createBookingFilterFrom,
    setCreateBookingFilterFrom,
    createBookingFilterTo,
    setCreateBookingFilterTo,
    resolvedCreateCurrency,
    createUsesBookingLessons,
    createUsesQuickLesson,
    createUsesSingleBookingLesson,
    loadCreateBookingOptions,
    toggleCreateLessonSource,
    toggleCreateSource,
    addCreateStandaloneItem,
    updateCreateStandaloneItem,
    removeCreateStandaloneItem,
    createBookingLessonPreviewLineItems,
    createQuickLessonPreviewLineItems,
    createPreviewLineItems,
    createBlockingError,
    createCalculation
  } = createForm;

  return (
    <>
      <AppDialog
        isOpen={createOpen}
        onClose={onClose}
        title="New Invoice"
        size="lg"
        id="invoice-create-dialog"
        bodyClassName="invoice-dialog-body-lock"
        lockBodyScrollArea
        footer={
          <div className="dialog-footer-row invoice-dialog-footer">
            <div className="dialog-footer-left">
              <Tooltip content="Close the new invoice editor without saving.">
                <button
                  className="btn btn-secondary"
                  disabled={!!busyAction}
                  onClick={onClose}
                >
                  Cancel
                </button>
              </Tooltip>
            </div>
            <div className="dialog-footer-right">
              <Tooltip content="Create a new draft invoice only.">
                <button
                  className="btn btn-secondary"
                  disabled={!!busyAction || !createSelectedCustomerId || !!createBlockingError}
                  onClick={() => void onCreateInvoice(false)}
                >
                  {busyAction === "create" ? "Saving..." : "Save Draft"}
                </button>
              </Tooltip>
              <Tooltip content="Create and immediately email the invoice to the customer.">
                <button
                  className="btn btn-primary"
                  disabled={!!busyAction || !createSelectedCustomerId || !!createBlockingError}
                  onClick={() => void onCreateInvoice(true)}
                >
                  {busyAction === "create_send" ? "Sending..." : "Create & Send"}
                </button>
              </Tooltip>
            </div>
          </div>
        }
      >
        <div className="invoice-dialog-body">
          <div className="dialog-layout invoice-dialog-layout">
          <div className="dialog-col invoice-dialog-main-col">
            <h3 className="manual-section-title">Invoice Details</h3>
            <AdminCard ghost className="invoice-dialog-section">
              <AdminForm className="dialog-form-grid">
                <AdminField label="Select Customer" tooltip="Choose which student to bill." fullWidth required>
                  <select
                    className="invoice-dialog-customer-select"
                    value={createSelectedCustomerId}
                    onChange={(e) => {
                      setCreateSelectedCustomerId(e.target.value);
                      setCreateSelectedBookingIds([]);
                    }}
                  >
                    <option value="">-- Choose student --</option>
                    {customerOptions.map(c => <option key={c.id} value={c.id}>{c.lastName ? `${c.lastName}, ${c.firstName}` : c.fullName}</option>)}
                  </select>
                </AdminField>
                <AdminField label="Invoice Sources" tooltip="Choose one or more sources to combine in this invoice." fullWidth>
                  <div className="invoice-dialog-source-list">
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createLessonSourceMode === "single_booking"}
                        onChange={(e) => toggleCreateLessonSource("single_booking", e.target.checked)}
                      />
                      Single Lesson (Booking)
                    </label>
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createLessonSourceMode === "single_quick"}
                        onChange={(e) => toggleCreateLessonSource("single_quick", e.target.checked)}
                      />
                      Single Lesson (Quick Price)
                    </label>
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createLessonSourceMode === "multiple_bookings"}
                        onChange={(e) => toggleCreateLessonSource("multiple_bookings", e.target.checked)}
                      />
                      Multiple Lessons (Bookings)
                    </label>
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createIncludeStandalone}
                        onChange={(e) => toggleCreateSource("custom", e.target.checked)}
                      />
                      Custom Item / Service
                    </label>
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createIncludePresets}
                        disabled={presets.length === 0}
                        onChange={(e) => toggleCreateSource("presets", e.target.checked)}
                      />
                      Multiple Presets
                    </label>
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createIncludePackages}
                        disabled={packages.length === 0}
                        onChange={(e) => toggleCreateSource("packages", e.target.checked)}
                      />
                      Lesson Packages
                    </label>
                  </div>
                </AdminField>
                <AdminField label="Currency" tooltip="Three-letter ISO currency code used for this invoice.">
                  <input
                    value={createCurrency}
                    maxLength={3}
                    onChange={(e) => {
                      const nextInput = e.target.value.toUpperCase();
                      setCreateCurrency(nextInput);
                      if (nextInput.trim().length === 3) {
                        setCreateTaxMode(getDefaultInvoiceTaxModeForCurrencyValue(nextInput));
                      }
                    }}
                  />
                </AdminField>
                <AdminField label="Tax Mode" tooltip={`Whether ${createTaxLabel} applies.`}>
                  <select value={createTaxMode} onChange={(e) => setCreateTaxMode(e.target.value as InvoiceTaxMode)}>
                    <option value="taxable">Taxable ({createTaxLabel})</option>
                    <option value="gst_free">{createTaxLabel} Free</option>
                  </select>
                </AdminField>
                {createUsesBookingLessons && (
                  <AdminField
                    label={createUsesSingleBookingLesson ? "Single Lesson Booking" : "Lesson Bookings"}
                    tooltip={
                      createUsesSingleBookingLesson
                        ? "Choose one approved customer booking to include as a single lesson charge."
                        : "Choose approved customer bookings to include as lesson charges."
                    }
                    fullWidth
                    className="invoice-dialog-source-field"
                  >
                    <div className="invoice-dialog-inline-control">
                      <div className="invoice-dialog-status-card invoice-dialog-source-card">
                        <div className="invoice-dialog-status-row">
                          <span>{createUsesSingleBookingLesson ? "Selected booking:" : "Selected bookings:"}</span>
                          <span>{createSelectedBookingIds.length}</span>
                        </div>
                        {createBookingLessonPreviewLineItems.length > 0 ? (
                          createBookingLessonPreviewLineItems.map((lineItem) => (
                            <div key={lineItem.description} className="invoice-dialog-status-row">
                              <span>{lineItem.description}</span>
                              <span>{toCurrency(lineItem.unitPriceCents * lineItem.quantity, resolvedCreateCurrency)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="helper-text">
                            {createSelectedCustomerId
                              ? createUsesSingleBookingLesson
                                ? "Use the calendar button to choose one booking for this invoice."
                                : "Use the calendar button to choose bookings for this invoice."
                              : createUsesSingleBookingLesson
                                ? "Choose a customer first, then use the calendar button to choose one booking for this invoice."
                                : "Choose a customer first, then use the calendar button to choose bookings for this invoice."}
                          </p>
                        )}
                      </div>
                      <Tooltip
                        content={
                          !createSelectedCustomerId
                            ? createUsesSingleBookingLesson
                              ? "Choose a customer first to select one lesson booking."
                              : "Choose a customer first to select lesson bookings."
                            : createUsesSingleBookingLesson
                              ? "Select one lesson booking."
                              : "Select lesson bookings."
                        }
                      >
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon invoice-dialog-inline-trigger"
                          disabled={!createSelectedCustomerId}
                          onClick={() => {
                            setCreateBookingDialogOpen(true);
                            void loadCreateBookingOptions();
                          }}
                          aria-label={createUsesSingleBookingLesson ? "Select one lesson booking" : "Select lesson bookings"}
                        >
                          <CalendarDays size={18} />
                        </button>
                      </Tooltip>
                    </div>
                  </AdminField>
                )}
                {createUsesQuickLesson && (
                  <AdminField
                    label={`Single Lesson Price (${resolvedCreateCurrency})`}
                    tooltip="Choose one active lesson duration to add a single lesson charge without linking a booking."
                    fullWidth
                    className="invoice-dialog-source-field"
                  >
                    <div className="invoice-dialog-inline-control">
                      <select
                        value={createQuickLessonDurationMinutes}
                        onChange={(event) => setCreateQuickLessonDurationMinutes(event.target.value)}
                      >
                        <option value="">-- Choose lesson duration --</option>
                        {activeLessonPricingChoices.map((option) => (
                          <option key={`quick-lesson-${option.durationMinutes}`} value={String(option.durationMinutes)}>
                            {option.durationMinutes} minutes ({toCurrency(option.priceCents, resolvedCreateCurrency)})
                          </option>
                        ))}
                      </select>
                    </div>
                    {createQuickLessonPreviewLineItems.length > 0 ? (
                      <div className="invoice-dialog-status-card invoice-dialog-source-card">
                        {createQuickLessonPreviewLineItems.map((lineItem) => (
                          <div key={lineItem.description} className="invoice-dialog-status-row">
                            <span>{lineItem.description}</span>
                            <span>{toCurrency(lineItem.unitPriceCents * lineItem.quantity, resolvedCreateCurrency)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="helper-text">
                        {activeLessonPricingChoices.length > 0
                          ? "Choose one active lesson duration to add a single lesson charge."
                          : "Add active lesson durations and prices in Lesson Info / Prices before using quick single lessons."}
                      </p>
                    )}
                  </AdminField>
                )}
                {createIncludeStandalone && (
                  <AdminField
                    label={`Custom Items / Services (${resolvedCreateCurrency})`}
                    tooltip="Add one or more custom items or services with a description and price."
                    fullWidth
                    className="invoice-dialog-source-field"
                  >
                    <div className="invoice-dialog-standalone-list">
                      {createStandaloneItems.map((item) => (
                        <div key={item.key} className="invoice-dialog-standalone-row">
                          <input
                            value={item.description}
                            placeholder="Description of service or item"
                            onChange={(e) => updateCreateStandaloneItem(item.key, { description: e.target.value })}
                          />
                          <input
                            value={item.unitPriceInput}
                            placeholder="0.00"
                            onChange={(e) => updateCreateStandaloneItem(item.key, { unitPriceInput: e.target.value })}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary invoice-dialog-standalone-remove"
                            onClick={() => removeCreateStandaloneItem(item.key)}
                            disabled={createStandaloneItems.length === 1}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <div className="button-row invoice-dialog-source-actions">
                        <button className="btn btn-secondary" type="button" onClick={addCreateStandaloneItem}>
                          Add Custom Item / Service
                        </button>
                      </div>
                    </div>
                  </AdminField>
                )}
                {createIncludePresets && (
                  <AdminField label="Preset Items" tooltip="Choose one or more configured products to include." fullWidth className="invoice-dialog-source-field">
                    <div className="invoice-dialog-preset-list">
                      {presets.map(p => (
                        <label key={`create-preset-${p.id}`} className="admin-inline-checkbox invoice-dialog-preset-option">
                          <input
                            type="checkbox"
                            checked={createSelectedPresetIds.includes(p.id)}
                            onChange={(e) => {
                              if (e.target.checked) setCreateSelectedPresetIds(prev => [...prev, p.id]);
                              else setCreateSelectedPresetIds(prev => prev.filter(id => id !== p.id));
                            }}
                          />
                          {p.label} ({toCurrency(p.unitPriceCents, resolvedCreateCurrency)}{p.discountKind ? `, ${describeDiscount(p.discountKind, p.discountValue ?? null, resolvedCreateCurrency)} off` : ""})
                        </label>
                      ))}
                    </div>
                  </AdminField>
                )}
                {createIncludePackages && (
                  <AdminField
                    label="Lesson Packages"
                    tooltip="Choose one or more prepaid lesson packages. When this invoice is paid, the customer is granted the package's lesson credits automatically."
                    fullWidth
                    className="invoice-dialog-source-field"
                  >
                    <div className="invoice-dialog-preset-list">
                      {packages.map((pkg) => (
                        <label key={`create-package-${pkg.id}`} className="admin-inline-checkbox invoice-dialog-preset-option">
                          <input
                            type="checkbox"
                            checked={createSelectedPackageIds.includes(pkg.id)}
                            onChange={(e) => {
                              if (e.target.checked) setCreateSelectedPackageIds(prev => [...prev, pkg.id]);
                              else setCreateSelectedPackageIds(prev => prev.filter(id => id !== pkg.id));
                            }}
                          />
                          {pkg.label} ({pkg.lessonCount} {pkg.lessonCount === 1 ? "lesson" : "lessons"}{pkg.durationMinutes ? `, ${pkg.durationMinutes} min` : ""}, {toCurrency(pkg.priceCents, resolvedCreateCurrency)})
                        </label>
                      ))}
                    </div>
                  </AdminField>
                )}
                {createBlockingError && (
                  <AdminField label="Create Requirements" fullWidth>
                    <p className="field-error">{createBlockingError}</p>
                  </AdminField>
                )}
                <AdminField label="Due Date (Optional)" tooltip="When the invoice must be paid.">
                  <input type="datetime-local" value={createDueAt} onChange={(e) => setCreateDueAt(e.target.value)} />
                </AdminField>
                <AdminField label="Invoice Discount Type" tooltip={`Optional discount applied to the full invoice subtotal before ${createTaxLabel}.`}>
                  <select
                    value={createDiscountKind ?? ""}
                    onChange={(e) => {
                      const nextKind = e.target.value ? (e.target.value as InvoiceDiscountKind) : null;
                      setCreateDiscountKind(nextKind);
                      if (!nextKind) {
                        setCreateDiscountValueInput("");
                      }
                    }}
                  >
                    <option value="">No discount</option>
                    <option value="amount">Fixed amount</option>
                    <option value="percent">Percentage</option>
                  </select>
                </AdminField>
                <AdminField label="Invoice Discount Value" tooltip={`Amount discounts use ${resolvedCreateCurrency}. Percentage discounts use %.`} fullWidth>
                  <input
                    value={createDiscountValueInput}
                    disabled={!createDiscountKind}
                    placeholder={createDiscountKind === "percent" ? "10%" : "0.00"}
                    onChange={(e) => setCreateDiscountValueInput(e.target.value)}
                  />
                </AdminField>
              </AdminForm>
            </AdminCard>
          </div>
          <div className="dialog-col is-notes invoice-dialog-side-col">
            <h3 className="manual-section-title">Actions & Totals</h3>
            <AdminCard ghost>
              <p className="helper-text">
                {(createUsesBookingLessons || createUsesQuickLesson) && activeLessonPricingChoices.length === 0
                  ? "Add active lesson durations and prices in Lesson Info / Prices before including lesson charges."
                  : "Combine one lesson source, custom items / services, and presets in one invoice. Enabled sources must each contribute at least one item before you can create the invoice."}
              </p>
              <div className="invoice-dialog-status-card">
                <div className="invoice-dialog-status-row">
                  <span>Sources:</span>
                  <span>
                    {[
                      createLessonSourceMode === "single_booking"
                        ? "Single Lesson (Booking)"
                        : createLessonSourceMode === "single_quick"
                          ? "Single Lesson (Quick Price)"
                          : createLessonSourceMode === "multiple_bookings"
                            ? "Multiple Lessons (Bookings)"
                            : null,
                      createIncludeStandalone ? "Custom Item / Service" : null,
                      createIncludePresets ? "Multiple Presets" : null,
                      createIncludePackages ? "Lesson Packages" : null
                    ].filter(Boolean).join(", ") || "None"}
                  </span>
                </div>
                <div className="invoice-dialog-status-row">
                  <span>Subtotal:</span>
                  <span>{toCurrency(createCalculation.totals.subtotalCents, resolvedCreateCurrency)}</span>
                </div>
                {createCalculation.totals.discountCents !== 0 && (
                  <div className="invoice-dialog-status-row">
                    <span>Discount:</span>
                    <span>{toCurrency(-createCalculation.totals.discountCents, resolvedCreateCurrency)}</span>
                  </div>
                )}
                <div className="invoice-dialog-status-row">
                  <span>{createTaxLabel}:</span>
                  <span>{toCurrency(createCalculation.totals.gstCents, resolvedCreateCurrency)}</span>
                </div>
                <div className="invoice-dialog-status-row">
                  <span>Total:</span>
                  <span>{toCurrency(createCalculation.totals.totalCents, resolvedCreateCurrency)}</span>
                </div>
                {createPreviewLineItems.length > 0 && (
                  <>
                    {createPreviewLineItems.map((lineItem) => (
                      <div key={`${lineItem.sortOrder}-${lineItem.description}`} className="invoice-dialog-status-row">
                        <span>{lineItem.description}</span>
                        <span>{toCurrency(lineItem.unitPriceCents * lineItem.quantity, resolvedCreateCurrency)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </AdminCard>
          </div>
        </div>
        </div>
      </AppDialog>

      <InvoiceBookingPickerDialog
        isOpen={createBookingDialogOpen}
        onClose={() => setCreateBookingDialogOpen(false)}
        createUsesSingleBookingLesson={createUsesSingleBookingLesson}
        bookingFilterFrom={createBookingFilterFrom}
        setBookingFilterFrom={setCreateBookingFilterFrom}
        bookingFilterTo={createBookingFilterTo}
        setBookingFilterTo={setCreateBookingFilterTo}
        onRefresh={() => void loadCreateBookingOptions()}
        bookingOptionsLoading={createBookingOptionsLoading}
        bookingOptions={createBookingOptions}
        selectedBookingIds={createSelectedBookingIds}
        setSelectedBookingIds={setCreateSelectedBookingIds}
        setSelectedBookingIdsExact={setCreateSelectedBookingIds}
      />
    </>
  );
}
