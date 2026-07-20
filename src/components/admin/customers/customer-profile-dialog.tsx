import { useEffect, useMemo, useState } from "react";

import type { AuState } from "@/lib/admin/types";
import { AU_STATES } from "@/lib/admin/types";
import { STREET_TYPES } from "@/lib/admin/constants";
import { formatDateTime, toAuState, toDigits } from "@/lib/admin/utils";
import { AdminForm, AdminField, adminFieldErrorId } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminNotice } from "@/components/admin/ui/admin-notice";
import { AddressAutocomplete } from "@/components/admin/ui/address-autocomplete";
import { Tooltip } from "@/components/admin/ui/tooltip";

// Types derived from admin-customers-client.tsx.
// NOTE: This dialog stays presentation-focused; the parent client owns data
// fetching/mutations and passes down the active customer plus callbacks.
export type CustomerRow = {
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
    primaryTeacherId?: string | null;
    primaryTeacher?: {
        id: string;
        displayName: string;
    } | null;
    portalCredential?: {
        id: string;
        generatedAt: string;
        rotatedAt: string | null;
        isActive: boolean;
    } | null;
};

export type CustomerForm = {
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
    primaryTeacherId: string;
};

/** Empty baseline for create/reset flows before a customer is selected. */
export function emptyCustomerForm(): CustomerForm {
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
        postcode: "",
        primaryTeacherId: ""
    };
}

/**
 * Builds the editable form state from the customer table row shape.
 *
 * RATIONALE: Older rows may only have `fullName`, so the dialog backfills first
 * and last name segments to keep the edit form consistent during migrations.
 */
export function customerFormFromRow(customer: CustomerRow): CustomerForm {
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
        postcode: customer.postcode ?? "",
        primaryTeacherId: customer.primaryTeacherId ?? ""
    };
}

type Props = {
    customer: CustomerRow | null;
    isEditing: boolean;
    form: CustomerForm;
    setForm: React.Dispatch<React.SetStateAction<CustomerForm>>;
    savingCustomer: boolean;
    deletingCustomerId: string | null;
    canEditProfile: boolean;
    canEditAssignment: boolean;
    teacherOptions: Array<{ id: string; displayName: string }>;
    canManagePortalCredentials: boolean;
    canViewBillingHistory: boolean;
    canDeleteCustomer: boolean;
    revealedPortalPasswords: Record<string, string>;
    portalCredentialBusyCustomerId: string | null;
    fieldErrors?: Record<string, string>;
    onSave: () => void;
    onCancelEdit: () => void;
    onStartEdit: () => void;
    onDelete: () => void;
    onViewBillingHistory: () => void;
    onManageLessonCredits: () => void;
    onRevealPortalPassword: () => void;
    onRegeneratePortalPassword: () => void;
    onCopyPortalPassword: (password: string) => void | Promise<void>;
};

