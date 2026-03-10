"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";
import { type InvoiceSortBy, type InvoiceSortDirection } from "@/lib/invoices/schema";
import { type InvoiceLifecycleAction } from "@/lib/invoices/transitions";

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type InvoiceTaxMode = "taxable" | "gst_free";

export interface InvoiceLineItem {
    id: string;
    kind: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    taxCents: number;
    taxMode: InvoiceTaxMode;
}

export interface InvoiceRow {
    id: string;
    invoiceNumber: string;
    documentType: "invoice" | "credit_note";
    status: InvoiceStatus;
    issuedAt: string;
    dueAt: string;
    overdueDays: number | null;
    totalCents: number;
    currency: string;
    customerName: string;
    customerFirstName: string | null;
    customerLastName: string | null;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
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
    performAction: (id: string, action: InvoiceAction) => Promise<InvoiceRow | null>;
    create: (payload: Record<string, unknown>) => Promise<InvoiceRow | null>;
    sendBulkReminders: () => Promise<number | null>;
    remove: (id: string) => Promise<boolean>;
}

export type InvoiceAction = "send" | "remind" | "restore" | InvoiceLifecycleAction;

/**
 * Hook to manage admin invoice data operations.
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

    const performAction = useCallback(async (id: string, action: InvoiceAction): Promise<InvoiceRow | null> => {
        let endpoint = `/api/admin/invoices/${id}`;
        let method = "POST";

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
                body: method === "POST" ? JSON.stringify({ action }) : JSON.stringify({ action })
            });

            if (!response.ok) {
                await handleApiError(response, `Unable to perform ${action}.`);
                return null;
            }

            const data = await response.json();
            return (data.invoice || data) as InvoiceRow;
        } catch {
            return null;
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
            setInvoices(prev => [newInvoice, ...prev]);
            setTotalCount(prev => prev + 1);
            return newInvoice;
        } catch {
            return null;
        }
    }, [safeFetch, handleApiError]);

    const sendBulkReminders = useCallback(async (): Promise<number | null> => {
        try {
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

    const remove = useCallback(async (id: string): Promise<boolean> => {
        try {
            const response = await safeFetch(`/api/admin/invoices/${id}`, {
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
