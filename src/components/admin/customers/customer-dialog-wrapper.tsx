import { RefObject, useRef, useEffect, useLayoutEffect } from "react";
import gsap from "gsap";
import { AppDialog } from "@/components/ui/app-dialog";
import { AdminNoticeStack } from "@/components/admin/ui/admin-notice";
import { AdminTabBar } from "@/components/admin/ui/admin-tab-bar";
import { CustomerProfileDialog, type CustomerForm, type CustomerRow } from "./customer-profile-dialog";
import { CustomerEmailDialog } from "./customer-email-dialog";
import { CustomerBookingHistoryDialog } from "./customer-booking-history-dialog";
import { CustomerMaterialsDialog } from "./customer-materials-dialog";
import { type MaterialsFolderActions, type MaterialsFolderField } from "@/components/admin/ui/admin-materials-panel";
import { type EmailRecord, type SendEmailResult } from "@/lib/admin/use-email-history";
import { type CustomerBookingHistoryRow, type LearningMaterialBooking, type LearningMaterialRow } from "@/lib/admin/types";

type Tab = "profile" | "history" | "emails" | "materials";

type Props = {
    dialogRootRef: RefObject<HTMLDivElement | null>;
    selectedCustomer: CustomerRow | null;
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
    error: string;
    notice: string;
    onClose: () => void;
    canAccessCustomerActions: boolean;

    // Profile Props
    isEditing: boolean;
    customerForm: CustomerForm;
    setCustomerForm: React.Dispatch<React.SetStateAction<CustomerForm>>;
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
    onSaveCustomer: () => void;
    onCancelEdit: () => void;
    onStartEdit: () => void;
    onDeleteCustomer: () => void;
    onViewBillingHistory: () => void;
    onRevealPortalPassword: () => void;
    onRegeneratePortalPassword: () => void;
    onCopyPortalPassword: (password: string) => void | Promise<void>;

    // Email Props
    bookingsLoading: boolean;
    bookings: CustomerBookingHistoryRow[];
    onOpenBooking: (booking: CustomerBookingHistoryRow) => void;

    // Email Props
    loadingEmailHistory: boolean;
    emailHistory: ReadonlyArray<EmailRecord>;
    emailHistoryWarning?: string | null;
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
    materialsFolderField?: MaterialsFolderField;
    materialsFolderActions?: MaterialsFolderActions;
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
    const tabContentRef = useRef<HTMLDivElement>(null);

    const useSafeLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

    useSafeLayoutEffect(() => {
        if (tabContentRef.current) {
            gsap.killTweensOf(tabContentRef.current);
            gsap.fromTo(
                tabContentRef.current,
                { opacity: 0, y: 8 },
                { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }
            );
        }
    }, [activeTab]);

    // RATIONALE: Keep customer identity in the modal header while the shared
    // tab rail sits in the dialog body, matching the booking editor pattern.
    const description = (
        <div className="customer-dialog-description">
            {selectedCustomer ? (
                <>Profile: <strong>{selectedCustomer.fullName}</strong> · ID: <code>{selectedCustomer.id}</code></>
            ) : (
                <>New Customer Profile</>
            )}
        </div>
    );

    return (
        <AppDialog
            isOpen={true} // Presence handled by wrapper
            onClose={onClose}
            title="Customer Details"
            rootRef={dialogRootRef}
            size="lg"
            description={description}
            id="customer-dialog"
            bodyClassName="customer-dialog-body-lock"
            lockBodyScrollArea
        >
            <AdminTabBar
                activeTab={activeTab}
                onChange={setActiveTab}
                className="dialog-tabs dialog-tabs-booking"
                listClassName="dialog-tabs-left"
                items={[
                    { key: "profile", label: "Profile & Address" },
                    { key: "history", label: "Lesson History", disabled: !selectedCustomer || !rest.canAccessCustomerActions },
                    { key: "emails", label: "Communication", disabled: !selectedCustomer || !rest.canAccessCustomerActions },
                    { key: "materials", label: "Learning Materials", disabled: !selectedCustomer || !rest.canAccessCustomerActions }
                ]}
            />
            <AdminNoticeStack
                error={error}
                notice={notice}
                className="customer-dialog-notice-stack"
            />
            <div className="customer-dialog-tab-body" ref={tabContentRef}>
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
                            canEditProfile={rest.canEditProfile}
                            canEditAssignment={rest.canEditAssignment}
                            teacherOptions={rest.teacherOptions}
                            canManagePortalCredentials={rest.canManagePortalCredentials}
                            canViewBillingHistory={rest.canViewBillingHistory}
                            canDeleteCustomer={rest.canDeleteCustomer}
                            revealedPortalPasswords={rest.revealedPortalPasswords}
                            portalCredentialBusyCustomerId={rest.portalCredentialBusyCustomerId}
                            onSave={rest.onSaveCustomer}
                            onCancelEdit={rest.onCancelEdit}
                            onStartEdit={rest.onStartEdit}
                            onDelete={rest.onDeleteCustomer}
                            onViewBillingHistory={rest.onViewBillingHistory}
                            onRevealPortalPassword={rest.onRevealPortalPassword}
                            onRegeneratePortalPassword={rest.onRegeneratePortalPassword}
                            onCopyPortalPassword={rest.onCopyPortalPassword}
                        />
                    </div>
                )}

                {activeTab === "history" && (
                    <CustomerBookingHistoryDialog
                        bookingsLoading={rest.bookingsLoading}
                        bookings={rest.bookings}
                        onOpenBooking={rest.onOpenBooking}
                    />
                )}

                {activeTab === 'emails' && (
                    <div className="customer-email-tab-shell">
                        <CustomerEmailDialog
                            loadingEmailHistory={rest.loadingEmailHistory}
                            emailHistory={rest.emailHistory}
                            emailHistoryWarning={rest.emailHistoryWarning}
                            emailComposerSubject={rest.emailComposerSubject}
                            setEmailComposerSubject={rest.setEmailComposerSubject}
                            emailComposerMessage={rest.emailComposerMessage}
                            setEmailComposerMessage={rest.setEmailComposerMessage}
                            sendingEmail={rest.sendingEmail}
                            syncingEmail={rest.syncingEmail}
                            onSendEmail={rest.onSendEmail}
                            onSyncEmail={rest.onSyncEmail}
                        />
                    </div>
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
                        folderField={rest.materialsFolderField}
                        folderActions={rest.materialsFolderActions}
                    />
                )}
            </div>
        </AppDialog>
    );
}
