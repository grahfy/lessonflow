import { getEmailSourceLabel } from "@/lib/admin/email-history";
import { formatDateTime } from "@/lib/admin/utils";
import { type EmailRecord, type SendEmailResult } from "@/lib/admin/use-email-history";
import { AdminEmailPanel } from "@/components/admin/ui/admin-email-panel";

type Props = {
  loadingEmailHistory: boolean;
  emailHistory: ReadonlyArray<EmailRecord>;
  emailHistoryWarning?: string | null;
  emailComposerSubject: string;
  setEmailComposerSubject: (val: string) => void;
  emailComposerMessage: string;
  setEmailComposerMessage: (val: string) => void;
  sendingEmail: boolean;
  syncingEmail?: boolean;
  onSendEmail: (
    subject: string,
    message: string,
    captcha?: { captchaToken: string; captchaAnswer: string }
  ) => Promise<SendEmailResult>;
  onSyncEmail?: () => void;
};

export function CustomerEmailDialog({
  loadingEmailHistory,
  emailHistory,
  emailHistoryWarning,
  emailComposerSubject,
  setEmailComposerSubject,
  emailComposerMessage,
  setEmailComposerMessage,
  sendingEmail,
  syncingEmail,
  onSendEmail,
  onSyncEmail
}: Props) {
  return (
    <AdminEmailPanel
      emptyLabel="No email history found for this address."
      history={emailHistory}
      historyWarning={emailHistoryWarning}
      loadingHistory={loadingEmailHistory}
      subject={emailComposerSubject}
      setSubject={setEmailComposerSubject}
      message={emailComposerMessage}
      setMessage={setEmailComposerMessage}
      sending={sendingEmail}
      syncing={syncingEmail}
      onSend={onSendEmail}
      onSync={onSyncEmail}
      panelClassName="customer-email-panel"
      historyClassName="customer-email-history-card"
      historyListClassName="customer-email-history-list"
      historyItemClassName="customer-email-history-item"
      composerCardClassName="customer-email-composer-card"
      composerFormClassName="form-grid customer-email-composer-form"
      messageClassName="customer-email-message-input"
      captchaIdPrefix="customer-email"
      renderHistoryHeader={(email) => (
        <div className="customer-email-history-head">
          <strong>{email.subject}</strong>
          <span>{formatDateTime(email.createdAt)}</span>
        </div>
      )}
      renderHistoryMeta={(email) => (
        <div className="customer-email-history-meta">
          <span className={`status-badge status-${email.status.toLowerCase()}`}>{email.status}</span>
          <span className="email-direction-tag">· {email.direction === "inbound" ? "Inbound" : "Outbound"}</span>
          {email.provider ? <span className="email-provider-tag">· {email.provider.toUpperCase()}</span> : null}
          {getEmailSourceLabel(email.source) ? <span className="email-source-tag">· {getEmailSourceLabel(email.source)}</span> : null}
          {email.error ? <span className="customer-email-history-error">· {email.error}</span> : null}
        </div>
      )}
    />
  );
}
