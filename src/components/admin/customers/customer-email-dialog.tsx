import { formatDateTime } from "@/lib/admin/utils";

type Props = {
    loadingEmailHistory: boolean;
    emailHistory: ReadonlyArray<{ id: string; subject: string; status: string; error?: string; createdAt: string }>;
    emailComposerSubject: string;
    setEmailComposerSubject: React.Dispatch<React.SetStateAction<string>>;
    emailComposerMessage: string;
    setEmailComposerMessage: React.Dispatch<React.SetStateAction<string>>;
    sendingEmail: boolean;
    onSendEmail: () => void;
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
                            onClick={onSendEmail}
                        >
                            {sendingEmail ? "Sending..." : "Send Email"}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
