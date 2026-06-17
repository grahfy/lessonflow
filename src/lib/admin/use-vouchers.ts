"use client";

import { useCallback, useState } from "react";

import { useSafeFetch } from "./use-safe-fetch";
import { readApiErrorFromResponse } from "./utils";

export type VoucherStatus = "pending" | "active" | "redeemed" | "void";

export interface VoucherRow {
  id: string;
  // Bearer credential: the list endpoint only returns a masked code
  // (e.g. "••••-••••-JKLM"). The full code is fetched on demand via revealCode().
  codeMasked: string;
  valueCents: number;
  currency: string;
  status: VoucherStatus;
  purchaserName: string | null;
  purchaserEmail: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  paidVia: string | null;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedByCustomerId: string | null;
  createdAt: string;
}

/**
 * A voucher with its full bearer `code` exposed. Returned by the comp-issue POST
 * (shown once right after issuing) and by the owner-gated per-voucher detail GET
 * used to reveal a code on demand.
 */
export interface VoucherDetail extends Omit<VoucherRow, "codeMasked"> {
  code: string;
}

export interface IssueVoucherInput {
  valueCents: number;
  recipientName?: string;
  recipientEmail?: string;
  note?: string;
}

export interface UseVouchersResult {
  vouchers: VoucherRow[];
  loading: boolean;
  load: () => Promise<void>;
  issue: (input: IssueVoucherInput) => Promise<VoucherDetail | null>;
  voidVoucher: (id: string) => Promise<boolean>;
  /** Fetches the full bearer code for a single voucher on demand. */
  revealCode: (id: string) => Promise<string | null>;
  redeemToCustomer: (
    code: string,
    customerId: string,
  ) => Promise<{ valueCents: number; newBalanceCents: number } | null>;
}

/**
 * Owner-only client hook backing the admin vouchers page. Wraps the
 * /api/admin/vouchers endpoints with the shared safe-fetch error handling
 * (401 -> login redirect; other errors surfaced via onError).
 */
export function useVouchers(onAuthError: () => void, onError: (message: string) => void): UseVouchersResult {
  const { safeFetch } = useSafeFetch({ onAuthError, onError });
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await safeFetch("/api/admin/vouchers", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) return;
        onError(await readApiErrorFromResponse(response, "Unable to load vouchers."));
        return;
      }
      const data = (await response.json()) as { vouchers: VoucherRow[] };
      setVouchers(data.vouchers);
    } finally {
      setLoading(false);
    }
  }, [safeFetch, onError]);

  const issue = useCallback(
    async (input: IssueVoucherInput): Promise<VoucherDetail | null> => {
      const response = await safeFetch("/api/admin/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        onError(await readApiErrorFromResponse(response, "Unable to issue voucher."));
        return null;
      }
      const data = (await response.json()) as { voucher: VoucherDetail };
      await load();
      return data.voucher;
    },
    [safeFetch, onError, load],
  );

  const revealCode = useCallback(
    async (id: string): Promise<string | null> => {
      const response = await safeFetch(`/api/admin/vouchers/${id}`, { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) return null;
        onError(await readApiErrorFromResponse(response, "Unable to reveal voucher code."));
        return null;
      }
      const data = (await response.json()) as { voucher: VoucherDetail };
      return data.voucher.code;
    },
    [safeFetch, onError],
  );

  const voidVoucher = useCallback(
    async (id: string): Promise<boolean> => {
      const response = await safeFetch(`/api/admin/vouchers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void" }),
      });
      if (!response.ok) {
        onError(await readApiErrorFromResponse(response, "Unable to void voucher."));
        return false;
      }
      await load();
      return true;
    },
    [safeFetch, onError, load],
  );

  const redeemToCustomer = useCallback(
    async (code: string, customerId: string) => {
      const response = await safeFetch("/api/admin/vouchers/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, customerId }),
      });
      if (!response.ok) {
        onError(await readApiErrorFromResponse(response, "Unable to redeem voucher."));
        return null;
      }
      const data = (await response.json()) as {
        redeemed: { valueCents: number; newBalanceCents: number };
      };
      await load();
      return data.redeemed;
    },
    [safeFetch, onError, load],
  );

  return { vouchers, loading, load, issue, voidVoucher, revealCode, redeemToCustomer };
}
