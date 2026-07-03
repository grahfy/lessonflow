"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";
import { type InvoiceSortBy, type InvoiceSortDirection } from "@/lib/invoices/schema";
import { type InvoiceLifecycleAction } from "@/lib/invoices/transitions";

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type InvoiceTaxMode = "taxable" | "gst_free";
export type InvoiceDiscountKind = "amount" | "percent";

export interface InvoiceLineItem {
    id: string;
    kind: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    discountKind: InvoiceDiscountKind | null;
    discountValue: number | null;
    lineDiscountCents: number;
    lineSubtotalCents: number;
    lineTotalCents: number;
    lineGstCents: number;
    taxMode: InvoiceTaxMode;
    packageId: string | null;
}

export interface InvoiceRow {
    id: string;
    invoiceNumber: string;
    documentType: "invoice" | "credit_note";
    status: InvoiceStatus;
    paymentDetailsSource: "system" | "custom";
    issuedAt: string;
    dueAt: string;
    paidAt: string | null;
    paidVia: "manual" | "stripe" | null;
    overdueDays: number | null;
    discountKind: InvoiceDiscountKind | null;
    discountValue: number | null;
    discountCents: number;
    totalCents: number;
    currency: string;
    customerName: string;
    customerFirstName: string | null;
    customerLastName: string | null;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
    bankName: string;
    bankBsb: string;
    bankAccountName: string;
    bankAccountNumber: string;
    customerId: string | null;
    notes: string | null;
    lineItems: InvoiceLineItem[];
}

export interface UseInvoicesOptions {
    pageSize?: number;
    onAuthError?: () => void;
    onError?: (message: string) => void;
}

export interface UseInvoicesResult {
    invoices: InvoiceRow[];
    loading: boolean;
    totalCount: number;
    totalPages: number;
    load: (
        query?: string,
        page?: number,
        outstandingOnly?: boolean,
        sortBy?: InvoiceSortBy,
        sortDir?: InvoiceSortDirection
    ) => Promise<void>;
    save: (id: string, payload: Record<string, unknown>) => Promise<InvoiceRow | null>;
    performAction: (id: string, action: InvoiceAction, payload?: Record<string, unknown>) => Promise<InvoiceActionResult>;
    create: (payload: Record<string, unknown>) => Promise<InvoiceRow | null>;
    sendBulkReminders: () => Promise<number | null>;
    remove: (id: string, force?: boolean) => Promise<boolean>;
}

export type InvoiceAction = "send" | "remind" | "restore" | InvoiceLifecycleAction;

export interface InvoiceActionResult {
    invoice: InvoiceRow | null;
    notice?: string;
    partial?: boolean;
}

/**
 * Centralizes the admin invoices screen's fetch/mutation behavior.
 *
 * RATIONALE: The invoices UI drives several independent actions against different
 * route handlers (list, create, edit, lifecycle transitions, reminders, delete).
 * Keeping them behind one hook lets the page coordinate auth failures and error
 * messaging consistently without duplicating request wiring.
 */
