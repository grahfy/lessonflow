"use client";
import { APP_TIMEZONE } from "@/lib/time";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminHeader } from "@/components/admin-header";
import { Pagination } from "@/components/pagination";
import { animateIn, animateOut } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";

type AuState = "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA";
const AU_STATES: AuState[] = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const PHONE_PATTERN = /^\d{10}$/;
const POSTCODE_PATTERN = /^\d{4}$/;

type CustomerRow = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonMode: "in_person" | "video";
  unitNumber: string | null;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
  isArchived: boolean;
  portalCredential?: {
    id: string;
    generatedAt: string;
    rotatedAt: string | null;
    isActive: boolean;
  } | null;
};

type LearningMaterialBooking = {
  id: string;
  startAt: string;
  endAt: string;
  status: "approved" | "cancelled";
  lessonMode: "in_person" | "video";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
};

type LearningMaterialRow = {
  id: string;
  title: string;
  bookingId: string | null;
  materialType: "audio" | "pdf";
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  previewUrl?: string;
  downloadUrl?: string;
};

type CustomerPortalCredentialResponse = {
  password: string;
  credential: {
    id: string;
    generatedAt: string;
    rotatedAt: string | null;
    isActive: boolean;
  };
  created?: boolean;
};

type CustomerForm = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonMode: "in_person" | "video";
  unitNumber: string;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: AuState;
  postcode: string;
};

function emptyCustomerForm(): CustomerForm {
  return {
    firstName: "",
    lastName: "",
    fullName: "",
    email: "",
    phone: "",
    skillLevel: "beginner",
    lessonMode: "in_person",
    unitNumber: "",
    houseNumber: "",
    streetName: "",
    streetType: "Street",
    suburb: "",
    state: "VIC",
    postcode: ""
  };
}

function customerFormFromRow(customer: CustomerRow): CustomerForm {
  let firstName = customer.firstName;
  let lastName = customer.lastName;

  if (!firstName && !lastName) {
    const nameParts = customer.fullName.split(" ");
    firstName = nameParts[0] || "";
    lastName = nameParts.slice(1).join(" ") || "";
  }

  return {
    firstName,
    lastName,
    fullName: customer.fullName,
    email: customer.email,
    phone: toDigits(customer.phone, 10),
    skillLevel: customer.skillLevel,
    lessonMode: customer.lessonMode,
    unitNumber: customer.unitNumber ?? "",
    houseNumber: customer.houseNumber ?? "",
    streetName: customer.streetName ?? "",
    streetType: customer.streetType ?? "Street",
    suburb: customer.suburb ?? "",
    state: toAuState(customer.state),
    postcode: customer.postcode ?? ""
  };
}

function toAuState(value: string): AuState {
  return AU_STATES.includes(value as AuState) ? (value as AuState) : "VIC";
}

function toDigits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE
  }).format(date);
}

function readApiErrorMessage(payload: unknown, fallback: string): string {
  const api = payload as { error?: string } | null | undefined;
  return api?.error || fallback;
}

async function readApiErrorFromResponse(response: Response, fallback: string): Promise<string> {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    return readApiErrorMessage(payload, fallback);
  }

  if (response.status === 401 || response.status === 403) {
    return "Your admin session has expired. Please sign in again.";
  }

  if (contentType.includes("text/html")) {
    return `${fallback} The server returned HTML instead of JSON. Check login status or proxy redirects.`;
  }

  const text = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length < 200 ? `${fallback} ${text}` : fallback;
}