export function CustomerProfileDialog({
    customer,
    isEditing,
    form,
    setForm,
    savingCustomer,
    deletingCustomerId,
    canEditProfile,
    canEditAssignment,
    teacherOptions,
    canManagePortalCredentials,
    canViewBillingHistory,
    canDeleteCustomer,
    revealedPortalPasswords,
    portalCredentialBusyCustomerId,
    fieldErrors = {},
    onSave,
    onCancelEdit,
    onStartEdit,
    onDelete,
    onViewBillingHistory,
    onManageLessonCredits,
    onRevealPortalPassword,
    onRegeneratePortalPassword,
    onCopyPortalPassword
}: Props) {
    // Server-reported errors are dismissed per field as soon as the admin edits
    // that field, so a corrected input stops showing a stale message.
    const [dismissedFields, setDismissedFields] = useState<string[]>([]);
    // Returning the previous array when it is already empty lets React bail out
    // of the re-render: `fieldErrors` defaults to a fresh `{}` on every render,
    // so an unconditional reset here would loop.
    useEffect(() => {
        setDismissedFields(prev => (prev.length === 0 ? prev : []));
    }, [fieldErrors]);

    const visibleFieldErrors = useMemo(() => {
        if (dismissedFields.length === 0) {
            return fieldErrors;
        }
        return Object.fromEntries(
            Object.entries(fieldErrors).filter(([field]) => !dismissedFields.includes(field))
        );
    }, [fieldErrors, dismissedFields]);

    /** Local convenience wrapper so field components can patch one key at a time. */
    const updateForm = (patch: Partial<CustomerForm>) => {
        setForm(prev => ({ ...prev, ...patch }));
        // Dedupe: this runs on every keystroke, so appending blindly would grow
        // the array by one entry per character typed.
        setDismissedFields(prev => {
            const added = Object.keys(patch).filter(field => !prev.includes(field));
            return added.length === 0 ? prev : [...prev, ...added];
        });
    };

    return (
        <>
            <div className="dialog-col customer-tab-section customer-profile-panel">
                <h4>Contact & Profile</h4>
                <AdminForm className="dialog-form-grid customer-form-grid">
                    <AdminField label="First Name" tooltip="Student's legal or preferred first name." required htmlFor="customer-firstName" error={visibleFieldErrors.firstName}>
                        <input
                            id="customer-firstName"
                            value={form.firstName}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ firstName: e.target.value })}
                            aria-describedby={visibleFieldErrors.firstName ? adminFieldErrorId("customer-firstName") : undefined}
                            aria-invalid={visibleFieldErrors.firstName ? true : undefined}
                        />
                    </AdminField>
                    <AdminField label="Last Name" tooltip="Student's family name." required htmlFor="customer-lastName" error={visibleFieldErrors.lastName}>
                        <input
                            id="customer-lastName"
                            value={form.lastName}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ lastName: e.target.value })}
                            aria-describedby={visibleFieldErrors.lastName ? adminFieldErrorId("customer-lastName") : undefined}
                            aria-invalid={visibleFieldErrors.lastName ? true : undefined}
                        />
                    </AdminField>
                    <AdminField label="Email" tooltip="Primary email address for communication and portal login." required fullWidth htmlFor="customer-email" error={visibleFieldErrors.email}>
                        <input
                            id="customer-email"
                            type="email"
                            value={form.email}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ email: e.target.value })}
                            aria-describedby={visibleFieldErrors.email ? adminFieldErrorId("customer-email") : undefined}
                            aria-invalid={visibleFieldErrors.email ? true : undefined}
                        />
                    </AdminField>
                    <AdminField label="Phone" tooltip="Contact phone number (10 digits)." required htmlFor="customer-phone" error={visibleFieldErrors.phone}>
                        <input
                            id="customer-phone"
                            value={form.phone}
                            readOnly={!isEditing}
                            maxLength={10}
                            onChange={e => updateForm({ phone: toDigits(e.target.value, 10) })}
                            aria-describedby={visibleFieldErrors.phone ? adminFieldErrorId("customer-phone") : undefined}
                            aria-invalid={visibleFieldErrors.phone ? true : undefined}
                        />
                    </AdminField>
                    <AdminField label="Skill Level" tooltip="The student's current proficiency level." htmlFor="customer-skillLevel" error={visibleFieldErrors.skillLevel}>
                        {isEditing ? (
                            <select
                                id="customer-skillLevel"
                                value={form.skillLevel}
                                onChange={e => updateForm({ skillLevel: e.target.value as CustomerForm["skillLevel"] })}
                                aria-describedby={visibleFieldErrors.skillLevel ? adminFieldErrorId("customer-skillLevel") : undefined}
                                aria-invalid={visibleFieldErrors.skillLevel ? true : undefined}
                            >
                                <option value="beginner">Beginner</option>
                                <option value="intermediate">Intermediate</option>
                                <option value="advanced">Advanced</option>
                            </select>
                        ) : (
                            <input id="customer-skillLevel" value={form.skillLevel} className="admin-input-capitalize" readOnly />
                        )}
                    </AdminField>
                    <AdminField label="Lesson Mode" tooltip="Physical location or virtual format preferred by the student." htmlFor="customer-lessonMode" error={visibleFieldErrors.lessonMode}>
                        {isEditing ? (
                            <select
                                id="customer-lessonMode"
                                value={form.lessonMode}
                                onChange={e => updateForm({ lessonMode: e.target.value as CustomerForm["lessonMode"] })}
                                aria-describedby={visibleFieldErrors.lessonMode ? adminFieldErrorId("customer-lessonMode") : undefined}
                                aria-invalid={visibleFieldErrors.lessonMode ? true : undefined}
                            >
                                <option value="in_person">In Person</option>
                                <option value="video">Video</option>
                            </select>
                        ) : (
                            <input id="customer-lessonMode" value={form.lessonMode === "in_person" ? "In-person" : "Video"} readOnly />
                        )}
                    </AdminField>
                    <AdminField label="Assigned Teacher" tooltip="Default teacher assignment for this student." htmlFor="customer-primaryTeacherId" error={visibleFieldErrors.primaryTeacherId}>
                        {isEditing && canEditAssignment ? (
                            <select
                                id="customer-primaryTeacherId"
                                value={form.primaryTeacherId}
                                onChange={e => updateForm({ primaryTeacherId: e.target.value })}
                                aria-describedby={visibleFieldErrors.primaryTeacherId ? adminFieldErrorId("customer-primaryTeacherId") : undefined}
                                aria-invalid={visibleFieldErrors.primaryTeacherId ? true : undefined}
                            >
                                <option value="">Unassigned</option>
                                {teacherOptions.map((teacher) => (
                                    <option key={teacher.id} value={teacher.id}>
                                        {teacher.displayName}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input id="customer-primaryTeacherId" value={customer?.primaryTeacher?.displayName || "Unassigned"} readOnly />
                        )}
                    </AdminField>
                </AdminForm>

                <h4 className="customer-profile-subhead">Address</h4>
                <div className="admin-address-search-row">
                    <AddressAutocomplete
                        // NOTE: Autocomplete can return free-form state strings,
                        // so we normalize them into the app's AU state union.
                        onAddressSelect={(addr) => updateForm({ ...addr, state: toAuState(addr.state) })}
                        disabled={!isEditing || savingCustomer}
                    />
                </div>
                <AdminForm className="dialog-form-grid customer-form-grid">
                    <AdminField label="Unit / Apartment" tooltip="Unit or apartment number (optional)." htmlFor="customer-unitNumber" error={visibleFieldErrors.unitNumber}>
                        <input
                            id="customer-unitNumber"
                            value={form.unitNumber}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ unitNumber: e.target.value })}
                            aria-describedby={visibleFieldErrors.unitNumber ? adminFieldErrorId("customer-unitNumber") : undefined}
                            aria-invalid={visibleFieldErrors.unitNumber ? true : undefined}
                        />
                    </AdminField>
                    <AdminField label="House Number" tooltip="Street or house number." required htmlFor="customer-houseNumber" error={visibleFieldErrors.houseNumber}>
                        <input
                            id="customer-houseNumber"
                            value={form.houseNumber}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ houseNumber: e.target.value })}
                            aria-describedby={visibleFieldErrors.houseNumber ? adminFieldErrorId("customer-houseNumber") : undefined}
                            aria-invalid={visibleFieldErrors.houseNumber ? true : undefined}
                        />
                    </AdminField>
                    <AdminField label="Street Name" tooltip="Name of the street." required htmlFor="customer-streetName" error={visibleFieldErrors.streetName}>
                        <input
                            id="customer-streetName"
                            value={form.streetName}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ streetName: e.target.value })}
                            aria-describedby={visibleFieldErrors.streetName ? adminFieldErrorId("customer-streetName") : undefined}
                            aria-invalid={visibleFieldErrors.streetName ? true : undefined}
                        />
                    </AdminField>
                    <AdminField label="Street Type" tooltip="Type of street (e.g., Road, Avenue)." required htmlFor="customer-streetType" error={visibleFieldErrors.streetType}>
                        {isEditing ? (
                            <select
                                id="customer-streetType"
                                value={form.streetType}
                                onChange={e => updateForm({ streetType: e.target.value })}
                                aria-describedby={visibleFieldErrors.streetType ? adminFieldErrorId("customer-streetType") : undefined}
                                aria-invalid={visibleFieldErrors.streetType ? true : undefined}
                            >
                                {STREET_TYPES.map((streetType) => (
                                    <option key={streetType} value={streetType}>{streetType}</option>
                                ))}
                            </select>
                        ) : (
                            <input id="customer-streetType" value={form.streetType} readOnly />
                        )}
                    </AdminField>
                    <AdminField label="Suburb" tooltip="City or suburb name." required htmlFor="customer-suburb" error={visibleFieldErrors.suburb}>
                        <input
                            id="customer-suburb"
                            value={form.suburb}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ suburb: e.target.value })}
                            aria-describedby={visibleFieldErrors.suburb ? adminFieldErrorId("customer-suburb") : undefined}
                            aria-invalid={visibleFieldErrors.suburb ? true : undefined}
                        />
                    </AdminField>
                    <AdminField label="State" tooltip="Australian state or territory." required htmlFor="customer-state" error={visibleFieldErrors.state}>
                        {isEditing ? (
                            <select
                                id="customer-state"
                                value={form.state}
                                onChange={e => updateForm({ state: e.target.value as AuState })}
                                aria-describedby={visibleFieldErrors.state ? adminFieldErrorId("customer-state") : undefined}
                                aria-invalid={visibleFieldErrors.state ? true : undefined}
                            >
                                {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        ) : (
                            <input id="customer-state" value={form.state} readOnly />
                        )}
                    </AdminField>
                    <AdminField label="Postcode" tooltip="4-digit postal code." required className="customer-postcode-field" htmlFor="customer-postcode" error={visibleFieldErrors.postcode}>
                        <input
                            id="customer-postcode"
                            value={form.postcode}
                            readOnly={!isEditing}
                            maxLength={4}
                            inputMode="numeric"
                            onChange={e => updateForm({ postcode: toDigits(e.target.value, 4) })}
                            aria-describedby={visibleFieldErrors.postcode ? adminFieldErrorId("customer-postcode") : undefined}
                            aria-invalid={visibleFieldErrors.postcode ? true : undefined}
                        />
                    </AdminField>
                </AdminForm>
            </div>

            <div className="dialog-col is-notes customer-tab-section customer-profile-panel">
                <h4>Portal Credentials</h4>
                <AdminCard ghost className="customer-portal-card">
                    <p className="helper-text">Manage access to the student portal. Passwords are encrypted and can be revealed or rotated by admins.</p>

                    <div className="customer-portal-metadata">
                        <div className="customer-portal-meta-row">
                            <span className="customer-portal-meta-label">Generated:</span>
                            <span className="customer-portal-meta-value">{customer?.portalCredential ? formatDateTime(customer.portalCredential.generatedAt) : "Never"}</span>
                        </div>
                        {customer?.portalCredential?.rotatedAt && (
                            <div className="customer-portal-meta-row">
                                <span className="customer-portal-meta-label">Last Rotated:</span>
                                <span className="customer-portal-meta-value">{formatDateTime(customer.portalCredential.rotatedAt)}</span>
                            </div>
                        )}

                        {customer && revealedPortalPasswords[customer.id] && (
                            <AdminNotice tone="success" className="customer-portal-password-notice">
                                <div className="customer-portal-password-row">
                                    <div>
                                        <small className="customer-portal-password-label">Current Password</small>
                                        <code className="customer-portal-password-value">{revealedPortalPasswords[customer.id]}</code>
                                    </div>
                                    <button 
                                        type="button"
                                        className="btn btn-secondary btn-xs"
                                        onClick={() =>
                                            // RATIONALE: Revealed credentials are
                                            // short-lived in the UI, so clipboard
                                            // copy reduces transcription mistakes.
                                            void onCopyPortalPassword(revealedPortalPasswords[customer.id])
                                        }
                                        disabled={!canManagePortalCredentials}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </AdminNotice>
                        )}

                        <div className="button-row customer-portal-actions">
                            <Tooltip content="Show current portal password.">
                                <button
                                    className="btn btn-secondary"
                                    type="button"
                                    // NOTE: Credential actions are disabled while
                                    // editing so the dialog cannot mix profile
                                    // saves with security-sensitive mutations.
                                    disabled={!canManagePortalCredentials || !customer || !customer.portalCredential || portalCredentialBusyCustomerId === customer.id || isEditing}
                                    onClick={() => customer && onRevealPortalPassword()}
                                >
                                    {customer && portalCredentialBusyCustomerId === customer.id ? "..." : "Reveal Password"}
                                </button>
                            </Tooltip>
                            <Tooltip content="Generate and issue a new password.">
                                <button
                                    className="btn btn-secondary"
                                    type="button"
                                    disabled={!canManagePortalCredentials || !customer || portalCredentialBusyCustomerId === customer.id || isEditing}
                                    // RATIONALE: Password generation is available
                                    // even when a credential does not yet exist,
                                    // which lets admins bootstrap portal access
                                    // from the same profile surface.
                                    onClick={() => customer && onRegeneratePortalPassword()}
                                >
                                    {customer && portalCredentialBusyCustomerId === customer.id 
                                        ? "..." 
                                        : (customer?.portalCredential ? "Regenerate" : "Generate Password")}
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                </AdminCard>

                <h4 className="customer-profile-actions-title">Actions</h4>
                <div className="dialog-actions customer-profile-actions">
                    {isEditing ? (
                        <>
                            <Tooltip content="Save changes to customer profile.">
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    disabled={savingCustomer}
                                    onClick={onSave}
                                >
                                    {savingCustomer ? "Saving..." : "Save Changes"}
                                </button>
                            </Tooltip>
                            <Tooltip content="Discard unsaved edits.">
                                <button
                                    className="btn btn-secondary"
                                    type="button"
                                    disabled={savingCustomer}
                                    onClick={onCancelEdit}
                                >
                                    Cancel Edit
                                </button>
                            </Tooltip>
                        </>
                    ) : (
                        <>
                            <Tooltip content="View all past invoices and transactions.">
                                <button
                                    className="btn btn-primary"
                                    type="button"
                                    disabled={!canViewBillingHistory}
                                    onClick={onViewBillingHistory}
                                >
                                    View Billing History
                                </button>
                            </Tooltip>
                            <Tooltip content="Grant or view prepaid lesson credits for this customer.">
                                <button
                                    className="btn btn-secondary"
                                    type="button"
                                    disabled={!canViewBillingHistory}
                                    onClick={onManageLessonCredits}
                                >
                                    Lesson Credits
                                </button>
                            </Tooltip>
                            <Tooltip content="Modify this customer's details.">
                                <button className="btn btn-secondary" type="button" disabled={!canEditProfile} onClick={onStartEdit}>
                                    Edit Profile
                                </button>
                            </Tooltip>
                        </>
                    )}

                    {customer && (
                        <Tooltip content="Permanently delete this customer record.">
                            <button
                                className="btn btn-danger"
                                type="button"
                                disabled={!canDeleteCustomer || deletingCustomerId === customer.id || savingCustomer || isEditing}
                                onClick={onDelete}
                            >
                                {deletingCustomerId === customer.id ? "Deleting..." : "Delete Customer"}
                            </button>
                        </Tooltip>
                    )}
                </div>
            </div>
        </>
    );
}
