import { RefObject } from "react";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
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
    onSendEmail: (subject: string, message: string) => void;

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
    onDeleteMaterial: (id: string) => void;
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
    const description = (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
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
    );

    return (
        <AdminDialog
            isOpen={true} // Presence handled by wrapper
            onClose={onClose}
            title="Customer Details"
            rootRef={dialogRootRef}
            wide
            description={description}
            id="customer-dialog"
        >
            {error ? <p className="notice error" style={{ marginTop: '12px' }}>{error}</p> : null}
            {notice ? <p className="notice success" style={{ marginTop: '12px' }}>{notice}</p> : null}

            {activeTab === 'profile' && (
                <div className="dialog-layout" style={{ marginTop: "12px" }}>
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
                </div>
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
        </AdminDialog>
    );
}
