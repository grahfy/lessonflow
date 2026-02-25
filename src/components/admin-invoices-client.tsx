"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { parseAudInputToCents } from "@/lib/invoices/currency";

type InvoiceStatus = "draft" | "sent" | "paid" | "void";
type InvoiceTaxMode = "taxable" | "gst_free";
type InvoiceDocumentType = "invoice" | "credit_note";
type InvoiceAgingBucket = "current" | "overdue_1_30" | "overdue_31_plus";

type InvoiceLineItem = {
  id: string;
  kind: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxMode: InvoiceTaxMode;
  lineSubtotalCents: number;
  lineGstCents: number;
  lineTotalCents: number;
  sortOrder: number;
};

type EditableLineItem = {
  key: string;
  kind: "lesson_fee" | "educational_books" | "digital_guitar_lessons" | "custom";
  description: string;
  quantity: string;
  unitPriceAud: string;
  taxMode: InvoiceTaxMode;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  documentType: InvoiceDocumentType;
  taxMode: InvoiceTaxMode;
  customerId: string | null;
  originalInvoiceId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  notes: string | null;
  issuedAt: string;
  dueAt: string;
  sentAt: string | null;
  paidAt: string | null;
  lastReminderSentAt: string | null;
  lastReminderStage: number | null;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  overdueDays?: number;
  agingBucket?: InvoiceAgingBucket;
  lineItems: InvoiceLineItem[];
};

type CreateCustomerOption = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
};

type CreateBookingOption = {
  id: string;
  status: "approved" | "cancelled";
  startAt: string;
  lessonMode: "in_person" | "video";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
};

type CreateInvoiceBasis = "lesson_based" | "standalone";

/**
 * Main admin invoices surface for list filters, lifecycle actions, reminders, and create flows.
 *
 * The component intentionally reloads invoices after mutations instead of simulating every server
 * transition locally, which keeps UI behavior aligned with route-side calculations and snapshots.
 */
function toCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

function toDateInputValue(value: Date): string {
  return value.toISOString().slice(0, 16);
}

function toMoneyInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function describeAging(bucket?: InvoiceAgingBucket): string {
  if (bucket === "overdue_1_30") {
    return "Overdue 1-30";
  }
  if (bucket === "overdue_31_plus") {
    return "Overdue 31+";
  }
  return "Current";
}

/**
 * Formats appointment timestamps in Melbourne-local style for invoice linking controls.
 */
function formatBookingWhen(value: string): string {
  return new Date(value).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" });
}

/**
 * Builds a readable booking-select label with duration and delivery mode.
 */
function describeBookingOption(option: CreateBookingOption): string {
  const durationLabel =
    option.customDurationMinutes && option.customDurationMinutes > 0
      ? `${option.customDurationMinutes} min`
      : option.lessonDuration === "min30"
        ? "30 min"
        : "60 min";
  return `${formatBookingWhen(option.startAt)} (${durationLabel}) · ${option.lessonMode === "in_person" ? "In-person" : "Video"} · ${option.status}`;
}

/**
 * Converts API validation payloads into one concise UI message.
 */
function readApiErrorMessage(payload: unknown, fallback: string): string {
  const api = payload as
    | {
        error?: string;
        details?: {
          fieldErrors?: Record<string, string[] | undefined>;
          formErrors?: string[];
        };
      }
    | null
    | undefined;
  if (api?.details?.formErrors?.length) {
    return api.details.formErrors[0];
  }
  if (api?.details?.fieldErrors) {
    const firstFieldError = Object.values(api.details.fieldErrors)
      .flat()
      .find((message) => !!message);
    if (firstFieldError) {
      return firstFieldError;
    }
  }
  return api?.error || fallback;
}

/**
 * Main admin invoices surface for search, reminder, and lifecycle actions.
 */
