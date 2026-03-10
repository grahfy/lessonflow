import { useState } from "react";
import { formatDateTime } from "@/lib/admin/utils";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { EmailViewerDialog } from "@/components/admin/ui/email-viewer-dialog";
import { type EmailRecord } from "@/lib/admin/use-email-history";

type Props = {
    loadingEmailHistory: boolean;
    emailHistory: ReadonlyArray<EmailRecord>;
    emailComposerSubject: string;
    setEmailComposerSubject: (val: string) => void;
    emailComposerMessage: string;
    setEmailComposerMessage: (val: string) => void;
    sendingEmail: boolean;
    syncingEmail?: boolean;
    onSendEmail: (subject: string, message: string) => void;
    onSyncEmail?: () => void;
};

export function CustomerEmailDialog({
    loadingEmailHistory,
    emailHistory,
    emailComposerSubject,
    setEmailComposerSubject,
    emailComposerMessage,
    setEmailComposerMessage,
    sendingEmail,
    syncingEmail,
    onSendEmail,
    onSyncEmail
}: Props) {
    const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);

    return (
        <div className="dialog-tab-stack customer-tab-panel">
            <div className="dialog-col dialog-tab-section">
                <div className="section-header-with-action">
                    <h3 className="manual-section-title">Email History</h3>
                    {onSyncEmail && (
                        <button 
                            type="button" 
                            className="btn btn-secondary btn-small"
                            onClick={onSyncEmail}
                            disabled={syncingEmail || loadingEmailHistory}
                        >
                            {syncingEmail ? "Syncing..." : "Sync Now"}
                        </button>
                    )}
                </div>
                <AdminCard ghost className="customer-email-history-card">
                    {loadingEmailHistory ? (
                        <p className="helper-text">Loading history...</p>
                    ) : emailHistory.length > 0 ? (
                        <div className="customer-email-history-list">
                            {emailHistory.map((email) => (
                                <div key={email.id} className="customer-email-history-item" onClick={() => setSelectedEmail(email)} style={{ cursor: "pointer" }}>
                                    <div className="customer-email-history-head">
                                        <strong>{email.subject}</strong>
                                        <span>{formatDateTime(email.createdAt)}</span>
                                    </div>
                                    <div className="customer-email-history-meta">
                                        <span className={`status-badge status-${email.status.toLowerCase()}`}>
                                            {email.status}
                                        </span>
                                        {email.provider && (
                                            <span className="email-provider-tag">
                                                · {email.provider.toUpperCase()}
                                            </span>
                                        )}
                                        {email.source && (
                                            <span className="email-source-tag">
                                                · {email.source === 'app' ? 'via App' : 'via Gmail'}
                                            </span>
                                        )}
                                        {email.error && <span className="customer-email-history-error">· {email.error}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="helper-text">No email history found for this address.</p>
                    )}
                </AdminCard>
            </div>

            <div className="dialog-col dialog-tab-section">
                <h3 className="manual-section-title">Send Email</h3>
                <AdminCard ghost className="customer-email-composer-card">
                    <AdminForm className="customer-email-composer-form">
                        <AdminField label="Subject" required fullWidth>
                            <input
                                placeholder="Email subject..."
                                value={emailComposerSubject}
                                onChange={e => setEmailComposerSubject(e.target.value)}
                            />
                        </AdminField>
                        <AdminField label="Message" required fullWidth>
                            <textarea
                                placeholder="Type your message here..."
                                className="customer-email-message-input"
                                value={emailComposerMessage}
                                onChange={e => setEmailComposerMessage(e.target.value)}
                            />
                        </AdminField>
                        <div className="button-row button-row-justify customer-email-actions">
                            <button
                                className="btn btn-secondary"
                                type="button"
                                disabled={sendingEmail || (!emailComposerSubject.trim() && !emailComposerMessage.trim())}
                                onClick={() => {
                                    setEmailComposerSubject("");
                                    setEmailComposerMessage("");
                                }}
                            >
                                Clear Draft
                            </button>
                            <button
                                className="btn btn-primary"
                                type="button"
                                disabled={sendingEmail || !emailComposerSubject.trim() || !emailComposerMessage.trim()}
                                onClick={() => onSendEmail(emailComposerSubject, emailComposerMessage)}
                            >
                                {sendingEmail ? "Sending..." : "Send Email"}
                            </button>
                        </div>
                    </AdminForm>
                </AdminCard>
            </div>

            <EmailViewerDialog
                isOpen={!!selectedEmail}
                onClose={() => setSelectedEmail(null)}
                email={selectedEmail}
            />
        </div>
    );
}