export function AdminCustomersClient() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
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
  const [emailHistory, setEmailHistory] = useState<any[]>([]);
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

  const safeFetch = useCallback(async (...args: Parameters<typeof globalThis.fetch>): Promise<Response> => {
    try {
      return await globalThis.fetch(...args);
    } catch {
      return new Response(JSON.stringify({ error: "Network request failed. Please try again." }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
  }, []);

  const redirectToAdminLogin = useCallback(() => {
    if (authRedirectingRef.current) return;
    authRedirectingRef.current = true;
    setError("");
    window.location.assign("/admin/login");
  }, []);

  const handleApiError = useCallback(
    async (response: Response, fallback: string) => {
      if (response.status === 401 || response.status === 403) {
        redirectToAdminLogin();
        return;
      }
      setError(await readApiErrorFromResponse(response, fallback));
    },
    [redirectToAdminLogin]
  );

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    setError("");
    const search = customerQuery.trim();
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
    }, [customerQuery, handleApiError, page, pageSize, safeFetch]);

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

  // Reset to page 1 when query changes
  useEffect(() => {
    setPage(1);
  }, [customerQuery]);

  useEffect(() => {
    if (!dialogPresence.isMounted || !dialogRootRef.current) return;
    void animateIn(dialogRootRef.current, { scope: "admin" });
  }, [dialogPresence.isMounted]);

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

      const body = (await response.json()) as CustomerPortalCredentialResponse;
      setRevealedPortalPasswords((prev) => ({ ...prev, [customerId]: body.password }));
      
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

  const Separator = () => <div style={{ width: '1px', height: '24px', background: 'var(--line)', flexShrink: 0 }} />;

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
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
          <label>Search Directory</label>
          <input
            value={customerQuery}
            placeholder="Search by name, email, or phone..."
            onChange={(event) => setCustomerQuery(event.target.value)}
          />
        </div>
      </div>

      {error && !dialogPresence.isMounted ? <p className="notice error">{error}</p> : null}
      {notice && !dialogPresence.isMounted ? <p className="notice success">{notice}</p> : null}
      {loadingCustomers && !customers.length ? <p className="notice">Loading customers...</p> : null}

      <div className="admin-card invoice-list-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="customers-list" style={{ maxHeight: 'none', gap: '0', padding: 0 }}>
          {customers.length ? (
            <div className="customer-item customer-list-header" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              padding: '12px 16px', 
              gap: '12px', 
              width: '100%',
              border: 'none',
              borderBottom: '1px solid var(--line)',
              background: 'var(--admin-card-bg)',
              borderRadius: 0,
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}>
              <div style={{ flex: '1', minWidth: '180px', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Customer / Email</div>
              <Separator />
              <div style={{ width: '110px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Phone</div>
              <Separator />
              <div style={{ width: '120px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Skill / Mode</div>
              <Separator />
              <div style={{ flex: '0.8', minWidth: '150px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Portal Status</div>
              <Separator />
              <div style={{ width: '240px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Actions</div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: '0', padding: '0' }}>
            {customers.length ? (
              customers.map((customer) => (
                <div 
                  key={customer.id} 
                  className="customer-item" 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '12px 16px', 
                    gap: '12px', 
                    cursor: 'pointer',
                    width: '100%',
                    borderRadius: 0,
                    border: 'none',
                    borderBottom: '1px solid var(--line)'
                  }}
                  onClick={() => openCustomerDialog(customer, false)}
                >
                  <div style={{ flex: '1', minWidth: '180px', display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: '0.95rem' }}>{customer.lastName ? `${customer.lastName}, ${customer.firstName}` : customer.fullName}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink-1)' }}>{customer.email}</span>
                  </div>

                  <Separator />
                  <div style={{ width: '110px', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.85rem' }}>{customer.phone}</span>
                  </div>

                  <Separator />
                  <div style={{ width: '120px', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}>{customer.skillLevel}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-1)' }}>{customer.lessonMode === "in_person" ? "In-person" : "Video"}</span>
                  </div>

                  <Separator />
                  <div style={{ flex: '0.8', minWidth: '150px', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.85rem' }}>
                      {customer.portalCredential ? `Active (since ${new Date(customer.portalCredential.generatedAt).toLocaleDateString("en-AU")})` : "Not generated"}
                    </span>
                  </div>

                  <Separator />
                  <div className="customer-item-actions" style={{ width: '240px', display: 'flex', justifyContent: 'flex-end', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 10px', fontSize: '0.7rem', minWidth: '0', flex: '1' }}
                      type="button" 
                      onClick={() => router.push(`/admin/invoices?q=${encodeURIComponent(customer.fullName)}`)}
                    >
                      Invoices
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 10px', fontSize: '0.7rem', minWidth: '0', flex: '1' }}
                      type="button" 
                      onClick={() => openCustomerDialog(customer, true)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '6px 10px', fontSize: '0.7rem', minWidth: '0', flex: '1' }}
                      type="button"
                      disabled={deletingCustomerId === customer.id}
                      onClick={() => void deleteCustomer(customer)}
                    >
                      {deletingCustomerId === customer.id ? "..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              !loadingCustomers && <p className="helper-text" style={{ padding: '20px' }}>No customers found.</p>
            )}
          </div>
        </div>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          totalCount={totalCount}
          pageSizeOptions={[25, 50, 100, 250]}
        />
      </div>

      {dialogPresence.isMounted ? (
        <div
          className="dialog-backdrop"
          ref={dialogRootRef}
          data-motion-root="admin"
          data-motion-item="customer-dialog-backdrop"
          onClick={() => void closeCustomerDialog()}
        >
          <div
            className="dialog-panel dialog-panel-wide"
            data-motion-item="customer-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-head">
              <h3 id="customer-dialog-title">Customer Details</h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeCustomerDialog()}>
                Close
              </button>
            </div>

            <div className="dialog-status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {selectedCustomer ? (
                  <>Profile: <strong>{selectedCustomer.fullName}</strong> · ID: <code>{selectedCustomer.id}</code></>
                ) : (
                  <>New Customer Profile</>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.1)', padding: '2px', borderRadius: '6px' }}>
                <button 
                  className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '0.75rem', border: 'none', boxShadow: 'none' }}
                  onClick={() => setActiveTab('profile')}
                >
                  Profile & Address
                </button>
                <button 
                  className={`btn ${activeTab === 'emails' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '0.75rem', border: 'none', boxShadow: 'none' }}
                  onClick={() => setActiveTab('emails')}
                  disabled={!selectedCustomer}
                >
                  Communication
                </button>
                <button 
                  className={`btn ${activeTab === 'materials' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '0.75rem', border: 'none', boxShadow: 'none' }}
                  onClick={() => setActiveTab('materials')}
                  disabled={!selectedCustomer}
                >
                  Learning Materials
                </button>
              </div>
            </div>

            {error ? <p className="notice error" style={{ marginTop: '12px' }}>{error}</p> : null}
            {notice ? <p className="notice success" style={{ marginTop: '12px' }}>{notice}</p> : null}

            <div className="dialog-layout" style={{ marginTop: "12px" }}>
              {activeTab === 'profile' ? (
                <>
                  <div className="dialog-col">
                    <h4>Contact & Profile</h4>
                    <div className="form-grid dialog-form-grid">
                      <div className="field">
                        <label>First Name *</label>
                        <input 
                          value={customerForm.firstName} 
                          readOnly={!isEditing}
                          onChange={e => setCustomerForm(prev => ({ ...prev, firstName: e.target.value }))}
                        />
                      </div>
                      <div className="field">
                        <label>Last Name *</label>
                        <input 
                          value={customerForm.lastName} 
                          readOnly={!isEditing}
                          onChange={e => setCustomerForm(prev => ({ ...prev, lastName: e.target.value }))}
                        />
                      </div>
                      <div className="field full">
                        <label>Email *</label>
                        <input 
                          type="email"
                          value={customerForm.email} 
                          readOnly={!isEditing}
                          onChange={e => setCustomerForm(prev => ({ ...prev, email: e.target.value }))}
                        />
                      </div>
                      <div className="field">
                        <label>Phone *</label>
                        <input 
                          value={customerForm.phone} 
                          readOnly={!isEditing}
                          maxLength={10}
                          onChange={e => setCustomerForm(prev => ({ ...prev, phone: toDigits(e.target.value, 10) }))}
                        />
                      </div>
                      <div className="field">
                        <label>Skill Level</label>
                        {isEditing ? (
                          <select
                            value={customerForm.skillLevel}
                            onChange={e => setCustomerForm(prev => ({ ...prev, skillLevel: e.target.value as any }))}
                          >
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                          </select>
                        ) : (
                          <input value={customerForm.skillLevel} style={{ textTransform: 'capitalize' }} readOnly />
                        )}
                      </div>
                      <div className="field">
                        <label>Lesson Mode</label>
                        {isEditing ? (
                          <select
                            value={customerForm.lessonMode}
                            onChange={e => setCustomerForm(prev => ({ ...prev, lessonMode: e.target.value as any }))}
                          >
                            <option value="in_person">In Person</option>
                            <option value="video">Video</option>
                          </select>
                        ) : (
                          <input value={customerForm.lessonMode === "in_person" ? "In-person" : "Video"} readOnly />
                        )}
                      </div>
                    </div>

                    <h4 style={{ marginTop: '20px' }}>Address</h4>
                    <div className="form-grid dialog-form-grid">
                      <div className="field">
                        <label>Unit / Apartment</label>
                        <input 
                          value={customerForm.unitNumber} 
                          readOnly={!isEditing}
                          onChange={e => setCustomerForm(prev => ({ ...prev, unitNumber: e.target.value }))}
                        />
                      </div>
                      <div className="field">
                        <label>House Number *</label>
                        <input 
                          value={customerForm.houseNumber} 
                          readOnly={!isEditing}
                          onChange={e => setCustomerForm(prev => ({ ...prev, houseNumber: e.target.value }))}
                        />
                      </div>
                      <div className="field full">
                        <label>Street *</label>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input 
                              style={{ flex: 2 }}
                              placeholder="Name"
                              value={customerForm.streetName} 
                              onChange={e => setCustomerForm(prev => ({ ...prev, streetName: e.target.value }))}
                            />
                            <select
                              style={{ flex: 1 }}
                              value={customerForm.streetType}
                              onChange={e => setCustomerForm(prev => ({ ...prev, streetType: e.target.value }))}
                            >
                              <option value="Street">Street</option>
                              <option value="Road">Road</option>
                              <option value="Avenue">Avenue</option>
                              <option value="Drive">Drive</option>
                              <option value="Lane">Lane</option>
                              <option value="Court">Court</option>
                              <option value="Crescent">Crescent</option>
                              <option value="Place">Place</option>
                              <option value="Boulevard">Boulevard</option>
                              <option value="Terrace">Terrace</option>
                              <option value="Parade">Parade</option>
                              <option value="Close">Close</option>
                            </select>
                          </div>
                        ) : (
                          <input value={`${customerForm.streetName} ${customerForm.streetType}`} readOnly />
                        )}
                      </div>
                      <div className="field">
                        <label>Suburb *</label>
                        <input 
                          value={customerForm.suburb} 
                          readOnly={!isEditing}
                          onChange={e => setCustomerForm(prev => ({ ...prev, suburb: e.target.value }))}
                        />
                      </div>
                      <div className="field">
                        <label>State & Postcode *</label>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              style={{ flex: 2 }}
                              value={customerForm.state}
                              onChange={e => setCustomerForm(prev => ({ ...prev, state: e.target.value as AuState }))}
                            >
                              {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <input 
                              style={{ width: '80px', flexShrink: 0 }}
                              maxLength={4}
                              placeholder="Postcode"
                              value={customerForm.postcode} 
                              onChange={e => setCustomerForm(prev => ({ ...prev, postcode: toDigits(e.target.value, 4) }))}
                            />
                          </div>
                        ) : (
                          <input value={`${customerForm.state} ${customerForm.postcode}`} readOnly />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="dialog-col is-notes">
                    <h4>Portal Credentials</h4>
                    <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', border: '1px solid var(--line)' }}>
                      <p className="helper-text">Manage access to the student portal. Passwords are encrypted and can be revealed or rotated by admins.</p>
                      
                      <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--ink-2)' }}>Generated:</span>
                          <span style={{ fontWeight: 600 }}>{selectedCustomer?.portalCredential ? formatDateTime(selectedCustomer.portalCredential.generatedAt) : "Never"}</span>
                        </div>
                        {selectedCustomer?.portalCredential?.rotatedAt && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--ink-2)' }}>Last Rotated:</span>
                            <span style={{ fontWeight: 600 }}>{formatDateTime(selectedCustomer.portalCredential.rotatedAt)}</span>
                          </div>
                        )}
                        
                        {selectedCustomer && revealedPortalPasswords[selectedCustomer.id] && (
                          <div className="notice success" style={{ margin: '8px 0', padding: '10px' }}>
                            <small style={{ display: 'block', marginBottom: '4px', textTransform: 'uppercase', opacity: 0.8 }}>Current Password</small>
                            <code style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.5px' }}>{revealedPortalPasswords[selectedCustomer.id]}</code>
                          </div>
                        )}

                        <div className="button-row" style={{ marginTop: '8px' }}>
                          <button
                            className="btn btn-secondary"
                            disabled={!selectedCustomer || portalCredentialBusyCustomerId === selectedCustomer.id || isEditing}
                            onClick={() => selectedCustomer && void revealPortalPassword(selectedCustomer.id)}
                          >
                            {selectedCustomer && portalCredentialBusyCustomerId === selectedCustomer.id ? "..." : "Reveal Password"}
                          </button>
                          <button
                            className="btn btn-secondary"
                            disabled={!selectedCustomer || portalCredentialBusyCustomerId === selectedCustomer.id || isEditing}
                            onClick={() => selectedCustomer && void regeneratePortalPassword(selectedCustomer.id)}
                          >
                            {selectedCustomer && portalCredentialBusyCustomerId === selectedCustomer.id ? "..." : "Regenerate"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <h4 style={{ marginTop: '30px' }}>Actions</h4>
                    <div className="dialog-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                      {isEditing ? (
                        <>
                          <button 
                            className="btn btn-primary" 
                            type="button" 
                            disabled={savingCustomer}
                            onClick={() => void saveCustomer()}
                          >
                            {savingCustomer ? "Saving..." : "Save Changes"}
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            type="button" 
                            disabled={savingCustomer}
                            onClick={() => {
                              if (!selectedCustomer) void closeCustomerDialog();
                              else {
                                setCustomerForm(customerFormFromRow(selectedCustomer));
                                setIsEditing(false);
                              }
                            }}
                          >
                            Cancel Edit
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            className="btn btn-primary" 
                            type="button" 
                            onClick={() => selectedCustomer && router.push(`/admin/invoices?q=${encodeURIComponent(selectedCustomer.fullName)}`)}
                          >
                            View Billing History
                          </button>
                          <button className="btn btn-secondary" type="button" onClick={() => setIsEditing(true)}>
                            Edit Profile
                          </button>
                        </>
                      )}
                      
                      {selectedCustomer && (
                        <button
                          className="btn btn-danger"
                          type="button"
                          disabled={deletingCustomerId === selectedCustomer.id || savingCustomer || isEditing}
                          onClick={() => void deleteCustomer(selectedCustomer)}
                        >
                          {deletingCustomerId === selectedCustomer.id ? "Deleting..." : "Delete Customer"}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : activeTab === 'emails' ? (
                <>
                  <div className="dialog-col">
                    <h4>Email History</h4>
                    <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '12px', border: '1px solid var(--line)', maxHeight: '500px', overflowY: 'auto' }}>
                      {loadingEmailHistory ? (
                        <p className="helper-text">Loading history...</p>
                      ) : emailHistory.length > 0 ? (
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {emailHistory.map((email) => (
                            <div key={email.id} style={{ padding: '12px', borderBottom: '1px solid var(--line)', fontSize: '0.85rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <strong style={{ color: 'var(--ink-0)' }}>{email.subject}</strong>
                                <span style={{ color: 'var(--ink-2)', fontSize: '0.75rem' }}>{formatDateTime(email.createdAt)}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span className={`invoice-item-chip invoice-item-chip-status invoice-item-chip-status-${email.status === 'sent' ? 'paid' : 'draft'}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                                  {email.status}
                                </span>
                                {email.error && <span style={{ color: 'var(--brand-danger)', fontSize: '0.75rem' }}>{email.error}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="helper-text">No email history found for this address.</p>
                      )}
                    </div>
                  </div>

                  <div className="dialog-col is-notes">
                    <h4>Send Email</h4>
                    <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', border: '1px solid var(--line)' }}>
                      <div style={{ display: 'grid', gap: '12px' }}>
                        <div className="field">
                          <label>Subject</label>
                          <input 
                            placeholder="Email subject"
                            value={emailComposerSubject}
                            onChange={e => setEmailComposerSubject(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>Message</label>
                          <textarea 
                            placeholder="Type your message to the student here..."
                            style={{ minHeight: '200px', resize: 'vertical' }}
                            value={emailComposerMessage}
                            onChange={e => setEmailComposerMessage(e.target.value)}
                          />
                        </div>
                        <button 
                          className="btn btn-primary" 
                          type="button"
                          disabled={sendingEmail || !emailComposerSubject.trim() || !emailComposerMessage.trim()}
                          onClick={() => void sendCustomerEmail()}
                        >
                          {sendingEmail ? "Sending..." : "Send Email"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="dialog-col">
                    <h4>Assigned Materials</h4>
                    <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '12px', border: '1px solid var(--line)', maxHeight: '500px', overflowY: 'auto' }}>
                      {materialsLoading ? (
                        <p className="helper-text">Loading materials...</p>
                      ) : materialsList.length > 0 ? (
                        <div className="materials-grid">
                          {materialsList.map(m => (
                            <div key={m.id} className="material-card">
                              <div className="material-card-info">
                                <strong>{m.title}</strong>
                                <p className="helper-text">
                                  {m.materialType.toUpperCase()} · {formatBytes(m.sizeBytes)} · {new Date(m.createdAt).toLocaleDateString("en-AU")}
                                </p>
                                {m.materialType === "audio" && m.previewUrl && (
                                  <div style={{ marginTop: '8px' }}>
                                    <audio className="material-audio-player" controls preload="metadata" src={m.previewUrl} />
                                  </div>
                                )}
                              </div>
                              <div className="material-card-actions">
                                {m.materialType === "pdf" && m.previewUrl && (
                                  <a 
                                    className="btn btn-secondary btn-compact" 
                                    href={m.previewUrl} 
                                    target="_blank" 
                                    rel="noreferrer"
                                  >
                                    PREVIEW
                                  </a>
                                )}
                                <button 
                                  className="btn btn-danger btn-compact" 
                                  disabled={materialsDeletingId === m.id}
                                  onClick={() => void deleteLearningMaterial(m)}
                                >
                                  {materialsDeletingId === m.id ? "..." : "DELETE"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="helper-text">No materials uploaded for the current selection.</p>
                      )}
                    </div>
                  </div>

                  <div className="dialog-col is-notes">
                    <h4>Upload New Material</h4>
                    <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', border: '1px solid var(--line)' }}>
                      <div className="field" style={{ marginBottom: '16px' }}>
                        <label>Select appointment (optional)</label>
                        <select 
                          value={materialsBookingId} 
                          onChange={e => {
                            const bid = e.target.value;
                            setMaterialsBookingId(bid);
                            if (selectedCustomer) void loadLearningMaterials(selectedCustomer.id, bid || undefined);
                          }}
                        >
                          <option value="">Whole student profile</option>
                          {materialsBookings.map(b => (
                            <option key={b.id} value={b.id}>
                              {formatDateTime(b.startAt)} ({b.status})
                            </option>
                          ))}
                        </select>
                      </div>

                      <form 
                        ref={materialsUploadFormRef} 
                        className="material-upload-form" 
                        onSubmit={e => { e.preventDefault(); void uploadLearningMaterial(); }}
                      >
                        <div style={{ display: 'grid', gap: '12px' }}>
                          <div className="field">
                            <label>Material title</label>
                            <input name="title" required placeholder="e.g. Pentatonic exercise week 1" />
                          </div>
                          <div className="field">
                            <label>File</label>
                            <input type="file" name="file" accept=".pdf,audio/*" required />
                          </div>
                          <button 
                            className="btn btn-primary" 
                            type="submit" 
                            disabled={materialsUploading}
                          >
                            {materialsUploading ? "UPLOADING..." : "UPLOAD MATERIAL"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

