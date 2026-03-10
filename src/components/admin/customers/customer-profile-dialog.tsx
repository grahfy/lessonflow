import type { AuState } from "@/lib/admin/types";
import { AU_STATES } from "@/lib/admin/types";
import { formatDateTime, toAuState, toDigits } from "@/lib/admin/utils";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AddressAutocomplete } from "@/components/admin/ui/address-autocomplete";

// Types derived from admin-customers-client.tsx
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
};

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
        postcode: ""
    };
}

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
        postcode: customer.postcode ?? ""
    };
}

type Props = {
    customer: CustomerRow | null;
    isEditing: boolean;
    form: CustomerForm;
    setForm: React.Dispatch<React.SetStateAction<CustomerForm>>;
    savingCustomer: boolean;
    deletingCustomerId: string | null;
    revealedPortalPasswords: Record<string, string>;
    portalCredentialBusyCustomerId: string | null;
    onSave: () => void;
    onCancelEdit: () => void;
    onStartEdit: () => void;
    onDelete: () => void;
    onViewBillingHistory: () => void;
    onRevealPortalPassword: () => void;
    onRegeneratePortalPassword: () => void;
};

export function CustomerProfileDialog({
    customer,
    isEditing,
    form,
    setForm,
    savingCustomer,
    deletingCustomerId,
    revealedPortalPasswords,
    portalCredentialBusyCustomerId,
    onSave,
    onCancelEdit,
    onStartEdit,
    onDelete,
    onViewBillingHistory,
    onRevealPortalPassword,
    onRegeneratePortalPassword
}: Props) {
    const updateForm = (patch: Partial<CustomerForm>) => setForm(prev => ({ ...prev, ...patch }));

    return (
        <>
            <div className="dialog-col customer-tab-section customer-profile-panel">
                <h4>Contact & Profile</h4>
                <AdminForm className="dialog-form-grid">
                    <AdminField label="First Name" required>
                        <input
                            value={form.firstName}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ firstName: e.target.value })}
                        />
                    </AdminField>
                    <AdminField label="Last Name" required>
                        <input
                            value={form.lastName}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ lastName: e.target.value })}
                        />
                    </AdminField>
                    <AdminField label="Email" required fullWidth>
                        <input
                            type="email"
                            value={form.email}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ email: e.target.value })}
                        />
                    </AdminField>
                    <AdminField label="Phone" required>
                        <input
                            value={form.phone}
                            readOnly={!isEditing}
                            maxLength={10}
                            onChange={e => updateForm({ phone: toDigits(e.target.value, 10) })}
                        />
                    </AdminField>
                    <AdminField label="Skill Level">
                        {isEditing ? (
                            <select
                                value={form.skillLevel}
                                onChange={e => updateForm({ skillLevel: e.target.value as CustomerForm["skillLevel"] })}
                            >
                                <option value="beginner">Beginner</option>
                                <option value="intermediate">Intermediate</option>
                                <option value="advanced">Advanced</option>
                            </select>
                        ) : (
                            <input value={form.skillLevel} style={{ textTransform: 'capitalize' }} readOnly />
                        )}
                    </AdminField>
                    <AdminField label="Lesson Mode">
                        {isEditing ? (
                            <select
                                value={form.lessonMode}
                                onChange={e => updateForm({ lessonMode: e.target.value as CustomerForm["lessonMode"] })}
                            >
                                <option value="in_person">In Person</option>
                                <option value="video">Video</option>
                            </select>
                        ) : (
                            <input value={form.lessonMode === "in_person" ? "In-person" : "Video"} readOnly />
                        )}
                    </AdminField>
                </AdminForm>

                <h4 className="customer-profile-subhead">Address</h4>
                {isEditing && (
                    <div style={{ paddingBottom: '16px' }}>
                        <AddressAutocomplete 
                            onAddressSelect={(addr) => updateForm({ ...addr, state: toAuState(addr.state) })} 
                            disabled={savingCustomer} 
                        />
                    </div>
                )}
                <AdminForm className="dialog-form-grid">
                    <AdminField label="Unit / Apartment">
                        <input
                            value={form.unitNumber}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ unitNumber: e.target.value })}
                        />
                    </AdminField>
                    <AdminField label="House Number" required>
                        <input
                            value={form.houseNumber}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ houseNumber: e.target.value })}
                        />
                    </AdminField>
                    <AdminField label="Street Name" required>
                        <input
                            value={form.streetName}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ streetName: e.target.value })}
                        />
                    </AdminField>
                    <AdminField label="Street Type" required>
                        {isEditing ? (
                            <select
                                value={form.streetType}
                                onChange={e => updateForm({ streetType: e.target.value })}
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
                        ) : (
                            <input value={form.streetType} readOnly />
                        )}
                    </AdminField>
                    <AdminField label="Suburb" required>
                        <input
                            value={form.suburb}
                            readOnly={!isEditing}
                            onChange={e => updateForm({ suburb: e.target.value })}
                        />
                    </AdminField>
                    <AdminField label="State" required>
                        {isEditing ? (
                            <select
                                value={form.state}
                                onChange={e => updateForm({ state: e.target.value as AuState })}
                            >
                                {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        ) : (
                            <input value={form.state} readOnly />
                        )}
                    </AdminField>
                    <AdminField label="Postcode" required>
                        <input
                            value={form.postcode}
                            readOnly={!isEditing}
                            maxLength={4}
                            onChange={e => updateForm({ postcode: toDigits(e.target.value, 4) })}
                        />
                    </AdminField>
                </AdminForm>
            </div>

            <div className="dialog-col is-notes customer-tab-section customer-profile-panel">
                <h4>Portal Credentials</h4>
                <AdminCard ghost style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', border: '1px solid var(--line)' }}>
                    <p className="helper-text">Manage access to the student portal. Passwords are encrypted and can be revealed or rotated by admins.</p>

                    <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--ink-2)' }}>Generated:</span>
                            <span style={{ fontWeight: 600 }}>{customer?.portalCredential ? formatDateTime(customer.portalCredential.generatedAt) : "Never"}</span>
                        </div>
                        {customer?.portalCredential?.rotatedAt && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--ink-2)' }}>Last Rotated:</span>
                                <span style={{ fontWeight: 600 }}>{formatDateTime(customer.portalCredential.rotatedAt)}</span>
                            </div>
                        )}

                        {customer && revealedPortalPasswords[customer.id] && (
                            <div className="notice success" style={{ margin: '8px 0', padding: '12px', background: 'rgba(69, 204, 138, 0.1)', border: '1px solid rgba(69, 204, 138, 0.3)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <small style={{ display: 'block', marginBottom: '4px', textTransform: 'uppercase', opacity: 0.8, color: 'var(--ink-0)' }}>Current Password</small>
                                        <code style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.5px', color: '#fff' }}>{revealedPortalPasswords[customer.id]}</code>
                                    </div>
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                        onClick={() => {
                                            void navigator.clipboard.writeText(revealedPortalPasswords[customer.id]);
                                            alert("Password copied to clipboard");
                                        }}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="button-row" style={{ marginTop: '8px' }}>
                            <button
                                className="btn btn-secondary"
                                type="button"
                                disabled={!customer || !customer.portalCredential || portalCredentialBusyCustomerId === customer.id || isEditing}
                                onClick={() => customer && onRevealPortalPassword()}
                            >
                                {customer && portalCredentialBusyCustomerId === customer.id ? "..." : "Reveal Password"}
                            </button>
                            <button
                                className="btn btn-secondary"
                                type="button"
                                disabled={!customer || portalCredentialBusyCustomerId === customer.id || isEditing}
                                onClick={() => customer && onRegeneratePortalPassword()}
                            >
                                {customer && portalCredentialBusyCustomerId === customer.id 
                                    ? "..." 
                                    : (customer?.portalCredential ? "Regenerate" : "Generate Password")}
                            </button>
                        </div>
                    </div>
                </AdminCard>

                <h4 style={{ marginTop: '30px' }}>Actions</h4>
                <div className="dialog-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                    {isEditing ? (
                        <>
                            <button
                                className="btn btn-primary"
                                type="button"
                                disabled={savingCustomer}
                                onClick={onSave}
                            >
                                {savingCustomer ? "Saving..." : "Save Changes"}
                            </button>
                            <button
                                className="btn btn-secondary"
                                type="button"
                                disabled={savingCustomer}
                                onClick={onCancelEdit}
                            >
                                Cancel Edit
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className="btn btn-primary"
                                type="button"
                                onClick={onViewBillingHistory}
                            >
                                View Billing History
                            </button>
                            <button className="btn btn-secondary" type="button" onClick={onStartEdit}>
                                Edit Profile
                            </button>
                        </>
                    )}

                    {customer && (
                        <button
                            className="btn btn-danger"
                            type="button"
                            disabled={deletingCustomerId === customer.id || savingCustomer || isEditing}
                            onClick={onDelete}
                        >
                            {deletingCustomerId === customer.id ? "Deleting..." : "Delete Customer"}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
