import { RefObject } from "react";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminNoticeStack } from "@/components/admin/ui/admin-notice";
import { AdminTabBar } from "@/components/admin/ui/admin-tab-bar";
import { CustomerProfileDialog, type CustomerForm, type CustomerRow } from "./customer-profile-dialog";
import { CustomerEmailDialog } from "./customer-email-dialog";
import { CustomerMaterialsDialog } from "./customer-materials-dialog";
import { type EmailRecord, type SendEmailResult } from "@/lib/admin/use-email-history";
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
    emailHistory: ReadonlyArray<EmailRecord>;
    emailComposerSubject: string;
    setEmailComposerSubject: React.Dispatch<React.SetStateAction<string>>;
    emailComposerMessage: string;
    setEmailComposerMessage: React.Dispatch<React.SetStateAction<string>>;
    sendingEmail: boolean;
    syncingEmail: boolean;
    onSendEmail: (subject: string, message: string, captcha?: { captchaToken: string; captchaAnswer: string }) => Promise<SendEmailResult>;
    onSyncEmail: () => void;

    // Materials Props
    materialsLoading: boolean;
    materialsList: LearningMaterialRow[];
    materialsBookings: LearningMaterialBooking[];
    materialsBookingId: string;
    setMaterialsBookingId: (id: string) => void;
    materialsUploading: boolean;
    materialsDeletingId: string | null;
    materialsUploadFormRef: RefObject<HTMLFormElement | null>;
    onUploadMaterial: (captcha?: { captchaToken: string; captchaAnswer: string }) => void;
    onDeleteMaterial: (id: string) => void;
    onMaterialBookingSelect: (bookingId: string) => void;
};

/**
 * Composes the tabbed customer dialog from profile, email, and materials
 * subviews while keeping the outer modal shell consistent.
 */
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
    // RATIONALE: The dialog description doubles as the tab/navigation header so
    // the modal chrome stays compact even when each tab has its own dense UI.
    const description = (
        <div className="customer-dialog-description">
            <div>
                {selectedCustomer ? (
                    <>Profile: <strong>{selectedCustomer.fullName}</strong> · ID: <code>{selectedCustomer.id}</code></>
                ) : (
                    <>New Customer Profile</>
                )}
            </div>

            <AdminTabBar
                activeTab={activeTab}
                onChange={setActiveTab}
                className="customer-dialog-tabs"
                listClassName="customer-dialog-tabs-list"
                items={[
                    { key: "profile", label: "Profile & Address" },
                    { key: "emails", label: "Communication", disabled: !selectedCustomer },
                    { key: "materials", label: "Learning Materials", disabled: !selectedCustomer }
                ]}
            />
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
            <AdminNoticeStack
                error={error}
                notice={notice}
                className="customer-dialog-notice-stack"
            />

            {activeTab === 'profile' && (
                <div className="dialog-layout customer-dialog-panel">
                    {/* NOTE: The profile tab keeps its own two-column layout,
                        unlike email/materials which render their own shells. */}
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
                    syncingEmail={rest.syncingEmail}
                    onSendEmail={rest.onSendEmail}
                    onSyncEmail={rest.onSyncEmail}
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
