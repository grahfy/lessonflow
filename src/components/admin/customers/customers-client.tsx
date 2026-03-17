/**
 * Admin Customers Console
 * 
 * The primary CRM interface for managing students, their communication history, 
 * learning materials, and portal credentials.
 * 
 * CORE RESPONSIBILITIES:
 * 1. Customer Discovery: Paginated list with debounced search (Name, Email, Phone).
 * 2. Profile Management: Creating and editing detailed student records.
 * 3. Communication Audit: Viewing provider-backed email history and refreshing customer email timelines.
 * 4. Resource Allocation: Attaching audio/PDF materials to customers or specific lessons.
 * 5. Access Control: Managing and rotating student portal credentials.
 * 
 * DESIGN RATIONALE:
 * - Tabbed Detail View: Collates all student-related data in a single modal 
 *   to minimize context switching.
 * - Soft Deletion: If a customer has linked bookings, "deletion" automatically 
 *   switches to "archiving" to preserve financial and historical integrity.
 * - Debounced Search: Reduces database load by waiting 300ms before triggering 
 *   a search query.
 */

"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { animateIn, animateOut, useTweenOrchestrator } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";
import { CustomerTable } from "@/components/admin/customers/customer-table";
import { CustomerDialogWrapper } from "@/components/admin/customers/customer-dialog-wrapper";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { emptyCustomerForm, customerFormFromRow, type CustomerRow, type CustomerForm } from "@/components/admin/customers/customer-profile-dialog";

import { useAdminSession } from "@/lib/admin/use-admin-session";
import { useCustomers } from "@/lib/admin/use-customers";
import { useEmailHistory } from "@/lib/admin/use-email-history";
import { useLearningMaterials } from "@/lib/admin/use-learning-materials";
import { usePortalCredentials } from "@/lib/admin/use-portal-credentials";
import { useTeachers } from "@/lib/admin/use-teachers";
import type { CustomerEmailAlertsSummary } from "@/lib/admin/customer-email-alerts";
import { type CustomersSortBy, type CustomersSortDirection } from "@/lib/customers/schema";

/**
 * Main Client Component for the /admin/customers route.
 * Orchestrates data fetching across multiple sub-services (Email, Materials, Credentials).
 */
