"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { animateIn, animateOut } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";
import { CustomerTable } from "@/components/admin/customers/customer-table";
import { CustomerDialogWrapper } from "@/components/admin/customers/customer-dialog-wrapper";
import { emptyCustomerForm, customerFormFromRow, type CustomerRow, type CustomerForm } from "@/components/admin/customers/customer-profile-dialog";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import { type LearningMaterialBooking, type LearningMaterialRow } from "@/lib/admin/types";

const PHONE_PATTERN = /^\d{10}$/;
const POSTCODE_PATTERN = /^\d{4}$/;

export function AdminCustomersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [debouncedCustomerQuery, setDebouncedCustomerQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Unified Dialog State
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm());
  const [activeTab, setActiveTab] = useState<"profile" | "emails" | "materials">("profile");

  const [revealedPortalPasswords, setRevealedPortalPasswords] = useState<Record<string, string>>({});
  const [portalCredentialBusyCustomerId, setPortalCredentialBusyCustomerId] = useState<string | null>(null);

  // Email History & Composer State
  const [emailHistory, setEmailHistory] = useState<ReadonlyArray<{ id: string; subject: string; status: string; error?: string; createdAt: string }>>([]);
  const [loadingEmailHistory, setLoadingEmailHistory] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailComposerSubject, setEmailComposerSubject] = useState("");
  const [emailComposerMessage, setEmailComposerMessage] = useState("");

  // Learning Materials State
  const [materialsBookingId, setMaterialsBookingId] = useState("");
  const [materialsBookings, setMaterialsBookings] = useState<LearningMaterialBooking[]>([]);
  const [materialsList, setMaterialsList] = useState<LearningMaterialRow[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsUploading, setMaterialsUploading] = useState(false);
  const [materialsDeletingId, setMaterialsDeletingId] = useState<string | null>(null);

  const dialogPresence = usePresenceExit();
  const dialogRootRef = useRef<HTMLDivElement | null>(null);
  const materialsUploadFormRef = useRef<HTMLFormElement | null>(null);
  const authRedirectingRef = useRef(false);
  const searchInputId = useId();
  const openCustomerDialogRef = useRef<typeof openCustomerDialog | null>(null);

  const handleAuthError = useCallback(() => {
    if (authRedirectingRef.current) return;
    authRedirectingRef.current = true;
    setError("");
    window.location.assign("/admin/login");
  }, []); // Empty deps - authRedirectingRef.current and setError are stable

  const { safeFetch, handleApiError } = useSafeFetch({
    onAuthError: handleAuthError,
    onError: setError
  });

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    setError("");
    const search = debouncedCustomerQuery.trim();
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    const response = await safeFetch(`/api/admin/customers?${params.toString()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      setLoadingCustomers(false);
      await handleApiError(response, "Unable to load customers.");
      return;
    }
    const data = await response.json();
    setCustomers(data.customers || []);
    setTotalCount(data.total || 0);
    setTotalPages(data.totalPages || 1);
    setLoadingCustomers(false);
  }, [debouncedCustomerQuery, handleApiError, page, pageSize, safeFetch]);

  const loadEmailHistory = useCallback(async (customerId: string) => {
    setLoadingEmailHistory(true);
    try {
      const response = await safeFetch(`/api/admin/customers/${customerId}/email`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setEmailHistory(data.history || []);
      }
    } catch {
      // Silent error for history
    } finally {
      setLoadingEmailHistory(false);
    }
  }, [safeFetch]);

  const loadLearningMaterials = useCallback(async (customerId: string, bookingId?: string) => {
    setMaterialsLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (bookingId) {
      params.set("bookingId", bookingId);
    }
    const query = params.toString();

    try {
      const response = await safeFetch(
        `/api/admin/customers/${customerId}/learning-materials${query ? `?${query}` : ""}`,
        { cache: "no-store" }
      );
      setMaterialsLoading(false);
      if (!response.ok) {
        await handleApiError(response, "Unable to load learning materials.");
        return;
      }

      const payload = (await response.json()) as {
        bookings: LearningMaterialBooking[];
        materials: LearningMaterialRow[];
      };
      setMaterialsBookings(payload.bookings || []);
      setMaterialsList(payload.materials || []);
    } catch {
      setMaterialsLoading(false);
      setError("Network error loading materials.");
    }
  }, [handleApiError, safeFetch]);

  async function uploadLearningMaterial() {
    const formElement = materialsUploadFormRef.current;
    if (!formElement || !selectedCustomer) return;

    const form = new FormData(formElement);
    const file = form.get("file");
    if (!(file instanceof File)) {
      setError("Choose a PDF or audio file to upload.");
      return;
    }
    if (materialsBookingId) {
      form.set("bookingId", materialsBookingId);
    } else {
      form.delete("bookingId");
    }

    setMaterialsUploading(true);
    setError("");
    try {
      const response = await safeFetch(`/api/admin/customers/${selectedCustomer.id}/learning-materials`, {
        method: "POST",
        body: form
      });
      if (!response.ok) {
        setMaterialsUploading(false);
        await handleApiError(response, "Upload failed.");
        return;
      }

      materialsUploadFormRef.current?.reset();
      setNotice("Learning material uploaded.");
      await loadLearningMaterials(selectedCustomer.id, materialsBookingId);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setMaterialsUploading(false);
    }
  }

  async function deleteLearningMaterial(material: LearningMaterialRow) {
    if (!selectedCustomer) return;
    const confirmed = window.confirm(`Delete "${material.title}"?`);
    if (!confirmed) return;

    setMaterialsDeletingId(material.id);
    setError("");
    try {
      const response = await safeFetch(`/api/admin/learning-materials/${material.id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        setMaterialsDeletingId(null);
        await handleApiError(response, "Unable to delete learning material.");
        return;
      }

      setNotice("Learning material deleted.");
      await loadLearningMaterials(selectedCustomer.id, materialsBookingId);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setMaterialsDeletingId(null);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  // Handle customerId query parameter to auto-open a customer
  useEffect(() => {
    const customerId = searchParams.get("customerId");
    const editMode = searchParams.get("edit") === "true";
    if (!customerId) return;

    const openCustomerById = async () => {
      try {
        const response = await fetch(`/api/admin/customers/${customerId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.customer && openCustomerDialogRef.current) {
            openCustomerDialogRef.current(data.customer, editMode);
          }
        }
      } catch {
        // Silent error
      }
    };

    // Delay to ensure loadCustomers completes first
    const timer = setTimeout(() => {
      openCustomerById();
    }, 100);

    return () => clearTimeout(timer);
  }, [searchParams]);

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomerQuery(customerQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  // Reset to page 1 when debounced query changes
  // This effect intentionally omits dependencies to prevent infinite re-render loops
  useEffect(() => {
    setPage(1);
  }, []);

  useEffect(() => {
    if (!dialogPresence.isMounted || !dialogRootRef.current) return;
    void animateIn(dialogRootRef.current, { scope: "admin" });
  }, [dialogPresence.isMounted]);

  // Set up ref for openCustomerDialog before useEffect runs
  openCustomerDialogRef.current = openCustomerDialog;

  function openCustomerDialog(customer: CustomerRow | null, editMode = false) {
    setSelectedCustomer(customer);
    setIsEditing(editMode);
    setCustomerForm(customer ? customerFormFromRow(customer) : emptyCustomerForm());
    setActiveTab("profile");
    setError("");
    setNotice("");

    // Reset email state
    setEmailHistory([]);
    setEmailComposerSubject("");
    setEmailComposerMessage("");

    // Reset materials state
    setMaterialsBookingId("");
    setMaterialsBookings([]);
    setMaterialsList([]);
    setMaterialsUploading(false);
    setMaterialsDeletingId(null);

    if (customer) {
      void loadEmailHistory(customer.id);
      void loadLearningMaterials(customer.id);
    }

    dialogPresence.show();
  }

  async function closeCustomerDialog() {
    if (dialogRootRef.current) {
      await animateOut(dialogRootRef.current, { scope: "admin" });
    }
    dialogPresence.hide(
      () => {
        setSelectedCustomer(null);
        setIsEditing(false);
        setCustomerForm(emptyCustomerForm());
        setActiveTab("profile");
        setEmailHistory([]);
        setEmailComposerSubject("");
        setEmailComposerMessage("");

        setMaterialsBookingId("");
        setMaterialsBookings([]);
        setMaterialsList([]);
        
        // Clear search params if they exist so dialog doesn't reopen on refresh
        if (searchParams.has("customerId")) {
          router.replace("/admin/customers");
        }
      },
      { immediate: true }
    );
  }

  async function sendCustomerEmail() {
    if (!selectedCustomer) return;
    if (!emailComposerSubject.trim() || !emailComposerMessage.trim()) {
      setError("Email requires both subject and message.");
      return;
    }

    setSendingEmail(true);
    setError("");
    try {
      const response = await safeFetch(`/api/admin/customers/${selectedCustomer.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailComposerSubject.trim(),
          message: emailComposerMessage.trim()
        })
      });

      if (!response.ok) {
        await handleApiError(response, "Unable to send email.");
        return;
      }

      setNotice("Email sent successfully.");
      setEmailComposerSubject("");
      setEmailComposerMessage("");
      await loadEmailHistory(selectedCustomer.id);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSendingEmail(false);
    }
  }

  async function saveCustomer() {
    setError("");
    setNotice("");

    if (!customerForm.firstName.trim() || !customerForm.lastName.trim()) {
      setError("First and Last name are required.");
      return;
    }
    if (!customerForm.email.trim() || !customerForm.email.includes("@")) {
      setError("A valid email is required.");
      return;
    }
    if (!PHONE_PATTERN.test(customerForm.phone)) {
      setError("Phone must be exactly 10 digits.");
      return;
    }
    if (!customerForm.houseNumber.trim() || !customerForm.streetName.trim() || !customerForm.suburb.trim()) {
      setError("Complete address is required.");
      return;
    }
    if (!POSTCODE_PATTERN.test(customerForm.postcode)) {
      setError("Postcode must be exactly 4 digits.");
      return;
    }

    setSavingCustomer(true);
    const method = selectedCustomer ? "PATCH" : "POST";
    const endpoint = selectedCustomer ? `/api/admin/customers/${selectedCustomer.id}` : "/api/admin/customers";

    try {
      const response = await safeFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...customerForm,
          fullName: `${customerForm.firstName.trim()} ${customerForm.lastName.trim()}`
        })
      });

      if (!response.ok) {
        await handleApiError(response, "Unable to save customer.");
        return;
      }

      setNotice(selectedCustomer ? "Customer updated." : "Customer created.");

      const payload = await response.json();
      const updatedCustomer = payload.customer as CustomerRow;

      await loadCustomers();

      // If we were editing an existing one, stay in view mode for the updated record
      if (selectedCustomer) {
        setSelectedCustomer(updatedCustomer);
        setCustomerForm(customerFormFromRow(updatedCustomer));
        setIsEditing(false);
      } else {
        // If it was a new record, just close
        await closeCustomerDialog();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function deleteCustomer(customer: CustomerRow) {
    if (!window.confirm(`Are you sure you want to delete ${customer.fullName}? This will archive the customer if they have linked bookings.`)) {
      return;
    }

    setDeletingCustomerId(customer.id);
    setError("");
    setNotice("");

    try {
      const response = await safeFetch(`/api/admin/customers/${customer.id}`, { method: "DELETE" });
      if (!response.ok) {
        await handleApiError(response, "Unable to delete customer.");
        return;
      }

      const body = await response.json();
      setNotice(body.archived ? "Customer archived (has linked bookings)." : "Customer deleted.");
      if (selectedCustomer?.id === customer.id) {
        await closeCustomerDialog();
      }
      await loadCustomers();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeletingCustomerId(null);
    }
  }

  async function mutatePortalCredential(customerId: string, action: "reveal" | "regenerate") {
    setError("");
    setPortalCredentialBusyCustomerId(customerId);
    try {
      const response = await safeFetch(`/api/admin/customers/${customerId}/portal-credential`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        await handleApiError(response, `Unable to ${action} portal password.`);
        return;
      }

      const body = (await response.json()) as { password: string };
      setRevealedPortalPasswords((prev: Record<string, string>) => ({ ...prev, [customerId]: body.password }));

      if (action === "regenerate") {
        setNotice("Portal password regenerated.");
      }

      // Refresh data
      await loadCustomers();
      if (selectedCustomer?.id === customerId) {
        const refreshed = await safeFetch(`/api/admin/customers/${customerId}`);
        if (refreshed.ok) {
          const data = await refreshed.json();
          if (data.customer) {
            setSelectedCustomer(data.customer);
            setCustomerForm(customerFormFromRow(data.customer));
          }
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPortalCredentialBusyCustomerId(null);
    }
  }

  async function revealPortalPassword(customerId: string) {
    await mutatePortalCredential(customerId, "reveal");
  }

  async function regeneratePortalPassword(customerId: string) {
    if (!window.confirm("Regenerate portal password? The current password will stop working immediately.")) return;
    await mutatePortalCredential(customerId, "regenerate");
  }

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true" style={{ height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <AdminHeader title="Customer Directory" />

      <div className="admin-card report-toolbar-card">
        <div>
          <p className="helper-text report-toolbar-title">Manage customer profiles and portal access</p>
          <p className="helper-text">
            Search for customers, edit their details, or manage their student portal credentials.
          </p>
        </div>
        <div className="button-row">
          <button className="btn btn-secondary" type="button" onClick={() => void loadCustomers()} disabled={loadingCustomers}>
            {loadingCustomers ? "Refreshing..." : "Refresh list"}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => openCustomerDialog(null, true)}>
            Create New Customer
          </button>
        </div>
      </div>

      <div className="admin-card report-controls-card">
        <div className="field full">
          <label htmlFor={searchInputId}>Search Directory</label>
          <input
            id={searchInputId}
            value={customerQuery}
            placeholder="Search by name, email, or phone..."
            onChange={(event) => setCustomerQuery(event.target.value)}
          />
        </div>
      </div>

      {error && !dialogPresence.isMounted ? <p className="notice error">{error}</p> : null}
      {notice && !dialogPresence.isMounted ? <p className="notice success">{notice}</p> : null}
      {loadingCustomers && !customers.length ? <p className="notice">Loading customers...</p> : null}

      <CustomerTable
        customers={customers}
        loadingCustomers={loadingCustomers}
        deletingCustomerId={deletingCustomerId}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
        onSetPage={setPage}
        onSetPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onOpenCustomerDialog={openCustomerDialog}
        onDeleteCustomer={deleteCustomer}
        onViewInvoices={(name) => router.push(`/admin/invoices?q=${encodeURIComponent(name)}`)}
      />

      {
        dialogPresence.isMounted ? (
          <CustomerDialogWrapper
            dialogRootRef={dialogRootRef}
            selectedCustomer={selectedCustomer}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            error={error}
            notice={notice}
            onClose={closeCustomerDialog}
            isEditing={isEditing}
            customerForm={customerForm}
            setCustomerForm={setCustomerForm}
            savingCustomer={savingCustomer}
            deletingCustomerId={deletingCustomerId}
            revealedPortalPasswords={revealedPortalPasswords}
            portalCredentialBusyCustomerId={portalCredentialBusyCustomerId}
            onSaveCustomer={saveCustomer}
            onCancelEdit={() => {
              if (!selectedCustomer) closeCustomerDialog();
              else {
                setCustomerForm(customerFormFromRow(selectedCustomer));
                setIsEditing(false);
              }
            }}
            onStartEdit={() => setIsEditing(true)}
            onDeleteCustomer={() => selectedCustomer && deleteCustomer(selectedCustomer)}
            onViewBillingHistory={() => selectedCustomer && router.push(`/admin/invoices?q=${encodeURIComponent(selectedCustomer.fullName)}`)}
            onRevealPortalPassword={() => selectedCustomer && revealPortalPassword(selectedCustomer.id)}
            onRegeneratePortalPassword={() => selectedCustomer && regeneratePortalPassword(selectedCustomer.id)}
            loadingEmailHistory={loadingEmailHistory}
            emailHistory={emailHistory}
            emailComposerSubject={emailComposerSubject}
            setEmailComposerSubject={setEmailComposerSubject}
            emailComposerMessage={emailComposerMessage}
            setEmailComposerMessage={setEmailComposerMessage}
            sendingEmail={sendingEmail}
            onSendEmail={sendCustomerEmail}
            materialsLoading={materialsLoading}
            materialsList={materialsList}
            materialsBookings={materialsBookings}
            materialsBookingId={materialsBookingId}
            setMaterialsBookingId={setMaterialsBookingId}
            materialsUploading={materialsUploading}
            materialsDeletingId={materialsDeletingId}
            materialsUploadFormRef={materialsUploadFormRef}
            onUploadMaterial={uploadLearningMaterial}
            onDeleteMaterial={deleteLearningMaterial}
            onMaterialBookingSelect={(bid) => {
              if (selectedCustomer) loadLearningMaterials(selectedCustomer.id, bid || undefined);
            }}
          />
        ) : null
      }
    </div >
  );
}

