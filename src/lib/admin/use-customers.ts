"use client";

import { useCallback, useState } from "react";

export interface Customer {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    createdAt: string;
}

export interface UseCustomersOptions {
    /** Number of customers per page */
    pageSize?: number;
    /** Called on load error */
    onError?: (message: string) => void;
}

export interface UseCustomersResult {
    customers: Customer[];
    loading: boolean;
    total: number;
    totalPages: number;
    load: (query?: string, page?: number) => Promise<void>;
}

/**
 * Hook to load and manage customer list.
 */
export function useCustomers(options: UseCustomersOptions = {}): UseCustomersResult {
    const { pageSize = 50, onError } = options;
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const load = useCallback(async (query?: string, page = 1) => {
        setLoading(true);
        const search = (query ?? "").trim();
        const params = new URLSearchParams();
        if (search) params.set("q", search);
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        try {
            const response = await fetch(`/api/admin/customers?${params.toString()}`, {
                cache: "no-store"
            });
            if (!response.ok) {
                const errorMsg = "Failed to load customers";
                if (onError) {
                    onError(errorMsg);
                }
                setCustomers([]);
                return;
            }
            const data = await response.json();
            setCustomers(data.customers || []);
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
        } catch {
            const errorMsg = "Network error loading customers";
            if (onError) {
                onError(errorMsg);
            }
            setCustomers([]);
        } finally {
            setLoading(false);
        }
    }, [pageSize, onError]);

    return {
        customers,
        loading,
        total,
        totalPages,
        load
    };
}