export function useInvoices(options: UseInvoicesOptions = {}): UseInvoicesResult {
    const { pageSize = 25, onAuthError, onError } = options;
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

    const load = useCallback(async (
        query = "",
        page = 1,
        outstandingOnly = false,
        sortBy: InvoiceSortBy = "invoice_number",
        sortDir: InvoiceSortDirection = "desc"
    ) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                pageSize: pageSize.toString(),
                q: query,
                outstanding: outstandingOnly ? "true" : "false",
                sortBy,
                sortDir
            });
            const response = await safeFetch(`/api/admin/invoices?${params.toString()}`);
            if (!response.ok) {
                await handleApiError(response, "Unable to load invoices.");
                return;
            }
            const data = await response.json();
            setInvoices(data.invoices || []);
            // RATIONALE: Older admin flows and newer paginated responses use
            // slightly different count keys. We tolerate both so UI upgrades do
            // not require lockstep deployment with API naming changes.
            const resolvedTotalCount =
                typeof data.totalCount === "number"
                    ? data.totalCount
                    : typeof data.total === "number"
                        ? data.total
                        : Array.isArray(data.invoices)
                            ? data.invoices.length
                            : 0;
            const resolvedTotalPages =
                typeof data.totalPages === "number"
                    ? data.totalPages
                    : resolvedTotalCount > 0
                        ? Math.max(1, Math.ceil(resolvedTotalCount / pageSize))
                        : 0;
            setTotalCount(resolvedTotalCount);
            setTotalPages(resolvedTotalPages);
        } catch {
            if (onError) onError("Network error loading invoices.");
        } finally {
            setLoading(false);
        }
    }, [pageSize, safeFetch, handleApiError, onError]);

    const save = useCallback(async (id: string, payload: Record<string, unknown>): Promise<InvoiceRow | null> => {
        try {
            const response = await safeFetch(`/api/admin/invoices/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "edit", ...payload })
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to save invoice edits.");
                return null;
            }

            const data = await response.json();
            return (data.invoice || data) as InvoiceRow;
        } catch {
            return null;
        }
    }, [safeFetch, handleApiError]);

    const performAction = useCallback(async (id: string, action: InvoiceAction, payload?: Record<string, unknown>): Promise<InvoiceActionResult> => {
        let endpoint = `/api/admin/invoices/${id}`;
        let method = "POST";

        // RATIONALE: "send" and "remind" have dedicated side-effect routes,
        // while lifecycle status transitions remain PATCHes on the main
        // document endpoint. The hook hides that contract split from the page.
        if (action === "send") endpoint = `/api/admin/invoices/${id}/send`;
        else if (action === "remind") endpoint = `/api/admin/invoices/${id}/remind`;
        else if (action === "mark_paid" || action === "mark_unpaid" || action === "void" || action === "restore") {
            method = "PATCH";
            endpoint = `/api/admin/invoices/${id}`;
        }

        try {
            const response = await safeFetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...payload })
            });

            if (!response.ok) {
                await handleApiError(response, `Unable to perform ${action}.`);
                return { invoice: null };
            }

            const data = await response.json();
            const notice =
                typeof data?.warning === "string"
                    ? data.warning
                    : typeof data?.message === "string"
                        ? data.message
                        : undefined;
            return {
                invoice: (data.invoice || data) as InvoiceRow,
                notice,
                partial: data?.partial === true
            };
        } catch {
            return { invoice: null };
        }
    }, [safeFetch, handleApiError]);

    const create = useCallback(async (payload: Record<string, unknown>): Promise<InvoiceRow | null> => {
        try {
            const response = await safeFetch("/api/admin/invoices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to create invoice.");
                return null;
            }

            const data = await response.json();
            const newInvoice = data.invoice as InvoiceRow;
            // NOTE: We optimistically prepend the new draft so the admin sees
            // feedback immediately, but callers still reload after important
            // follow-up actions (for example send/open) to reconcile server data.
            setInvoices(prev => [newInvoice, ...prev]);
            setTotalCount(prev => prev + 1);
            return newInvoice;
        } catch {
            return null;
        }
    }, [safeFetch, handleApiError]);

    const sendBulkReminders = useCallback(async (): Promise<number | null> => {
        try {
            // RATIONALE: The reminders endpoint is command-style. An empty JSON
            // body keeps the request explicit and avoids framework/body-parser
            // inconsistencies around POSTs with no payload.
            const response = await safeFetch("/api/admin/invoices/reminders", { 
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({})
            });
            if (!response.ok) {
                await handleApiError(response, "Unable to send bulk reminders.");
                return null;
            }
            const data = await response.json() as { count: number };
            return data.count;
        } catch {
            return null;
        }
    }, [safeFetch, handleApiError]);

    const remove = useCallback(async (id: string, force = false): Promise<boolean> => {
        try {
            const url = force
                ? `/api/admin/invoices/${id}?force=true`
                : `/api/admin/invoices/${id}`;
            const response = await safeFetch(url, {
                method: "DELETE"
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to delete invoice.");
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }, [safeFetch, handleApiError]);

    return {
        invoices,
        loading,
        totalCount,
        totalPages,
        load,
        save,
        performAction,
        create,
        sendBulkReminders,
        remove
    };
}