export function AdminCustomersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputId = useId();
  const sortSelectId = useId();
  const { beginExitTransition } = useTweenOrchestrator();
  const emailAlertMode = searchParams.get("emailAlert") === "customer-email";
  
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [emailAlertSummary, setEmailAlertSummary] = useState<CustomerEmailAlertsSummary | null>(null);
  const [loadingEmailAlertSummary, setLoadingEmailAlertSummary] = useState(false);

  // Transient feedback timer (Auto-clear notices)
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 10000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  // Search & Sorting State
  const [customerQuery, setCustomerQuery] = useState("");
  const [debouncedCustomerQuery, setDebouncedCustomerQuery] = useState("");
  const [sortBy, setSortBy] = useState<CustomersSortBy>("customer");
  const [sortDir, setSortDir] = useState<CustomersSortDirection>("asc");

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Selected Customer UI State
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm());
  const [activeTab, setActiveTab] = useState<"profile" | "emails" | "materials">("profile");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);

  // Email Composer State
  const [emailComposerSubject, setEmailComposerSubject] = useState("");
  const [emailComposerMessage, setEmailComposerMessage] = useState("");

  // Materials State (Filtering uploads to specific bookings)
  const [materialsBookingId, setMaterialsBookingId] = useState("");

  const dialogPresence = usePresenceExit();
  const dialogRootRef = useRef<HTMLDivElement | null>(null);
  const materialsUploadFormRef = useRef<HTMLFormElement | null>(null);
  const alertCustomerIds = useMemo(
    () => emailAlertSummary?.matchedCustomers.map((customer) => customer.id) ?? [],
    [emailAlertSummary]
  );

  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);
  const { admin: currentAdmin } = useAdminSession({ onAuthError, onError: setError });
  const { teachers: teacherOptions } = useTeachers({ onAuthError, onError: setError });
  const singleTeacherOptionId = teacherOptions.length === 1 ? teacherOptions[0]?.id ?? "" : "";

  // -- DATA HOOKS (Separated by domain logic) --
  
  const { 
    customers, 
    setCustomers,
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
    syncing: syncingEmail,
    load: loadEmailHistory, 
    send: sendEmailApi,
    sync: syncEmailApi
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

  const canManageSelectedCustomer = Boolean(
    currentAdmin && selectedCustomer && (currentAdmin.role === "owner" || selectedCustomer.primaryTeacherId === currentAdmin.id)
  );
  const canManagePortalCredentials = currentAdmin?.role === "owner";
  const customersBasePath = emailAlertMode ? "/admin/customers?emailAlert=customer-email" : "/admin/customers";

  // -- DIALOG HANDLERS --

  /** Opens the complex tabbed detail dialog for a customer and triggers sub-data loads. */
  const openCustomerDialog = useCallback(async (customer: CustomerRow | null, editMode = false) => {
    setError("");
    setNotice("");
    setSelectedCustomer(customer);
    setIsEditing(editMode);
    const nextForm = customer ? customerFormFromRow(customer) : emptyCustomerForm();
    if (!nextForm.primaryTeacherId && singleTeacherOptionId) {
      nextForm.primaryTeacherId = singleTeacherOptionId;
    }
    setCustomerForm(nextForm);
    setActiveTab("profile");
    setMaterialsBookingId("");

    // Eagerly load history if a customer is selected
    if (customer) {
      void loadEmailHistory(customer.id);
      if (currentAdmin?.role === "owner" || customer.primaryTeacherId === currentAdmin?.id) {
        void loadMaterials(customer.id);
      }
    }

    dialogPresence.show();
    if (dialogRootRef.current) {
      animateIn(dialogRootRef.current);
    }
  }, [currentAdmin, dialogPresence, loadEmailHistory, loadMaterials, singleTeacherOptionId]);

  const closeCustomerDialog = useCallback(async () => {
    if (dialogRootRef.current) {
      await animateOut(dialogRootRef.current);
    }
    dialogPresence.hide();
    setSelectedCustomer(null);
    setIsEditing(false);
    setCustomerForm(emptyCustomerForm());
    setMaterialsBookingId("");
    // Clear URL segments to maintain clean routing
    router.replace(customersBasePath, { scroll: false });
  }, [customersBasePath, dialogPresence, router]);

  // -- EFFECTS --

  // React to search/sort changes
  useEffect(() => {
    void loadCustomers(
      debouncedCustomerQuery,
      page,
      sortBy,
      sortDir,
      emailAlertMode ? { customerIds: alertCustomerIds } : undefined
    );
  }, [alertCustomerIds, debouncedCustomerQuery, emailAlertMode, page, sortBy, sortDir, loadCustomers]);

  useEffect(() => {
    if (!emailAlertMode) {
      setEmailAlertSummary(null);
      setLoadingEmailAlertSummary(false);
      return;
    }

    let cancelled = false;
    setLoadingEmailAlertSummary(true);

    void fetch("/api/admin/customer-email-alerts", {
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as CustomerEmailAlertsSummary;
      })
      .then((summary) => {
        if (!cancelled) {
          setEmailAlertSummary(summary);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingEmailAlertSummary(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [emailAlertMode]);

  // Deep linking to customer details via URL (e.g. from invoices page)
  useEffect(() => {
    const customerId = searchParams.get("customerId");
    const shouldOpen = searchParams.get("open") === "true";
    
    if (customerId && shouldOpen && customers.length > 0 && !selectedCustomer) {
      const customer = customers.find(c => c.id === customerId);
      if (customer) {
        void openCustomerDialog(customer, false);
      }
      router.replace(customersBasePath, { scroll: false });
    }
  }, [customers, customersBasePath, openCustomerDialog, router, searchParams, selectedCustomer]);

  // Handle Input Debouncing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCustomerQuery(customerQuery), 300);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  // -- ACTION HANDLERS --

  /** Creates or updates a customer profile. */
  async function saveCustomer() {
    setError("");
    setNotice("");
    setSavingCustomer(true);

    const payload = {
      ...customerForm,
      fullName: `${customerForm.firstName.trim()} ${customerForm.lastName.trim()}`,
      primaryTeacherId: customerForm.primaryTeacherId || null
    };

    const result = await saveCustomerApi(payload, selectedCustomer?.id);
    setSavingCustomer(false);

    if (result) {
      setNotice(selectedCustomer ? "Customer updated." : "Customer created.");
      void loadCustomers(
        debouncedCustomerQuery,
        page,
        sortBy,
        sortDir,
        emailAlertMode ? { customerIds: alertCustomerIds } : undefined
      );
      
      if (selectedCustomer) {
        setSelectedCustomer(result);
        setCustomerForm(customerFormFromRow(result));
        setIsEditing(false);
      } else {
        void closeCustomerDialog();
      }
    }
  }

  /**
   * Deletes a customer or archives them if they have active bookings.
   * RATIONALE: We cannot hard-delete customers with financial or scheduling 
   * history as it would orphan child records.
   */
  async function deleteCustomer(customer: CustomerRow) {
    if (!window.confirm(`Are you sure you want to delete ${customer.fullName}? This will archive the customer if they have linked bookings.`)) {
      return;
    }

    setError("");
    setNotice("");
    setDeletingCustomerId(customer.id);
    const result = await removeCustomerApi(customer.id);
    setDeletingCustomerId(null);
    
    if (result) {
      setNotice(result.archived ? "Customer archived (has linked bookings)." : "Customer deleted.");
      if (selectedCustomer?.id === customer.id) {
        void closeCustomerDialog();
      }
      void loadCustomers(
        debouncedCustomerQuery,
        page,
        sortBy,
        sortDir,
        emailAlertMode ? { customerIds: alertCustomerIds } : undefined
      );
    }
  }

  /** Dispatches an ad-hoc custom email to the student. */
  async function sendCustomerEmail(subject: string, message: string, captcha?: { captchaToken: string; captchaAnswer: string }) {
    if (!selectedCustomer) return { success: false };
    setError("");
    const result = await sendEmailApi(selectedCustomer.id, subject, message, captcha);
    if (result.success) {
      setNotice("Email sent successfully.");
      setEmailComposerSubject("");
      setEmailComposerMessage("");
    }
    return result;
  }

  /** Uploads a resource file (WAV/PDF/IMG) for the student. */
  async function uploadMaterial(captcha?: { captchaToken: string; captchaAnswer: string }) {
    if (!selectedCustomer || !materialsUploadFormRef.current) return;
    setError("");
    const success = await uploadMaterialApi(selectedCustomer.id, materialsBookingId, materialsUploadFormRef.current, captcha);
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

  function handleMaterialBookingSelect(bookingId: string) {
    if (!selectedCustomer) return;
    void loadMaterials(selectedCustomer.id, bookingId);
  }

  return (
    <AdminShell 
      title="Customers" 
      error={error && !dialogPresence.isMounted ? error : undefined}
      notice={notice && !dialogPresence.isMounted ? notice : undefined}
      className="admin-shell-customers"
    >
      <div className="admin-layout-content">
        {emailAlertMode ? (
          <AdminCard className="customer-email-alert-summary-card">
            <div className="customer-email-alert-summary-head">
              <div>
                <h2 className="admin-settings-section-title">Unread Customer Email Alerts</h2>
                <p className="helper-text">
                  {loadingEmailAlertSummary
                    ? "Checking the configured inbox for unread customer emails..."
                    : emailAlertSummary?.state === "disabled"
                      ? "Customer email alerts are currently disabled in Settings."
                      : emailAlertSummary?.state === "not_configured"
                        ? "No inbox provider is configured for unread customer email alerts."
                    : emailAlertSummary?.unreadCount
                      ? `${emailAlertSummary.unreadCount} unread email${emailAlertSummary.unreadCount === 1 ? "" : "s"} across ${emailAlertSummary.matchedCustomers.length} customer${emailAlertSummary.matchedCustomers.length === 1 ? "" : "s"} via ${emailAlertSummary.provider?.toUpperCase() || "inbox"}.`
                      : "No unread customer emails match current customer records."}
                </p>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => router.replace("/admin/customers", { scroll: false })}
              >
                Exit Alert Mode
              </button>
            </div>

            {emailAlertSummary?.messages.length ? (
              <div className="customer-email-alert-list">
                {emailAlertSummary.messages.map((message) => {
                  const customer = customers.find((row) => row.id === message.customerId) || null;
                  return (
                    <div key={message.messageId} className="customer-email-alert-item">
                      <div className="customer-email-alert-copy">
                        <strong>{message.subject}</strong>
                        <p className="helper-text">
                          {message.customerName} · {message.senderEmail} · {new Date(message.receivedAt).toLocaleString()}
                        </p>
                        <p>{message.snippet || "No preview available."}</p>
                      </div>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => {
                          if (customer) {
                            void openCustomerDialog(customer, false);
                          }
                        }}
                        disabled={!customer}
                      >
                        Open Customer
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </AdminCard>
        ) : null}

        <AdminCard className="admin-toolbar-card admin-actions-card">
          <div className="admin-actions-bar">
            <div className="admin-actions-group">
              {currentAdmin?.role === "owner" ? (
                <button className="btn btn-primary" type="button" onClick={() => openCustomerDialog(null, true)}>
                  New Customer
                </button>
              ) : null}
            </div>

            <div className="admin-toolbar-filters">
              <div className="search-box admin-search-box">
                <label htmlFor={searchInputId}>Search</label>
                <Tooltip content="Search for students by name, email, or phone number.">
                  <input
                    id={searchInputId}
                    type="text"
                    value={customerQuery}
                    placeholder="Name, email, or phone"
                    onChange={(event) => setCustomerQuery(event.target.value)}
                  />
                </Tooltip>
              </div>
              <div className="admin-sort-inline-row">
                <label htmlFor={sortSelectId} className="admin-inline-field">Sort</label>
                <Tooltip content="Change the primary sorting field for the customer list.">
                  <select
                    id={sortSelectId}
                    value={sortBy}
                    onChange={(event) => {
                      setSortBy(event.target.value as CustomersSortBy);
                      setPage(1);
                    }}
                  >
                    <option value="customer">Customer</option>
                    <option value="skill_mode">Skill / Mode</option>
                  </select>
                </Tooltip>
                <Tooltip content={sortDir === "asc" ? "Sort in ascending order." : "Sort in descending order."}>
                  <button
                    type="button"
                    className="btn btn-secondary admin-sort-direction-btn"
                    onClick={() => {
                      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                      setPage(1);
                    }}
                  >
                    {sortDir === "asc" ? "Asc" : "Desc"}
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </AdminCard>

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
          canManageCustomers={currentAdmin?.role === "owner"}
          canViewBilling={currentAdmin?.role === "owner"}
          onOpenCustomerDialog={openCustomerDialog}
          onDeleteCustomer={deleteCustomer}
          onViewInvoices={(name) => void beginExitTransition(null, 0, () => router.push(`/admin/invoices?q=${encodeURIComponent(name)}`))}
        />
      </div>

      {/* 
        MULTI-TAB DETAIL DIALOG
        RATIONALE: We use a deferred mounting strategy to ensure animations are 
        smooth and data cleanup occurs on exit.
      */}
      {dialogPresence.isMounted && (
        <CustomerDialogWrapper
          dialogRootRef={dialogRootRef}
          selectedCustomer={selectedCustomer}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          canAccessCustomerActions={canManageSelectedCustomer}
          isEditing={isEditing}
          customerForm={customerForm}
          setCustomerForm={setCustomerForm}
          savingCustomer={savingCustomer}
          deletingCustomerId={deletingCustomerId}
          canEditProfile={canManageSelectedCustomer}
          onSaveCustomer={saveCustomer}
          onClose={closeCustomerDialog}
          error={error}
          notice={notice}
          
          // Email History & Sync Logic
          loadingEmailHistory={loadingEmailHistory}
          emailHistory={emailHistory}
          emailComposerSubject={emailComposerSubject}
          setEmailComposerSubject={setEmailComposerSubject}
          emailComposerMessage={emailComposerMessage}
          setEmailComposerMessage={setEmailComposerMessage}
          sendingEmail={sendingEmail}
          syncingEmail={syncingEmail}
          onSendEmail={sendCustomerEmail}
          onSyncEmail={() => selectedCustomer && syncEmailApi(selectedCustomer.id)}

          // Learning Materials Asset Management
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
          onMaterialBookingSelect={handleMaterialBookingSelect}
          canEditAssignment={currentAdmin?.role === "owner"}
          teacherOptions={teacherOptions.map((teacher) => ({ id: teacher.id, displayName: teacher.displayName }))}
          canManagePortalCredentials={canManagePortalCredentials}
          canViewBillingHistory={currentAdmin?.role === "owner"}
          canDeleteCustomer={currentAdmin?.role === "owner"}

          // Student Portal Identity Access
          revealedPortalPasswords={revealedPortalPasswords}
          portalCredentialBusyCustomerId={portalCredentialBusyCustomerId}
          onRevealPortalPassword={async () => {
            if (!selectedCustomer) return;
            const result = await revealPortalPasswordApi(selectedCustomer.id);
            if (result?.credential) {
              const updated = { ...selectedCustomer, portalCredential: result.credential };
              setSelectedCustomer(updated);
              // Also update in the list to maintain consistency
              setCustomers((prev: CustomerRow[]) => prev.map((c: CustomerRow) => c.id === updated.id ? updated : c));
            }
          }}
          onRegeneratePortalPassword={async () => {
            if (!selectedCustomer) return;
            const result = await regeneratePortalPasswordApi(selectedCustomer.id);
            if (result?.credential) {
              const updated = { ...selectedCustomer, portalCredential: result.credential };
              setSelectedCustomer(updated);
              // Also update in the list to maintain consistency
              setCustomers((prev: CustomerRow[]) => prev.map((c: CustomerRow) => c.id === updated.id ? updated : c));
              setNotice(result.emailMessage || "Portal password regenerated.");
            }
          }}
          
          // Profile Tab Internal Actions
          onCancelEdit={() => setIsEditing(false)}
          onStartEdit={() => canManageSelectedCustomer && setIsEditing(true)}
          onDeleteCustomer={() => selectedCustomer && currentAdmin?.role === "owner" && deleteCustomer(selectedCustomer)}
          onViewBillingHistory={() => selectedCustomer && currentAdmin?.role === "owner" && void beginExitTransition(null, 0, () => router.push(`/admin/invoices?q=${encodeURIComponent(selectedCustomer.fullName)}`))}
        />
      )}
    </AdminShell>
  );
}
