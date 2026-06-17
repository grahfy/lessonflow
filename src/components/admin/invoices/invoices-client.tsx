"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { useTweenOrchestrator } from "@/components/motion/tween-orchestrator";
import { getInvoiceTaxName } from "@/lib/invoices/gst-policy";

import { useLessonPricing } from "@/lib/admin/use-lesson-pricing";
import {
  useInvoices,
  type InvoiceRow
} from "@/lib/admin/use-invoices";
import { usePresets } from "@/lib/admin/use-presets";
import { usePackages } from "@/lib/admin/use-packages";
import { useCustomers } from "@/lib/admin/use-customers";
import { type InvoiceSortBy, type InvoiceSortDirection } from "@/lib/invoices/schema";
import { canApplyInvoiceAction } from "@/lib/invoices/transitions";
import { getDisplayStatus } from "@/lib/invoices/invoice-display-helpers";
import { useInvoiceDetailForm } from "@/lib/admin/use-invoice-detail-form";
import { useInvoiceCreateForm } from "@/lib/admin/use-invoice-create-form";
import { useInvoiceActions, type PendingConfirm } from "@/lib/admin/use-invoice-actions";

import { InvoiceListPanel } from "./invoice-list-panel";
import { InvoiceDetailDialog } from "./invoice-detail-dialog";
import { InvoiceCreateDialog } from "./invoice-create-dialog";

/**
 * Admin invoices console client.
 *
 * RATIONALE: This screen coordinates list state, deep-linkable dialog opens,
 * draft creation, lifecycle actions, and customer handoff transitions. The
 * hooks keep API details and per-dialog form state centralized, while the page
 * owns the cross-dialog state that determines what admins see next.
 */
