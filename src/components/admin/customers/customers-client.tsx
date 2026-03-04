"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { animateIn, animateOut } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";
import { CustomerTable } from "@/components/admin/customers/customer-table";
import { CustomerDialogWrapper } from "@/components/admin/customers/customer-dialog-wrapper";
import { emptyCustomerForm, customerFormFromRow, type CustomerRow, type CustomerForm } from "@/components/admin/customers/customer-profile-dialog";

import { useCustomers } from "@/lib/admin/use-customers";
import { useEmailHistory } from "@/lib/admin/use-email-history";
import { useLearningMaterials } from "@/lib/admin/use-learning-materials";
import { usePortalCredentials } from "@/lib/admin/use-portal-credentials";
import { type CustomersSortBy, type CustomersSortDirection } from "@/lib/customers/schema";

export function AdminCustomersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputId = useId();
  
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 10000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const [customerQuery, setCustomerQuery] = useState("");
  const [debouncedCustomerQuery, setDebouncedCustomerQuery] = useState("");
  const [sortBy, setSortBy] = useState<CustomersSortBy>("customer");
  const [sortDir, setSortDir] = useState<CustomersSortDirection>("asc");

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // UI State
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm());
  const [activeTab, setActiveTab] = useState<"profile" | "emails" | "materials">("profile");
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Email Composer State
  const [emailComposerSubject, setEmailComposerSubject] = useState("");
  const [emailComposerMessage, setEmailComposerMessage] = useState("");

  // Materials State
  const [materialsBookingId, setMaterialsBookingId] = useState("");

  const dialogPresence = usePresenceExit();
  const dialogRootRef = useRef<HTMLDivElement | null>(null);
  const materialsUploadFormRef = useRef<HTMLFormElement | null>(null);

  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);

  // Data Hooks
  const { 
    customers, 
    loading: loadingCustomers, 
    total: totalCount, 
    totalPages, 
    load: loadCustomers, 
    save: saveCustomerApi, 
    remove: removeCustomerApi 
  } = useCustomers({
    pageSize,
    onError: setError,
    onAuthError
  });

  const {
    history: emailHistory,
    loading: loadingEmailHistory,
    sending: sendingEmail,
    load: loadEmailHistory,
    send: sendEmailApi
  } = useEmailHistory({ onAuthError, onError: setError });

  const {
    materials: materialsList,
    bookings: materialsBookings,
    loading: materialsLoading,
    uploading: materialsUploading,
    deletingId: materialsDeletingId,
    load: loadMaterials,
    upload: uploadMaterialApi,
    remove: removeMaterialApi
  } = useLearningMaterials({ onAuthError, onError: setError });

  const {
    revealedPasswords: revealedPortalPasswords,
    busyCustomerId: portalCredentialBusyCustomerId,
    reveal: revealPortalPasswordApi,
    regenerate: regeneratePortalPasswordApi
  } = usePortalCredentials({ onAuthError, onError: setError });

  // Dialog Handlers
  const openCustomerDialog = useCallback(async (customer: CustomerRow | null, editMode = false) => {
    setError("");
    setNotice("");
    setSelectedCustomer(customer);
    setIsEditing(editMode);
    setCustomerForm(customer ? customerFormFromRow(customer) : emptyCustomerForm());
    setActiveTab("profile");

    if (customer) {
      void loadEmailHistory(customer.id);
      void loadMaterials(customer.id);
    }

    dialogPresence.show();
    if (dialogRootRef.current) {
      animateIn(dialogRootRef.current);
    }
  }, [dialogPresence, loadEmailHistory, loadMaterials]);

  const closeCustomerDialog = useCallback(async () => {
    if (dialogRootRef.current) {
      await animateOut(dialogRootRef.current);
    }
    dialogPresence.hide();
    setSelectedCustomer(null);
    setIsEditing(false);
    setCustomerForm(emptyCustomerForm());
    router.replace("/admin/customers", { scroll: false });
  }, [dialogPresence, router]);

  // Effects
  useEffect(() => {
    void loadCustomers(debouncedCustomerQuery, page, sortBy, sortDir);
  }, [debouncedCustomerQuery, page, sortBy, sortDir, loadCustomers]);

  useEffect(() => {
    const customerId = searchParams.get("customerId");
    const shouldOpen = searchParams.get("open") === "true";
    
    if (customerId && shouldOpen && customers.length > 0 && !selectedCustomer) {
      const customer = customers.find(c => c.id === customerId);
      if (customer) {
        void openCustomerDialog(customer, false);
      }
      router.replace("/admin/customers", { scroll: false });
    }
  }, [searchParams, customers, selectedCustomer, openCustomerDialog, router]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCustomerQuery(customerQuery), 300);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  // Action Handlers
  async function saveCustomer() {
    setError("");
    setNotice("");
    setSavingCustomer(true);

    const payload = {
      ...customerForm,
      fullName: `${customerForm.firstName.trim()} ${customerForm.lastName.trim()}`
    };

    const result = await saveCustomerApi(payload, selectedCustomer?.id);
    setSavingCustomer(false);

    if (result) {
      setNotice(selectedCustomer ? "Customer updated." : "Customer created.");
      void loadCustomers(debouncedCustomerQuery, page, sortBy, sortDir);
      
      if (selectedCustomer) {
        setSelectedCustomer(result);
        setCustomerForm(customerFormFromRow(result));
        setIsEditing(false);
      } else {
        void closeCustomerDialog();
      }
    }
  }

  async function deleteCustomer(customer: CustomerRow) {
    if (!window.confirm(`Are you sure you want to delete ${customer.fullName}? This will archive the customer if they have linked bookings.`)) {
      return;
    }

    setError("");
    setNotice("");
    const result = await removeCustomerApi(customer.id);
    
    if (result) {
      setNotice(result.archived ? "Customer archived (has linked bookings)." : "Customer deleted.");
      if (selectedCustomer?.id === customer.id) {
        void closeCustomerDialog();
      }
      void loadCustomers(debouncedCustomerQuery, page, sortBy, sortDir);
    }
  }

  async function sendCustomerEmail(subject: string, message: string) {
    if (!selectedCustomer) return;
    setError("");
    const success = await sendEmailApi(selectedCustomer.id, subject, message);
    if (success) {
      setNotice("Email sent successfully.");
      setEmailComposerSubject("");
      setEmailComposerMessage("");
    }
  }

  async function uploadMaterial() {
    if (!selectedCustomer || !materialsUploadFormRef.current) return;
    setError("");
    const success = await uploadMaterialApi(selectedCustomer.id, materialsBookingId, materialsUploadFormRef.current);
    if (success) {
      setNotice("Material uploaded.");
      materialsUploadFormRef.current.reset();
    }
  }

  async function deleteMaterial(materialId: string) {
    if (!window.confirm("Are you sure you want to delete this material?")) return;
    setError("");
    const success = await removeMaterialApi(materialId);
    if (success) {
      setNotice("Material deleted.");
    }
  }

  return (
    <AdminShell 
      title="Customers" 
      error={error && !dialogPresence.isMounted ? error : undefined}
      notice={notice && !dialogPresence.isMounted ? notice : undefined}
      className="admin-shell-customers"
    >
      <div className="admin-layout-content">
        <div className="admin-actions-bar">
          <button className="btn btn-primary" onClick={() => openCustomerDialog(null, true)}>
            CREATE NEW CUSTOMER
          </button>
          <div className="search-box">
            <label htmlFor={searchInputId}>Search</label>
            <input
              id={searchInputId}
              type="text"
              value={customerQuery}
              placeholder="Search by name, email, or phone..."
              onChange={(event) => setCustomerQuery(event.target.value)}
            />
            <div className="admin-sort-inline-row">
              <span className="admin-inline-field">SORT BY</span>
              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value as CustomersSortBy);
                  setPage(1);
                }}
              >
                <option value="customer">Customer</option>
                <option value="skill_mode">Skill / Mode</option>
              </select>
              <button
                type="button"
                className="btn btn-secondary admin-sort-direction-btn"
                onClick={() => {
                  setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                  setPage(1);
                }}
              >
                {sortDir === "asc" ? "ASC" : "DESC"}
              </button>
            </div>
          </div>
        </div>

        <CustomerTable
          customers={customers}
          loadingCustomers={loadingCustomers}
          deletingCustomerId={null}
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
      </div>

      {dialogPresence.isMounted && (
        <CustomerDialogWrapper
          dialogRootRef={dialogRootRef}
          selectedCustomer={selectedCustomer}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isEditing={isEditing}
          customerForm={customerForm}
          setCustomerForm={setCustomerForm}
          savingCustomer={savingCustomer}
          onSaveCustomer={saveCustomer}
          onClose={closeCustomerDialog}
          error={error}
          notice={notice}
          
          // Email History
          loadingEmailHistory={loadingEmailHistory}
          emailHistory={emailHistory}
          emailComposerSubject={emailComposerSubject}
          setEmailComposerSubject={setEmailComposerSubject}
          emailComposerMessage={emailComposerMessage}
          setEmailComposerMessage={setEmailComposerMessage}
          sendingEmail={sendingEmail}
          onSendEmail={sendCustomerEmail}

          // Learning Materials
          materialsList={materialsList}
          materialsBookings={materialsBookings}
          materialsLoading={materialsLoading}
          materialsUploading={materialsUploading}
          materialsDeletingId={materialsDeletingId}
          materialsBookingId={materialsBookingId}
          setMaterialsBookingId={setMaterialsBookingId}
          materialsUploadFormRef={materialsUploadFormRef}
          onUploadMaterial={uploadMaterial}
          onDeleteMaterial={(mId) => deleteMaterial(mId)}
          onMaterialBookingSelect={loadMaterials}

          // Portal Credentials
          revealedPortalPasswords={revealedPortalPasswords}
          portalCredentialBusyCustomerId={portalCredentialBusyCustomerId}
          onRevealPortalPassword={() => selectedCustomer && revealPortalPasswordApi(selectedCustomer.id)}
          onRegeneratePortalPassword={() => selectedCustomer && regeneratePortalPasswordApi(selectedCustomer.id)}
          
          // Action handlers for profile tab
          onCancelEdit={() => setIsEditing(false)}
          onStartEdit={() => setIsEditing(true)}
          onDeleteCustomer={() => selectedCustomer && deleteCustomer(selectedCustomer)}
          onViewBillingHistory={() => selectedCustomer && router.push(`/admin/invoices?q=${encodeURIComponent(selectedCustomer.fullName)}`)}
          deletingCustomerId={null}
        />
      )}
    </AdminShell>
  );
}