export function AdminInvoicesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerFilter = searchParams.get("customerId") || "";
  const authRedirectingRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | InvoiceStatus>("");
  const [agingFilter, setAgingFilter] = useState<"" | InvoiceAgingBucket>("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");
  const [editingLineItems, setEditingLineItems] = useState<EditableLineItem[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createCustomerQuery, setCreateCustomerQuery] = useState("");
  const [createCustomerOptions, setCreateCustomerOptions] = useState<CreateCustomerOption[]>([]);
  const [createCustomerLoading, setCreateCustomerLoading] = useState(false);
  const [createSelectedCustomerId, setCreateSelectedCustomerId] = useState(customerFilter);
  const [createBookingOptions, setCreateBookingOptions] = useState<CreateBookingOption[]>([]);
  const [createBookingLoading, setCreateBookingLoading] = useState(false);
  const [createSelectedBookingId, setCreateSelectedBookingId] = useState("");
  const [createInvoiceBasis, setCreateInvoiceBasis] = useState<CreateInvoiceBasis>("lesson_based");
  const [createLessonPrice, setCreateLessonPrice] = useState("");
  const [createBooksPrice, setCreateBooksPrice] = useState("");
  const [createDigitalPrice, setCreateDigitalPrice] = useState("");
  const [createLessonCustomLabel, setCreateLessonCustomLabel] = useState("");
  const [createLessonCustomPrice, setCreateLessonCustomPrice] = useState("");
  const [createStandaloneDescription, setCreateStandaloneDescription] = useState("");
  const [createStandalonePrice, setCreateStandalonePrice] = useState("");
  const [createDueAt, setCreateDueAt] = useState(toDateInputValue(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)));
  const [createTaxMode, setCreateTaxMode] = useState<InvoiceTaxMode>("taxable");
  const safeFetch = useCallback(async (...args: Parameters<typeof globalThis.fetch>): Promise<Response> => {
    try {
      return await globalThis.fetch(...args);
    } catch {
      // Mirror the admin bookings pattern so network failures enter the same JSON error path.
      return new Response(JSON.stringify({ error: "Network request failed. Please try again." }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
  }, []);
  const redirectToAdminLogin = useCallback(() => {
    if (authRedirectingRef.current) {
      return;
    }
    authRedirectingRef.current = true;
    setError("");
    // Full navigation avoids depending on stale client-router state after session expiry.
    window.location.assign("/admin/login");
  }, []);

  /**
   * Loads invoices for the current filter set and returns rows for follow-up state sync.
   */
  const loadInvoices = useCallback(async (): Promise<InvoiceRow[]> => {
    setLoading(true);
    setError("");

    // Build the query payload to match the server route filter contract exactly.
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (statusFilter) {
      params.set("status", statusFilter);
    }
    if (agingFilter) {
      params.set("agingBucket", agingFilter);
    }
    if (outstandingOnly) {
      params.set("outstanding", "true");
    }
    if (customerFilter) {
      params.set("customerId", customerFilter);
    }
    params.set("pageSize", "100");

    const response = await safeFetch(`/api/admin/invoices?${params.toString()}`, { cache: "no-store" });
    setLoading(false);
    if (!response.ok) {
      if (response.status === 401) {
        redirectToAdminLogin();
        return [];
      }
      const payload = await response.json().catch(() => null);
      setError(readApiErrorMessage(payload, "Unable to load invoices."));
      return [];
    }

    const payload = (await response.json()) as { invoices: InvoiceRow[] };
    const rows = payload.invoices || [];
    setInvoices(rows);
    return rows;
  }, [agingFilter, customerFilter, outstandingOnly, query, redirectToAdminLogin, safeFetch, statusFilter]);

  useEffect(() => {
    loadInvoices().catch((cause) => setError(cause instanceof Error ? cause.message : "Load failed"));
  }, [loadInvoices]);

  const selectedSummary = useMemo(() => {
    if (!selectedInvoice) {
      return null;
    }
    return {
      issuedAt: new Date(selectedInvoice.issuedAt).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" }),
      dueAt: new Date(selectedInvoice.dueAt).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })
    };
  }, [selectedInvoice]);

  const createSelectedCustomer = useMemo(
    () => createCustomerOptions.find((option) => option.id === createSelectedCustomerId) || null,
    [createCustomerOptions, createSelectedCustomerId]
  );

  /**
   * Restores create dialog fields to their default values after close/success.
   */
  function resetCreateForm() {
    setCreateCustomerQuery("");
    setCreateCustomerOptions([]);
    setCreateSelectedCustomerId(customerFilter);
    setCreateBookingOptions([]);
    setCreateSelectedBookingId("");
    setCreateInvoiceBasis("lesson_based");
    setCreateLessonPrice("");
    setCreateBooksPrice("");
    setCreateDigitalPrice("");
    setCreateLessonCustomLabel("");
    setCreateLessonCustomPrice("");
    setCreateStandaloneDescription("");
    setCreateStandalonePrice("");
    setCreateDueAt(toDateInputValue(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)));
    setCreateTaxMode("taxable");
  }

  /**
   * Keeps customer-filter deep links pre-selected when the create modal opens.
   */
  useEffect(() => {
    if (createOpen && customerFilter && !createSelectedCustomerId) {
      setCreateSelectedCustomerId(customerFilter);
    }
  }, [createOpen, customerFilter, createSelectedCustomerId]);

  /**
   * Loads customer options for picker-style invoice creation with a short debounce.
   */
  useEffect(() => {
    if (!createOpen) {
      return;
    }
    const timer = window.setTimeout(async () => {
      setCreateCustomerLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "80");
      if (createCustomerQuery.trim()) {
        params.set("q", createCustomerQuery.trim());
      }
      const response = await safeFetch(`/api/admin/customers?${params.toString()}`, {
        cache: "no-store"
      });
      setCreateCustomerLoading(false);
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { customers: CreateCustomerOption[] };
      const options = payload.customers || [];
      setCreateCustomerOptions((previous) => {
        const merged = new Map<string, CreateCustomerOption>();
        for (const customer of previous) {
          merged.set(customer.id, customer);
        }
        for (const customer of options) {
          merged.set(customer.id, customer);
        }
        return Array.from(merged.values());
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [createCustomerQuery, createOpen, safeFetch]);

  /**
   * Ensures a selected customer from URL context is loaded into picker options.
   */
  useEffect(() => {
    if (!createOpen || !createSelectedCustomerId) {
      return;
    }
    if (createCustomerOptions.some((option) => option.id === createSelectedCustomerId)) {
      return;
    }
    void (async () => {
      const response = await safeFetch(`/api/admin/customers/${createSelectedCustomerId}`, {
        cache: "no-store"
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { customer: CreateCustomerOption };
      if (!payload.customer) {
        return;
      }
      setCreateCustomerOptions((previous) => {
        if (previous.some((option) => option.id === payload.customer.id)) {
          return previous;
        }
        return [payload.customer, ...previous];
      });
    })();
  }, [createCustomerOptions, createOpen, createSelectedCustomerId, safeFetch]);

  /**
   * Loads appointment options for optional invoice-booking linking.
   */
  useEffect(() => {
    if (!createOpen || !createSelectedCustomerId) {
      setCreateBookingOptions([]);
      setCreateSelectedBookingId("");
      return;
    }
    void (async () => {
      setCreateBookingLoading(true);
      const response = await safeFetch(
        `/api/admin/customers/${createSelectedCustomerId}/invoices?bookingOptions=true&page=1&pageSize=1`,
        { cache: "no-store" }
      );
      setCreateBookingLoading(false);
      if (!response.ok) {
        setCreateBookingOptions([]);
        setCreateSelectedBookingId("");
        return;
      }
      const payload = (await response.json()) as { bookingOptions?: CreateBookingOption[] };
      const options = payload.bookingOptions || [];
      setCreateBookingOptions(options);
      setCreateSelectedBookingId((previous) => (previous && options.some((option) => option.id === previous) ? previous : ""));
    })();
  }, [createOpen, createSelectedCustomerId, safeFetch]);

  /**
   * Signs out current admin from invoices screen.
   */
  async function logout() {
    await safeFetch("/api/admin/logout", { method: "POST" });
    redirectToAdminLogin();
  }

  /**
   * Seeds editor state from invoice data so line-items can be modified in-place.
   */
  function openInvoice(invoice: InvoiceRow) {
    setSelectedInvoice(invoice);
    setEditingNotes(invoice.notes || "");
    setEditingDueAt(toDateInputValue(new Date(invoice.dueAt)));
    setEditingLineItems(
      invoice.lineItems.map((lineItem, index) => ({
        key: `${lineItem.id}-${index}`,
        kind:
          lineItem.kind === "lesson_fee" ||
          lineItem.kind === "educational_books" ||
          lineItem.kind === "digital_guitar_lessons" ||
          lineItem.kind === "custom"
            ? lineItem.kind
            : "custom",
        description: lineItem.description,
        quantity: String(lineItem.quantity),
        unitPriceAud: toMoneyInput(lineItem.unitPriceCents),
        taxMode: lineItem.taxMode
      }))
    );
    setError("");
  }

  /**
   * Adds a custom line item for quick ad-hoc adjustments.
   */
  function addEditableLineItem() {
    setEditingLineItems((previous) => [
      ...previous,
      {
        key: `new-${Date.now()}-${previous.length}`,
        kind: "custom",
        description: "",
        quantity: "1",
        unitPriceAud: "0.00",
        taxMode: selectedInvoice?.taxMode ?? "taxable"
      }
    ]);
  }

  /**
   * Converts line-item form data into API payload while guarding against bad input.
   */
  function buildLineItemsPayload():
    | Array<{
        kind: "lesson_fee" | "educational_books" | "digital_guitar_lessons" | "custom";
        description: string;
        quantity: number;
        unitPriceCents: number;
        taxMode: InvoiceTaxMode;
        sortOrder: number;
      }>
    | null {
    const mapped = editingLineItems.map((lineItem, index) => {
      const quantity = Number.parseInt(lineItem.quantity, 10);
      const unitPriceCents = Math.round(Number.parseFloat(lineItem.unitPriceAud || "0") * 100);
      return {
        kind: lineItem.kind,
        description: lineItem.description.trim(),
        quantity,
        unitPriceCents,
        taxMode: lineItem.taxMode,
        sortOrder: index
      };
    });

    const invalid = mapped.some(
      (lineItem) => !lineItem.description || !Number.isFinite(lineItem.quantity) || lineItem.quantity < 1 || !Number.isFinite(lineItem.unitPriceCents) || lineItem.unitPriceCents < 0
    );

    if (invalid || mapped.length < 1) {
      setError("Each line item needs description, quantity >= 1, and unit price >= 0.");
      return null;
    }

    return mapped;
  }

  /**
   * Persists invoice edits including notes, due date, and editable line items.
   */
  async function saveInvoiceEdits() {
    if (!selectedInvoice) {
      return;
    }

    let lineItemsPayload:
      | Array<{
          kind: "lesson_fee" | "educational_books" | "digital_guitar_lessons" | "custom";
          description: string;
          quantity: number;
          unitPriceCents: number;
          taxMode: InvoiceTaxMode;
          sortOrder: number;
        }>
      | undefined;

    if (selectedInvoice.documentType === "invoice") {
      lineItemsPayload = buildLineItemsPayload() || undefined;
      if (!lineItemsPayload) {
        return;
      }
    }

    setBusyAction("save");
    const response = await safeFetch(`/api/admin/invoices/${selectedInvoice.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        notes: editingNotes,
        dueAt: new Date(editingDueAt).toISOString(),
        lineItems: lineItemsPayload
      })
    });
    setBusyAction(null);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(readApiErrorMessage(payload, "Unable to save invoice."));
      return;
    }

    const refreshedRows = await loadInvoices();
    const refreshed = refreshedRows.find((invoice) => invoice.id === selectedInvoice.id);
    if (refreshed) {
      openInvoice(refreshed);
    }
    setNotice("Invoice updated.");
  }

  /**
   * Applies lifecycle and communication actions on selected invoice.
   */
  async function runInvoiceAction(action: "mark_paid" | "mark_unpaid" | "void" | "send" | "delete" | "remind" | "create_credit_note") {
    if (!selectedInvoice) {
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm("Delete this invoice record? This action is best reserved for draft/error records.");
      if (!confirmed) {
        return;
      }
    }

    const creditNoteReason =
      action === "create_credit_note"
        ? window.prompt("Reason for credit note (optional):", "")?.trim()
        : undefined;

    setBusyAction(action);

    const endpoint =
      action === "send"
        ? `/api/admin/invoices/${selectedInvoice.id}/send`
        : action === "delete"
          ? `/api/admin/invoices/${selectedInvoice.id}`
          : action === "remind"
            ? `/api/admin/invoices/${selectedInvoice.id}/remind`
            : action === "create_credit_note"
              ? `/api/admin/invoices/${selectedInvoice.id}/credit-note`
              : `/api/admin/invoices/${selectedInvoice.id}`;

    const method = action === "send" || action === "remind" || action === "create_credit_note" ? "POST" : action === "delete" ? "DELETE" : "PATCH";

    const body =
      action === "mark_paid" || action === "mark_unpaid" || action === "void"
        ? JSON.stringify({ action })
        : action === "create_credit_note"
          ? JSON.stringify({ reason: creditNoteReason || undefined })
          : undefined;

    const response = await safeFetch(endpoint, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body
    });

    setBusyAction(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(readApiErrorMessage(payload, "Invoice action failed."));
      return;
    }

    const payload = (await response.json().catch(() => null)) as { invoice?: InvoiceRow; sentCount?: number } | null;
    const refreshedRows = await loadInvoices();

    if (action === "delete") {
      setSelectedInvoice(null);
    } else if (action === "create_credit_note" && payload?.invoice) {
      openInvoice(payload.invoice);
    } else {
      const refreshed = refreshedRows.find((invoice) => invoice.id === selectedInvoice.id);
      if (refreshed) {
        openInvoice(refreshed);
      }
    }

    setNotice(
      action === "send"
        ? "Invoice sent."
        : action === "mark_paid"
          ? "Invoice marked as paid."
          : action === "mark_unpaid"
            ? "Invoice marked as unpaid."
            : action === "void"
              ? "Invoice voided."
              : action === "remind"
                ? "Reminder email sent."
                : action === "create_credit_note"
                  ? "Credit note created."
                  : "Invoice deleted."
    );
  }

  /**
   * Sends all currently eligible overdue reminders in one admin action.
   */
  async function sendBulkReminders() {
    setBusyAction("bulk_reminders");
    const response = await safeFetch("/api/admin/invoices/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        maxInvoices: 100,
        customerId: customerFilter || undefined
      })
    });
    setBusyAction(null);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(readApiErrorMessage(payload, "Unable to send reminders."));
      return;
    }

    const payload = (await response.json()) as { sentCount: number; eligibleCount: number; failedCount: number };
    setNotice(
      `Reminder run complete. Sent ${payload.sentCount} of ${payload.eligibleCount} eligible invoices${
        payload.failedCount ? ` (${payload.failedCount} failed)` : ""
      }.`
    );
    await loadInvoices();
  }

  /**
   * Opens the server PDF endpoint in a separate tab to trigger download.
   */
  function downloadInvoicePdf(invoiceId: string) {
    window.open(`/api/admin/invoices/${invoiceId}/pdf`, "_blank", "noopener,noreferrer");
  }

  /**
   * Creates a new invoice for a selected customer with optional booking linkage.
   */
  async function createInvoice() {
    setError("");
    setNotice("");

    if (!createSelectedCustomerId) {
      setError("Select a customer to create an invoice.");
      return;
    }

    const dueAtDate = new Date(createDueAt);
    if (Number.isNaN(dueAtDate.getTime())) {
      setError("Choose a valid due date.");
      return;
    }

    const lineItems: Array<{
      kind: "lesson_fee" | "educational_books" | "digital_guitar_lessons" | "custom";
      description: string;
      quantity: number;
      unitPriceCents: number;
      taxMode: InvoiceTaxMode;
      sortOrder: number;
    }> = [];

    if (createInvoiceBasis === "lesson_based") {
      const lessonPrice = parseAudInputToCents(createLessonPrice);
      if (lessonPrice.cents === null) {
        setError(lessonPrice.error || "Lesson fee is required.");
        return;
      }
      lineItems.push({
        kind: "lesson_fee",
        description: "Lesson fee",
        quantity: 1,
        unitPriceCents: lessonPrice.cents,
        taxMode: createTaxMode,
        sortOrder: lineItems.length
      });

      if (createBooksPrice.trim()) {
        const booksPrice = parseAudInputToCents(createBooksPrice);
        if (booksPrice.cents === null) {
          setError(booksPrice.error || "Educational books amount is invalid.");
          return;
        }
        if (booksPrice.cents > 0) {
          lineItems.push({
            kind: "educational_books",
            description: "Educational books",
            quantity: 1,
            unitPriceCents: booksPrice.cents,
            taxMode: createTaxMode,
            sortOrder: lineItems.length
          });
        }
      }

      if (createDigitalPrice.trim()) {
        const digitalPrice = parseAudInputToCents(createDigitalPrice);
        if (digitalPrice.cents === null) {
          setError(digitalPrice.error || "Digital guitar lessons amount is invalid.");
          return;
        }
        if (digitalPrice.cents > 0) {
          lineItems.push({
            kind: "digital_guitar_lessons",
            description: "Digital guitar lessons",
            quantity: 1,
            unitPriceCents: digitalPrice.cents,
            taxMode: createTaxMode,
            sortOrder: lineItems.length
          });
        }
      }

      if (createLessonCustomLabel.trim() || createLessonCustomPrice.trim()) {
        if (!createLessonCustomLabel.trim()) {
          setError("Custom charge label is required when custom amount is provided.");
          return;
        }
        const customPrice = parseAudInputToCents(createLessonCustomPrice);
        if (customPrice.cents === null) {
          setError(customPrice.error || "Custom charge amount is invalid.");
          return;
        }
        if (customPrice.cents > 0) {
          lineItems.push({
            kind: "custom",
            description: createLessonCustomLabel.trim(),
            quantity: 1,
            unitPriceCents: customPrice.cents,
            taxMode: createTaxMode,
            sortOrder: lineItems.length
          });
        }
      }
    } else {
      if (!createStandaloneDescription.trim()) {
        setError("Standalone invoice description is required.");
        return;
      }
      const standalonePrice = parseAudInputToCents(createStandalonePrice);
      if (standalonePrice.cents === null) {
        setError(standalonePrice.error || "Standalone invoice amount is required.");
        return;
      }
      lineItems.push({
        kind: "custom",
        description: createStandaloneDescription.trim(),
        quantity: 1,
        unitPriceCents: standalonePrice.cents,
        taxMode: createTaxMode,
        sortOrder: 0
      });
    }

    if (!lineItems.length) {
      setError("Add at least one line item to create the invoice.");
      return;
    }

    setBusyAction("create");
    const response = await safeFetch(`/api/admin/customers/${createSelectedCustomerId}/invoices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bookingId: createSelectedBookingId || undefined,
        taxMode: createTaxMode,
        dueAt: dueAtDate.toISOString(),
        lineItems
      })
    });
    setBusyAction(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(readApiErrorMessage(payload, "Unable to create invoice."));
      return;
    }

    const payload = (await response.json()) as { invoice: InvoiceRow };
    setCreateOpen(false);
    resetCreateForm();
    setNotice("Invoice created.");
    openInvoice(payload.invoice);
    await loadInvoices();
  }

  return (
    <div className="admin-shell">
      <div className="admin-card booking-row admin-header-row">
        <h1 className="admin-console-title">Invoice Console</h1>
        <div className="booking-row">
          <button className="btn btn-secondary" onClick={() => router.push("/admin/bookings")}>Bookings</button>
          <button className="btn btn-secondary" onClick={() => router.push("/admin/settings")}>Settings</button>
          <button className="btn btn-secondary" onClick={() => void logout()}>Sign out</button>
        </div>
      </div>

      <div className="admin-card invoice-toolbar">
        <div className="field">
          <label>Search</label>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice #, customer, email" />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | InvoiceStatus)}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </div>
        <div className="field">
          <label>Aging</label>
          <select value={agingFilter} onChange={(event) => setAgingFilter(event.target.value as "" | InvoiceAgingBucket)}>
            <option value="">All</option>
            <option value="current">Current</option>
            <option value="overdue_1_30">Overdue 1-30</option>
            <option value="overdue_31_plus">Overdue 31+</option>
          </select>
        </div>
        <label className="helper-toggle">
          <input type="checkbox" checked={outstandingOnly} onChange={(event) => setOutstandingOnly(event.target.checked)} /> Outstanding only
        </label>
        <button className="btn btn-secondary" onClick={() => void loadInvoices()}>Refresh</button>
        <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void sendBulkReminders()}>
          {busyAction === "bulk_reminders" ? "Sending..." : "Send Due Reminders"}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            resetCreateForm();
            setCreateOpen(true);
          }}
        >
          Create Invoice
        </button>
      </div>

      <p className="helper-text">
        GST guidance: private lesson GST treatment can vary by business setup. Keep your default tax mode aligned with accountant advice.
      </p>

      {error ? <p className="notice error">{error}</p> : null}
      {notice ? <p className="notice success">{notice}</p> : null}
      {loading ? <p className="notice">Loading...</p> : null}

      <div className="admin-card invoice-list-card">
        <p className="helper-text customers-count">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}</p>
        <div className="customers-list">
          {invoices.length ? (
            invoices.map((invoice) => (
              <div key={invoice.id} className="customer-item invoice-item">
                <div className="customer-item-meta">
                  <strong>{invoice.invoiceNumber} - {invoice.customerName}</strong>
                  <span><small>Type</small> {invoice.documentType === "credit_note" ? "Credit note" : "Invoice"}</span>
                  <span><small>Status</small> {invoice.status}</span>
                  <span><small>Total</small> {toCurrency(invoice.totalCents)}</span>
                  <span><small>Aging</small> {describeAging(invoice.agingBucket)}{invoice.overdueDays ? ` (${invoice.overdueDays}d)` : ""}</span>
                  <span><small>Due</small> {new Date(invoice.dueAt).toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne" })}</span>
                </div>
                <div className="customer-item-actions">
                  <button className="btn btn-secondary" onClick={() => openInvoice(invoice)}>View</button>
                  <button className="btn btn-secondary" onClick={() => downloadInvoicePdf(invoice.id)}>Download PDF</button>
                </div>
              </div>
            ))
          ) : (
            <p className="helper-text">No invoices found.</p>
          )}
        </div>
      </div>

      {selectedInvoice ? (
        <div className="dialog-backdrop" onClick={() => setSelectedInvoice(null)}>
          <div className="dialog-panel dialog-panel-wide" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head">
              <h3>{selectedInvoice.invoiceNumber}</h3>
              <button className="btn btn-secondary" onClick={() => setSelectedInvoice(null)}>Close</button>
            </div>
            {selectedSummary ? (
              <p className="helper-text dialog-status">
                {selectedInvoice.documentType === "credit_note" ? "Credit note" : "Invoice"} · Status <strong>{selectedInvoice.status}</strong> · Issued {selectedSummary.issuedAt} · Due {selectedSummary.dueAt}
              </p>
            ) : null}
            <div className="manual-grid manual-grid-2">
              <div className="field">
                <label>Customer</label>
                <input value={selectedInvoice.customerName} readOnly />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={selectedInvoice.customerEmail} readOnly />
              </div>
              <div className="field">
                <label>Due At</label>
                <input type="datetime-local" value={editingDueAt} onChange={(event) => setEditingDueAt(event.target.value)} />
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea value={editingNotes} onChange={(event) => setEditingNotes(event.target.value)} />
              </div>
            </div>

            <div className="invoice-line-list">
              {editingLineItems.map((lineItem, index) => (
                <div key={lineItem.key} className="invoice-line-item invoice-line-item-editable">
                  <input
                    value={lineItem.description}
                    onChange={(event) =>
                      setEditingLineItems((previous) =>
                        previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, description: event.target.value } : entry))
                      )
                    }
                    readOnly={selectedInvoice.documentType === "credit_note"}
                    placeholder="Description"
                  />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={lineItem.quantity}
                    onChange={(event) =>
                      setEditingLineItems((previous) =>
                        previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantity: event.target.value } : entry))
                      )
                    }
                    readOnly={selectedInvoice.documentType === "credit_note"}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={lineItem.unitPriceAud}
                    onChange={(event) =>
                      setEditingLineItems((previous) =>
                        previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, unitPriceAud: event.target.value } : entry))
                      )
                    }
                    readOnly={selectedInvoice.documentType === "credit_note"}
                  />
                  <select
                    value={lineItem.taxMode}
                    onChange={(event) =>
                      setEditingLineItems((previous) =>
                        previous.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, taxMode: event.target.value as InvoiceTaxMode } : entry
                        )
                      )
                    }
                    disabled={selectedInvoice.documentType === "credit_note"}
                  >
                    <option value="taxable">Taxable (GST)</option>
                    <option value="gst_free">GST-free</option>
                  </select>
                  <button
                    className="btn btn-secondary"
                    disabled={selectedInvoice.documentType === "credit_note" || editingLineItems.length <= 1}
                    onClick={() =>
                      setEditingLineItems((previous) => previous.filter((_, entryIndex) => entryIndex !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {selectedInvoice.documentType === "invoice" ? (
              <div className="dialog-actions dialog-actions-inline">
                <button className="btn btn-secondary" onClick={() => addEditableLineItem()}>Add line item</button>
              </div>
            ) : null}

            <div className="invoice-total-stack">
              <span>Subtotal: {toCurrency(selectedInvoice.subtotalCents)}</span>
              <span>GST: {toCurrency(selectedInvoice.gstCents)}</span>
              <strong>Total: {toCurrency(selectedInvoice.totalCents)}</strong>
            </div>

            <div className="dialog-actions">
              <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void saveInvoiceEdits()}>
                {busyAction === "save" ? "Saving..." : "Save"}
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void runInvoiceAction("send")}>
                {busyAction === "send" ? "Sending..." : "Send"}
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => downloadInvoicePdf(selectedInvoice.id)}>
                Download PDF
              </button>
              <button
                className="btn btn-secondary"
                disabled={!!busyAction || selectedInvoice.status !== "sent" || (selectedInvoice.overdueDays || 0) < 1}
                onClick={() => void runInvoiceAction("remind")}
              >
                {busyAction === "remind" ? "Sending reminder..." : "Send reminder"}
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void runInvoiceAction("mark_paid")}>
                Mark paid
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void runInvoiceAction("mark_unpaid")}>
                Mark unpaid
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction || selectedInvoice.documentType !== "invoice" || (selectedInvoice.status !== "sent" && selectedInvoice.status !== "paid")} onClick={() => void runInvoiceAction("create_credit_note")}>
                {busyAction === "create_credit_note" ? "Creating..." : "Create credit note"}
              </button>
              <button className="btn btn-danger" disabled={!!busyAction} onClick={() => void runInvoiceAction("void")}>
                Void
              </button>
              <button
                className="btn btn-danger"
                disabled={!!busyAction || (selectedInvoice.documentType === "invoice" && (selectedInvoice.status === "sent" || selectedInvoice.status === "paid"))}
                onClick={() => void runInvoiceAction("delete")}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="dialog-backdrop"
          onClick={() => {
            resetCreateForm();
            setCreateOpen(false);
          }}
        >
          <div className="dialog-panel dialog-panel-wide" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head">
              <h3>Create Invoice</h3>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  resetCreateForm();
                  setCreateOpen(false);
                }}
              >
                Close
              </button>
            </div>
            <p className="helper-text dialog-status">
              Select a customer, optionally link an appointment, and enter prices in formats like `$50`, `50`, or `50.00`.
            </p>
            <div className="manual-grid manual-grid-2">
              <div className="field manual-span-2">
                <label>Find customer</label>
                <input
                  value={createCustomerQuery}
                  onChange={(event) => setCreateCustomerQuery(event.target.value)}
                  placeholder="Search by name, email, or phone"
                />
              </div>
              <div className="field manual-span-2">
                <label>Selected customer</label>
                <select
                  value={createSelectedCustomerId}
                  onChange={(event) => {
                    setCreateSelectedCustomerId(event.target.value);
                    setCreateSelectedBookingId("");
                  }}
                >
                  <option value="">Select customer</option>
                  {createCustomerOptions.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.fullName} · {customer.email} · {customer.phone}
                    </option>
                  ))}
                </select>
                {createCustomerLoading ? <p className="helper-text">Loading customers...</p> : null}
              </div>
              {createSelectedCustomer ? (
                <div className="manual-customer-summary manual-span-2">
                  <span>
                    <small>Customer</small> {createSelectedCustomer.fullName}
                  </span>
                  <span>
                    <small>Email</small> {createSelectedCustomer.email}
                  </span>
                  <span>
                    <small>Phone</small> {createSelectedCustomer.phone}
                  </span>
                  <span>
                    <small>Address</small>{" "}
                    {[createSelectedCustomer.houseNumber, createSelectedCustomer.streetName, createSelectedCustomer.streetType, createSelectedCustomer.suburb, createSelectedCustomer.state, createSelectedCustomer.postcode]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                </div>
              ) : null}
              <div className="field manual-span-2">
                <label>Link appointment (optional)</label>
                <select
                  value={createSelectedBookingId}
                  onChange={(event) => setCreateSelectedBookingId(event.target.value)}
                  disabled={!createSelectedCustomerId}
                >
                  <option value="">No appointment link</option>
                  {createBookingOptions.map((booking) => (
                    <option key={booking.id} value={booking.id}>
                      {describeBookingOption(booking)}
                    </option>
                  ))}
                </select>
                {createBookingLoading ? <p className="helper-text">Loading appointments...</p> : null}
              </div>
              <div className="field">
                <label>Invoice basis</label>
                <select
                  value={createInvoiceBasis}
                  onChange={(event) => setCreateInvoiceBasis(event.target.value as CreateInvoiceBasis)}
                >
                  <option value="lesson_based">Lesson-based</option>
                  <option value="standalone">Standalone</option>
                </select>
              </div>
              <div className="field">
                <label>Due at</label>
                <input type="datetime-local" value={createDueAt} onChange={(event) => setCreateDueAt(event.target.value)} />
              </div>
              <div className="field">
                <label>Tax mode</label>
                <select value={createTaxMode} onChange={(event) => setCreateTaxMode(event.target.value as InvoiceTaxMode)}>
                  <option value="taxable">Taxable (GST)</option>
                  <option value="gst_free">GST-free</option>
                </select>
              </div>
              {createInvoiceBasis === "lesson_based" ? (
                <>
                  <div className="field">
                    <label>Lesson fee (AUD)</label>
                    <input value={createLessonPrice} onChange={(event) => setCreateLessonPrice(event.target.value)} />
                  </div>
                  <div className="field">
                    <label>Educational books (optional)</label>
                    <input value={createBooksPrice} onChange={(event) => setCreateBooksPrice(event.target.value)} />
                  </div>
                  <div className="field">
                    <label>Digital guitar lessons (optional)</label>
                    <input value={createDigitalPrice} onChange={(event) => setCreateDigitalPrice(event.target.value)} />
                  </div>
                  <div className="field">
                    <label>Custom charge label (optional)</label>
                    <input value={createLessonCustomLabel} onChange={(event) => setCreateLessonCustomLabel(event.target.value)} />
                  </div>
                  <div className="field">
                    <label>Custom charge amount (optional)</label>
                    <input value={createLessonCustomPrice} onChange={(event) => setCreateLessonCustomPrice(event.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <label>Standalone description</label>
                    <input
                      value={createStandaloneDescription}
                      onChange={(event) => setCreateStandaloneDescription(event.target.value)}
                      placeholder="e.g. Term package payment"
                    />
                  </div>
                  <div className="field">
                    <label>Standalone amount (AUD)</label>
                    <input
                      value={createStandalonePrice}
                      onChange={(event) => setCreateStandalonePrice(event.target.value)}
                      placeholder="$120.00"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="dialog-actions">
              <button
                className="btn btn-secondary"
                disabled={!!busyAction}
                onClick={() => {
                  resetCreateForm();
                  setCreateOpen(false);
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void createInvoice()}>
                {busyAction === "create" ? "Creating..." : "Create invoice"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