export function AdminInvoicesClient({ defaultCurrency }: { defaultCurrency: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputId = useId();
  const sortSelectId = useId();
  const overdueFilterId = useId();
  const { beginExitTransition } = useTweenOrchestrator();

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasLoadedInitialInvoices, setHasLoadedInitialInvoices] = useState(false);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 10000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // Search & Filter State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState<InvoiceSortBy>("invoice_number");
  const [sortDir, setSortDir] = useState<InvoiceSortDirection>("desc");

  // Dialog State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);

  // NOTE: Auth failures are handled here instead of each button click so all
  // invoice hooks share the same redirect behavior.
  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);

  // Data Hooks
  const {
    invoices,
    loading,
    totalCount,
    totalPages,
    load: loadInvoices,
    save: saveInvoiceApi,
    performAction: performActionApi,
    sendBulkReminders: sendBulkRemindersApi,
    remove: removeInvoiceApi
  } = useInvoices({
    pageSize,
    onError: setError,
    onAuthError
  });

  const { presets } = usePresets({ onAuthError, onError: setError });
  const { packages } = usePackages({ onAuthError, onError: setError });
  const activePackages = useMemo(
    () =>
      packages
        .filter((pkg) => pkg.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [packages]
  );
  const { customers: customerOptions, load: loadCustomers } = useCustomers({ pageSize: 250, onAuthError, onError: setError });
  const { lessonPricingOptions, load: loadLessonPricing } = useLessonPricing({ onAuthError, onError: setError });

  const activeLessonPricingMap = useMemo(
    () =>
      new Map(
        lessonPricingOptions
          .filter((option) => option.isActive)
          .map((option) => [option.durationMinutes, option])
      ),
    [lessonPricingOptions]
  );
  const activeLessonPricingChoices = useMemo(
    () =>
      lessonPricingOptions
        .filter((option) => option.isActive)
        .sort((a, b) => a.durationMinutes - b.durationMinutes),
    [lessonPricingOptions]
  );

  // Per-dialog form state lives in dedicated hooks; the orchestrator wires them
  // together and coordinates cross-dialog transitions.
  const detailForm = useInvoiceDetailForm({
    defaultCurrency,
    activeLessonPricingMap,
    presets,
    packages: activePackages,
    onError: setError
  });
  const createForm = useInvoiceCreateForm({
    defaultCurrency,
    activeLessonPricingMap,
    presets,
    packages: activePackages,
    onAuthError,
    onError: setError
  });

  // Pull the stable (useCallback / useState setter) members out of the hook
  // returns so effects/callbacks can depend on them directly. The hook return
  // objects get a fresh identity every render, so depending on the whole object
  // would re-run the deep-link bootstrap effect on each render (duplicate GET +
  // duplicate "Draft invoice opened." notice).
  const { hydrateFromInvoice, resetTransientFields } = detailForm;
  const { createOpen, setCreateOpen, setCreateSelectedCustomerId } = createForm;

  const resolvedEditingCurrency = detailForm.resolvedEditingCurrency;
  const resolvedCreateCurrency = createForm.resolvedCreateCurrency;
  const editingTaxLabel = getInvoiceTaxName(resolvedEditingCurrency);
  const createTaxLabel = getInvoiceTaxName(resolvedCreateCurrency);

  const overdueVisibleCount = useMemo(
    () => invoices.filter((invoice) => invoice.overdueDays !== null && invoice.overdueDays > 0 && invoice.status !== "paid" && invoice.status !== "void").length,
    [invoices]
  );
  const draftVisibleCount = useMemo(
    () => invoices.filter((invoice) => invoice.status === "draft").length,
    [invoices]
  );
  const visibleOpenBalanceCents = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status !== "paid" && invoice.status !== "void")
        .reduce((sum, invoice) => sum + invoice.totalCents, 0),
    [invoices]
  );
  const isInvoicesWorkspaceLoading = loading || !hasLoadedInitialInvoices;

  // Actions
  /**
   * Opens the detail dialog and hydrates its editable fields from the selected
   * invoice row.
   */
  const openDetail = useCallback((invoice: InvoiceRow) => {
    setSelectedInvoice(invoice);
    hydrateFromInvoice(invoice);
    setNotice("");
    setError("");
  }, [hydrateFromInvoice]);

  const reloadInvoices = useCallback(() => {
    void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
  }, [loadInvoices, query, page, overdueOnly, sortBy, sortDir]);

  // Effects
  useEffect(() => {
    let cancelled = false;

    void loadInvoices(query, page, overdueOnly, sortBy, sortDir).finally(() => {
      if (!cancelled) {
        setHasLoadedInitialInvoices(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [query, page, overdueOnly, sortBy, sortDir, loadInvoices]);

  useEffect(() => {
    const shouldOpenCreate = searchParams.get("openCreate") === "true";
    const customerId = searchParams.get("customerId");
    const openInvoiceId = searchParams.get("openInvoiceId");
    const nextParams = new URLSearchParams(searchParams.toString());
    let shouldReplace = false;

    if (shouldOpenCreate && !createOpen) {
      // RATIONALE: Other admin surfaces can deep-link into invoice creation.
      // The query params act like a one-time instruction and are cleared
      // immediately after the dialog state has been hydrated.
      setCreateOpen(true);
      void loadCustomers();
      if (customerId) {
        setCreateSelectedCustomerId(customerId);
      }
      nextParams.delete("openCreate");
      nextParams.delete("customerId");
      shouldReplace = true;
    }

    if (openInvoiceId) {
      nextParams.delete("openInvoiceId");
      shouldReplace = true;

      void (async () => {
        try {
          // NOTE: We refetch the just-created invoice instead of trusting the
          // list payload because a create/send flow can redirect here with an ID
          // before the list has been reloaded with the full detail payload.
          const response = await fetch(`/api/admin/invoices/${openInvoiceId}`, { cache: "no-store" });
          if (response.status === 401) {
            onAuthError();
            return;
          }
          if (!response.ok) {
            setError("Invoice was created but could not be loaded.");
            return;
          }
          const payload = await response.json() as { invoice?: InvoiceRow };
          if (payload.invoice) {
            openDetail(payload.invoice);
            setNotice("Draft invoice opened.");
          }
        } catch {
          setError("Unable to load the created invoice.");
        }
      })();
    }

    if (shouldReplace) {
      const query = nextParams.toString();
      // NOTE: `replace` avoids polluting browser history with one-shot dialog
      // bootstrap params that should not reopen on every Back navigation.
      router.replace(query ? `/admin/invoices?${query}` : "/admin/invoices", { scroll: false });
    }
    // NOTE: Depend on the specific primitive/stable members rather than the
    // whole `createForm` object — the hook returns a fresh object identity each
    // render, so depending on it would re-run this one-shot deep-link bootstrap
    // on every render (duplicate GET + duplicate "Draft invoice opened." notice).
  }, [
    searchParams,
    createOpen,
    setCreateOpen,
    setCreateSelectedCustomerId,
    loadCustomers,
    onAuthError,
    openDetail,
    router
  ]);

  useEffect(() => {
    if (createForm.createOpen || selectedInvoice) {
      void loadLessonPricing();
    }
  }, [createForm.createOpen, selectedInvoice, loadLessonPricing]);

  const closeDetail = useCallback(() => {
    setSelectedInvoice(null);
    resetTransientFields();
  }, [resetTransientFields]);

  const actions = useInvoiceActions({
    detailForm,
    createForm,
    saveInvoiceApi,
    performActionApi,
    sendBulkRemindersApi,
    removeInvoiceApi,
    reloadInvoices,
    openDetail,
    closeDetail,
    customerOptions,
    selectedInvoice,
    setNotice,
    setError,
    setPendingConfirm
  });
  const { busyAction, setBusyAction } = actions;

  const canMarkAsPaid = selectedInvoice
    ? canApplyInvoiceAction(selectedInvoice.status, "mark_paid")
    : false;
  const canMarkAsUnpaid = selectedInvoice
    ? canApplyInvoiceAction(selectedInvoice.status, "mark_unpaid")
    : false;
  const canVoidInvoice = selectedInvoice
    ? canApplyInvoiceAction(selectedInvoice.status, "void")
    : false;
  const canEditSelectedInvoice = selectedInvoice
    ? selectedInvoice.status === "draft" || selectedInvoice.status === "sent"
    : false;
  const isUsingSystemPaymentDetails = detailForm.editingPaymentDetailsSource === "system";
  const selectedInvoiceDisplayStatus = selectedInvoice ? getDisplayStatus(selectedInvoice, overdueOnly) : null;

  /**
   * Navigates to the linked customer after closing the detail dialog.
   *
   * RATIONALE: The tween orchestrator preserves the app-shell transition flow so
   * moving from billing into customer support feels like one continuous admin task.
   */
  const openLinkedCustomer = () => {
    if (!selectedInvoice?.customerId) return;
    closeDetail();
    void beginExitTransition(null, 0, () => router.push(`/admin/customers?customerId=${selectedInvoice.customerId}&open=true`));
  };

  return (
    <AdminShell title="Invoices" error={error} notice={notice} loading={isInvoicesWorkspaceLoading} className="admin-shell-invoices">
      <div className="admin-layout-content">
        <InvoiceListPanel
          invoices={invoices}
          loading={loading}
          isInvoicesWorkspaceLoading={isInvoicesWorkspaceLoading}
          totalCount={totalCount}
          totalPages={totalPages}
          draftVisibleCount={draftVisibleCount}
          overdueVisibleCount={overdueVisibleCount}
          visibleOpenBalanceCents={visibleOpenBalanceCents}
          defaultCurrency={defaultCurrency}
          busyAction={busyAction}
          overdueOnly={overdueOnly}
          setOverdueOnly={setOverdueOnly}
          query={query}
          setQuery={setQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortDir={sortDir}
          setSortDir={setSortDir}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          searchInputId={searchInputId}
          sortSelectId={sortSelectId}
          overdueFilterId={overdueFilterId}
          onCreateInvoice={() => { createForm.setCreateOpen(true); void loadCustomers(); }}
          onSendBulkReminders={actions.sendBulkReminders}
          onOpenDetail={openDetail}
          setPendingConfirm={setPendingConfirm}
          setBusyAction={setBusyAction}
          removeInvoiceApi={removeInvoiceApi}
          reloadInvoices={reloadInvoices}
        />

        <InvoiceDetailDialog
          selectedInvoice={selectedInvoice}
          onClose={closeDetail}
          detailForm={detailForm}
          busyAction={busyAction}
          presets={presets}
          packages={activePackages}
          activeLessonPricingChoices={activeLessonPricingChoices}
          editingTaxLabel={editingTaxLabel}
          canMarkAsPaid={canMarkAsPaid}
          canMarkAsUnpaid={canMarkAsUnpaid}
          canVoidInvoice={canVoidInvoice}
          canEditSelectedInvoice={canEditSelectedInvoice}
          isUsingSystemPaymentDetails={isUsingSystemPaymentDetails}
          selectedInvoiceDisplayStatus={selectedInvoiceDisplayStatus}
          onSave={actions.saveInvoiceEdits}
          onPerformAction={actions.performAction}
          onOpenLinkedCustomer={openLinkedCustomer}
          onDeleteInvoice={async () => {
            await removeInvoiceApi(selectedInvoice!.id);
            closeDetail();
            reloadInvoices();
          }}
          setPendingConfirm={setPendingConfirm}
          onAccountCreditApplied={(updated) => {
            // Re-hydrate the open dialog from the updated invoice and refresh the
            // list so the new total/discount and remaining balance are reflected.
            openDetail(updated);
            reloadInvoices();
          }}
        />

        <InvoiceCreateDialog
          createForm={createForm}
          busyAction={busyAction}
          customerOptions={customerOptions}
          presets={presets}
          packages={activePackages}
          activeLessonPricingChoices={activeLessonPricingChoices}
          createTaxLabel={createTaxLabel}
          onClose={() => {
            createForm.resetCreateDialog();
            createForm.setCreateOpen(false);
          }}
          onCreateInvoice={actions.createInvoice}
        />

        <ConfirmDialog
          open={pendingConfirm !== null}
          title={pendingConfirm?.title ?? ""}
          description={pendingConfirm?.description ?? ""}
          confirmLabel={pendingConfirm?.confirmLabel ?? "Confirm"}
          destructive={pendingConfirm?.destructive}
          onConfirm={() => { const cb = pendingConfirm?.onConfirm; setPendingConfirm(null); cb?.(); }}
          onCancel={() => setPendingConfirm(null)}
        />
      </div>
    </AdminShell>
  );
}
