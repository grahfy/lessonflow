"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";

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
    load: (query?: string, page?: number, outstandingOnly?: boolean) => Promise<void>;
    save: (id: string, payload: Partial<InvoiceRow>) => Promise<InvoiceRow | null>;
    performAction: (id: string, action: string) => Promise<InvoiceRow | null>;
    create: (payload: any) => Promise<InvoiceRow | null>;
    sendBulkReminders: () => Promise<number | null>;
}

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

    const load = useCallback(async (query = "", page = 1, outstandingOnly = false) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                pageSize: pageSize.toString(),
                q: query,
                outstanding: outstandingOnly ? "true" : "false"
            });
            const response = await safeFetch(`/api/admin/invoices?${params.toString()}`);
            if (!response.ok) {
                await handleApiError(response, "Unable to load invoices.");
                return;
            }
            const data = await response.json();
            setInvoices(data.invoices || []);
            setTotalCount(data.totalCount || 0);
            setTotalPages(data.totalPages || 0);
        } catch {
            if (onError) onError("Network error loading invoices.");
        } finally {
            setLoading(false);
        }
    }, [pageSize, safeFetch, handleApiError, onError]);

    const save = useCallback(async (id: string, payload: Partial<InvoiceRow>): Promise<InvoiceRow | null> => {
        try {
            const response = await safeFetch(`/api/admin/invoices/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to save invoice edits.");
                return null;
            }

            return await response.json() as InvoiceRow;
        } catch {
            if (onError) onError("Network error saving invoice.");
            return null;
        }
    }, [safeFetch, handleApiError, onError]);

    const performAction = useCallback(async (id: string, action: string): Promise<InvoiceRow | null> => {
        try {
            const response = await safeFetch(`/api/admin/invoices/${id}/actions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action })
            });

            if (!response.ok) {
                await handleApiError(response, `Unable to perform ${action}.`);
                return null;
            }

            return await response.json() as InvoiceRow;
        } catch {
            if (onError) onError(`Network error during ${action}.`);
            return null;
        }
    }, [safeFetch, handleApiError, onError]);

    const create = useCallback(async (payload: any): Promise<InvoiceRow | null> => {
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

            return await response.json() as InvoiceRow;
        } catch {
            if (onError) onError("Network error creating invoice.");
            return null;
        }
    }, [safeFetch, handleApiError, onError]);

    const sendBulkReminders = useCallback(async (): Promise<number | null> => {
        try {
            const response = await safeFetch("/api/admin/invoices/bulk-reminders", { method: "POST" });
            if (!response.ok) {
                await handleApiError(response, "Unable to send bulk reminders.");
                return null;
            }
            const data = await response.json() as { count: number };
            return data.count;
        } catch {
            if (onError) onError("Network error sending bulk reminders.");
            return null;
        }
    }, [safeFetch, handleApiError, onError]);

    return {
        invoices,
        loading,
        totalCount,
        totalPages,
        load,
        save,
        performAction,
        create,
        sendBulkReminders
    };
}
