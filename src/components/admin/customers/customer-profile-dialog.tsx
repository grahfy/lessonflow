import type { AuState } from "@/lib/admin/types";
import { AU_STATES } from "@/lib/admin/types";
import { formatDateTime, toAuState, toDigits } from "@/lib/admin/utils";

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
    return (
        <>
            <div className="dialog-col" style={{ minHeight: "650px" }}>
                <h4>Contact & Profile</h4>
                <div className="form-grid dialog-form-grid">
                    <div className="field">
                        <label>First Name *</label>
                        <input
                            value={form.firstName}
                            readOnly={!isEditing}
                            onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                        />
                    </div>
                    <div className="field">
                        <label>Last Name *</label>
                        <input
                            value={form.lastName}
                            readOnly={!isEditing}
                            onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                        />
                    </div>
                    <div className="field full">
                        <label>Email *</label>
                        <input
                            type="email"
                            value={form.email}
                            readOnly={!isEditing}
                            onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                        />
                    </div>
                    <div className="field">
                        <label>Phone *</label>
                        <input
                            value={form.phone}
                            readOnly={!isEditing}
                            maxLength={10}
                            onChange={e => setForm(prev => ({ ...prev, phone: toDigits(e.target.value, 10) }))}
                        />
                    </div>
                    <div className="field">
                        <label>Skill Level</label>
                        {isEditing ? (
                            <select
                                value={form.skillLevel}
                                onChange={e => setForm(prev => ({ ...prev, skillLevel: e.target.value as CustomerForm["skillLevel"] }))}
                            >
                                <option value="beginner">Beginner</option>
                                <option value="intermediate">Intermediate</option>
                                <option value="advanced">Advanced</option>
                            </select>
                        ) : (
                            <input value={form.skillLevel} style={{ textTransform: 'capitalize' }} readOnly />
                        )}
                    </div>
                    <div className="field">
                        <label>Lesson Mode</label>
                        {isEditing ? (
                            <select
                                value={form.lessonMode}
                                onChange={e => setForm(prev => ({ ...prev, lessonMode: e.target.value as CustomerForm["lessonMode"] }))}
                            >
                                <option value="in_person">In Person</option>
                                <option value="video">Video</option>
                            </select>
                        ) : (
                            <input value={form.lessonMode === "in_person" ? "In-person" : "Video"} readOnly />
                        )}
                    </div>
                </div>

                <h4 style={{ marginTop: '20px' }}>Address</h4>
                <div className="form-grid dialog-form-grid">
                    <div className="field">
                        <label>Unit / Apartment</label>
                        <input
                            value={form.unitNumber}
                            readOnly={!isEditing}
                            onChange={e => setForm(prev => ({ ...prev, unitNumber: e.target.value }))}
                        />
                    </div>
                    <div className="field">
                        <label>House Number *</label>
                        <input
                            value={form.houseNumber}
                            readOnly={!isEditing}
                            onChange={e => setForm(prev => ({ ...prev, houseNumber: e.target.value }))}
                        />
                    </div>
                    <div className="field full">
                        <label>Street *</label>
                        {isEditing ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    style={{ flex: 2 }}
                                    placeholder="Name"
                                    value={form.streetName}
                                    onChange={e => setForm(prev => ({ ...prev, streetName: e.target.value }))}
                                />
                                <select
                                    style={{ flex: 1 }}
                                    value={form.streetType}
                                    onChange={e => setForm(prev => ({ ...prev, streetType: e.target.value }))}
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
                            <input value={`${form.streetName} ${form.streetType}`} readOnly />
                        )}
                    </div>
                    <div className="field">
                        <label>Suburb *</label>
                        <input
                            value={form.suburb}
                            readOnly={!isEditing}
                            onChange={e => setForm(prev => ({ ...prev, suburb: e.target.value }))}
                        />
                    </div>
                    <div className="field">
                        <label>State & Postcode *</label>
                        {isEditing ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <select
                                    style={{ flex: 2 }}
                                    value={form.state}
                                    onChange={e => setForm(prev => ({ ...prev, state: e.target.value as AuState }))}
                                >
                                    {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <input
                                    style={{ width: '80px', flexShrink: 0 }}
                                    maxLength={4}
                                    placeholder="Postcode"
                                    value={form.postcode}
                                    onChange={e => setForm(prev => ({ ...prev, postcode: toDigits(e.target.value, 4) }))}
                                />
                            </div>
                        ) : (
                            <input value={`${form.state} ${form.postcode}`} readOnly />
                        )}
                    </div>
                </div>
            </div>

            <div className="dialog-col is-notes" style={{ minHeight: "650px" }}>
                <h4>Portal Credentials</h4>
                <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', border: '1px solid var(--line)' }}>
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
                            <div className="notice success" style={{ margin: '8px 0', padding: '10px' }}>
                                <small style={{ display: 'block', marginBottom: '4px', textTransform: 'uppercase', opacity: 0.8 }}>Current Password</small>
                                <code style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.5px' }}>{revealedPortalPasswords[customer.id]}</code>
                            </div>
                        )}

                        <div className="button-row" style={{ marginTop: '8px' }}>
                            <button
                                className="btn btn-secondary"
                                type="button"
                                disabled={!customer || portalCredentialBusyCustomerId === customer.id || isEditing}
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
                                {customer && portalCredentialBusyCustomerId === customer.id ? "..." : "Regenerate"}
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
