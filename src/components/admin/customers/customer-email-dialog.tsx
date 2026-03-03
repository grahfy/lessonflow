import { formatDateTime } from "@/lib/admin/utils";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";

type Props = {
    loadingEmailHistory: boolean;
    emailHistory: ReadonlyArray<{ id: string; subject: string; status: string; error?: string; createdAt: string }>;
    emailComposerSubject: string;
    setEmailComposerSubject: (val: string) => void;
    emailComposerMessage: string;
    setEmailComposerMessage: (val: string) => void;
    sendingEmail: boolean;
    onSendEmail: (subject: string, message: string) => void;
};

export function CustomerEmailDialog({
    loadingEmailHistory,
    emailHistory,
    emailComposerSubject,
    setEmailComposerSubject,
    emailComposerMessage,
    setEmailComposerMessage,
    sendingEmail,
    onSendEmail
}: Props) {
    return (
        <div className="dialog-layout" style={{ minHeight: '550px' }}>
            <div className="dialog-col">
                <h3 className="manual-section-title">Email History</h3>
                <AdminCard ghost style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--line)', padding: '12px' }}>
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
                                        <span className={`status-badge status-${email.status.toLowerCase()}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                                            {email.status}
                                        </span>
                                        {email.error && <span style={{ color: 'var(--brand-danger)', fontSize: '0.75rem' }}>· {email.error}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="helper-text">No email history found for this address.</p>
                    )}
                </AdminCard>
            </div>

            <div className="dialog-col is-notes">
                <h3 className="manual-section-title">Send Email</h3>
                <AdminCard ghost style={{ border: '1px solid var(--line)', padding: '16px' }}>
                    <AdminForm>
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
                                style={{ minHeight: '180px', resize: 'vertical' }}
                                value={emailComposerMessage}
                                onChange={e => setEmailComposerMessage(e.target.value)}
                            />
                        </AdminField>
                        <button
                            className="btn btn-primary"
                            type="button"
                            disabled={sendingEmail || !emailComposerSubject.trim() || !emailComposerMessage.trim()}
                            onClick={() => onSendEmail(emailComposerSubject, emailComposerMessage)}
                            style={{ width: '100%', marginTop: '8px' }}
                        >
                            {sendingEmail ? "Sending..." : "Send Email"}
                        </button>
                    </AdminForm>
                </AdminCard>
            </div>
        </div>
    );
}
