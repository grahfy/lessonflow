import { RefObject } from "react";
import { CustomerProfileDialog, type CustomerForm, type CustomerRow } from "./customer-profile-dialog";
import { CustomerEmailDialog } from "./customer-email-dialog";
import { CustomerMaterialsDialog } from "./customer-materials-dialog";
import { type LearningMaterialBooking, type LearningMaterialRow } from "@/lib/admin/types";

type Tab = "profile" | "emails" | "materials";

type Props = {
    dialogRootRef: RefObject<HTMLDivElement | null>;
    selectedCustomer: CustomerRow | null;
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
    error: string;
    notice: string;
    onClose: () => void;

    // Profile Props
    isEditing: boolean;
    customerForm: CustomerForm;
    setCustomerForm: React.Dispatch<React.SetStateAction<CustomerForm>>;
    savingCustomer: boolean;
    deletingCustomerId: string | null;
    revealedPortalPasswords: Record<string, string>;
    portalCredentialBusyCustomerId: string | null;
    onSaveCustomer: () => void;
    onCancelEdit: () => void;
    onStartEdit: () => void;
    onDeleteCustomer: () => void;
    onViewBillingHistory: () => void;
    onRevealPortalPassword: () => void;
    onRegeneratePortalPassword: () => void;

    // Email Props
    loadingEmailHistory: boolean;
    emailHistory: ReadonlyArray<{ id: string; subject: string; status: string; error?: string; createdAt: string }>;
    emailComposerSubject: string;
    setEmailComposerSubject: React.Dispatch<React.SetStateAction<string>>;
    emailComposerMessage: string;
    setEmailComposerMessage: React.Dispatch<React.SetStateAction<string>>;
    sendingEmail: boolean;
    onSendEmail: () => void;

    // Materials Props
    materialsLoading: boolean;
    materialsList: LearningMaterialRow[];
    materialsBookings: LearningMaterialBooking[];
    materialsBookingId: string;
    setMaterialsBookingId: (id: string) => void;
    materialsUploading: boolean;
    materialsDeletingId: string | null;
    materialsUploadFormRef: RefObject<HTMLFormElement | null>;
    onUploadMaterial: () => void;
    onDeleteMaterial: (material: LearningMaterialRow) => void;
    onMaterialBookingSelect: (bookingId: string) => void;
};

export function CustomerDialogWrapper({
    dialogRootRef,
    selectedCustomer,
    activeTab,
    setActiveTab,
    error,
    notice,
    onClose,
    ...rest
}: Props) {
    return (
        <div
            className="dialog-backdrop"
            ref={dialogRootRef}
            data-motion-root="admin"
            data-motion-item="customer-dialog-backdrop"
            onClick={onClose}
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
                    <button className="btn btn-secondary" type="button" onClick={onClose}>
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
                            type="button"
                            className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ flex: 1, padding: '4px 12px', fontSize: '0.75rem', border: 'none', boxShadow: 'none', minWidth: '140px' }}
                            onClick={() => setActiveTab('profile')}
                        >
                            Profile & Address
                        </button>
                        <button
                            type="button"
                            className={`btn ${activeTab === 'emails' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ flex: 1, padding: '4px 12px', fontSize: '0.75rem', border: 'none', boxShadow: 'none', minWidth: '140px' }}
                            onClick={() => setActiveTab('emails')}
                            disabled={!selectedCustomer}
                        >
                            Communication
                        </button>
                        <button
                            type="button"
                            className={`btn ${activeTab === 'materials' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ flex: 1, padding: '4px 12px', fontSize: '0.75rem', border: 'none', boxShadow: 'none', minWidth: '140px' }}
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
                    {activeTab === 'profile' && (
                        <CustomerProfileDialog
                            customer={selectedCustomer}
                            isEditing={rest.isEditing}
                            form={rest.customerForm}
                            setForm={rest.setCustomerForm}
                            savingCustomer={rest.savingCustomer}
                            deletingCustomerId={rest.deletingCustomerId}
                            revealedPortalPasswords={rest.revealedPortalPasswords}
                            portalCredentialBusyCustomerId={rest.portalCredentialBusyCustomerId}
                            onSave={rest.onSaveCustomer}
                            onCancelEdit={rest.onCancelEdit}
                            onStartEdit={rest.onStartEdit}
                            onDelete={rest.onDeleteCustomer}
                            onViewBillingHistory={rest.onViewBillingHistory}
                            onRevealPortalPassword={rest.onRevealPortalPassword}
                            onRegeneratePortalPassword={rest.onRegeneratePortalPassword}
                        />
                    )}

                    {activeTab === 'emails' && (
                        <CustomerEmailDialog
                            loadingEmailHistory={rest.loadingEmailHistory}
                            emailHistory={rest.emailHistory}
                            emailComposerSubject={rest.emailComposerSubject}
                            setEmailComposerSubject={rest.setEmailComposerSubject}
                            emailComposerMessage={rest.emailComposerMessage}
                            setEmailComposerMessage={rest.setEmailComposerMessage}
                            sendingEmail={rest.sendingEmail}
                            onSendEmail={rest.onSendEmail}
                        />
                    )}

                    {activeTab === 'materials' && (
                        <CustomerMaterialsDialog
                            materialsLoading={rest.materialsLoading}
                            materialsList={rest.materialsList}
                            materialsBookings={rest.materialsBookings}
                            materialsBookingId={rest.materialsBookingId}
                            setMaterialsBookingId={rest.setMaterialsBookingId}
                            materialsUploading={rest.materialsUploading}
                            materialsDeletingId={rest.materialsDeletingId}
                            materialsUploadFormRef={rest.materialsUploadFormRef}
                            onUpload={rest.onUploadMaterial}
                            onDelete={rest.onDeleteMaterial}
                            onBookingSelect={rest.onMaterialBookingSelect}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
