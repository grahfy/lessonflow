"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";
import { type CustomerRow } from "@/components/admin/customers/customer-profile-dialog";
import { type CustomersSortBy, type CustomersSortDirection } from "@/lib/customers/schema";
import { type ApiFieldErrors } from "./utils";

export interface UseCustomersOptions {
    /** Number of customers per page */
    pageSize?: number;
    /** Initial query */
    initialQuery?: string;
    /** Called on auth error */
    onAuthError?: () => void;
    /** Called on other errors */
    onError?: (message: string) => void;
}

export interface UseCustomersResult {
    customers: CustomerRow[];
    setCustomers: React.Dispatch<React.SetStateAction<CustomerRow[]>>;
    loading: boolean;
    total: number;
    totalPages: number;
    load: (
        query?: string,
        page?: number,
        sortBy?: CustomersSortBy,
        sortDir?: CustomersSortDirection,
        filters?: { customerIds?: string[] }
    ) => Promise<void>;
    save: (customer: Partial<CustomerRow>, id?: string) => Promise<CustomerRow | null>;
    remove: (id: string) => Promise<{ archived: boolean } | null>;
    /** Per-field validation messages from the last failed save, keyed by field name. */
    saveFieldErrors: ApiFieldErrors;
    /** Clears the inline field errors, e.g. when the form is reopened or edited. */
    clearSaveFieldErrors: () => void;
}

/**
 * Hook to manage admin customer data operations.
 */
export function useCustomers(options: UseCustomersOptions = {}): UseCustomersResult {
    const { pageSize = 50, onAuthError, onError } = options;
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [saveFieldErrors, setSaveFieldErrors] = useState<ApiFieldErrors>({});

    const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

    const load = useCallback(
        async (
            query?: string,
            page = 1,
            sortBy: CustomersSortBy = "customer",
            sortDir: CustomersSortDirection = "asc",
            filters?: { customerIds?: string[] }
        ) => {
        setLoading(true);
        const search = (query ?? "").trim();
        const customerIds = filters?.customerIds ?? undefined;

        if (customerIds && customerIds.length === 0) {
            setCustomers([]);
            setTotal(0);
            setTotalPages(1);
            setLoading(false);
            return;
        }

        const params = new URLSearchParams();
        if (search) params.set("q", search);
        if (customerIds && customerIds.length > 0) params.set("customerIds", customerIds.join(","));
        params.set("sortBy", sortBy);
        params.set("sortDir", sortDir);
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        try {
            const response = await safeFetch(`/api/admin/customers?${params.toString()}`, {
                cache: "no-store"
            });
            if (!response.ok) {
                await handleApiError(response, "Unable to load customers.");
                return;
            }
            const data = await response.json();
            setCustomers(data.customers || []);
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
        } catch {
            if (onError) onError("Network error loading customers.");
        } finally {
            setLoading(false);
        }
    }, [pageSize, safeFetch, handleApiError, onError]);

    const save = useCallback(async (customer: Partial<CustomerRow>, id?: string): Promise<CustomerRow | null> => {
        const method = id ? "PATCH" : "POST";
        const endpoint = id ? `/api/admin/customers/${id}` : "/api/admin/customers";
        setSaveFieldErrors({});

        try {
            const response = await safeFetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(customer)
            });

            if (!response.ok) {
                setSaveFieldErrors(await handleApiError(response, "Unable to save customer."));
                return null;
            }

            const data = await response.json();
            return data.customer as CustomerRow;
        } catch {
            return null;
        }
    }, [safeFetch, handleApiError]);

    const remove = useCallback(async (id: string): Promise<{ archived: boolean } | null> => {
        try {
            const response = await safeFetch(`/api/admin/customers/${id}`, {
                method: "DELETE"
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to delete customer.");
                return null;
            }

            return await response.json() as { archived: boolean };
        } catch {
            return null;
        }
    }, [safeFetch, handleApiError]);

    const clearSaveFieldErrors = useCallback(() => setSaveFieldErrors({}), []);

    return {
        customers,
        setCustomers,
        loading,
        total,
        totalPages,
        load,
        save,
        remove,
        saveFieldErrors,
        clearSaveFieldErrors
    };
}
