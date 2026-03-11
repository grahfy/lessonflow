"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { CaptchaField, useCaptcha } from "@/components/captcha";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { EmailViewerDialog } from "@/components/admin/ui/email-viewer-dialog";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { isCaptchaErrorResult } from "@/lib/admin/constants";
import type { EmailRecord, SendEmailResult } from "@/lib/admin/use-email-history";

interface AdminEmailPanelProps {
  historyTitle?: string;
  composeTitle?: string;
  emptyLabel: string;
  history: ReadonlyArray<EmailRecord>;
  loadingHistory: boolean;
  subject: string;
  setSubject: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  sending: boolean;
  syncing?: boolean;
  onSend: (
    subject: string,
    message: string,
    captcha?: { captchaToken: string; captchaAnswer: string }
  ) => Promise<SendEmailResult>;
  onSync?: () => void;
  panelClassName?: string;
  historyClassName?: string;
  historyListClassName?: string;
  historyItemClassName?: string;
  composerCardClassName?: string;
  composerFormClassName?: string;
  messageClassName?: string;
  messagePlaceholder?: string;
  captchaIdPrefix: string;
  renderHistoryHeader: (email: EmailRecord) => ReactNode;
  renderHistoryMeta: (email: EmailRecord) => ReactNode;
}

export function AdminEmailPanel({
  historyTitle = "Email History",
  composeTitle = "Send Email",
  emptyLabel,
  history,
  loadingHistory,
  subject,
  setSubject,
  message,
  setMessage,
  sending,
  syncing,
  onSend,
  onSync,
  panelClassName,
  historyClassName,
  historyListClassName,
  historyItemClassName,
  composerCardClassName,
  composerFormClassName,
  messageClassName,
  messagePlaceholder = "Type your message here...",
  captchaIdPrefix,
  renderHistoryHeader,
  renderHistoryMeta
}: AdminEmailPanelProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const captcha = useCaptcha();

  async function handleSend() {
    if (!captcha.validateAnswer()) {
      return;
    }

    const result = await onSend(subject, message, captcha.getPayload());

    if (result.success) {
      void captcha.regenerate();
      return;
    }

    if (isCaptchaErrorResult(result)) {
      captcha.onServerError("CAPTCHA verification failed. Please try again.");
      return;
    }

    void captcha.regenerate();
  }

  return (
    <div className={["dialog-layout customer-dialog-panel admin-email-panel", panelClassName].filter(Boolean).join(" ")}>
      <div className="dialog-col dialog-tab-section admin-email-history-shell">
        <div className="section-header-with-action">
          <h3 className="manual-section-title">{historyTitle}</h3>
          {onSync ? (
            <Tooltip content="Sync recent emails from connected providers.">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={onSync}
                disabled={syncing || loadingHistory}
              >
                {syncing ? "Syncing..." : "Sync Now"}
              </button>
            </Tooltip>
          ) : null}
        </div>
        <AdminCard ghost className={["admin-email-history-card", historyClassName].filter(Boolean).join(" ")}>
          {loadingHistory ? (
            <p className="helper-text">Loading history...</p>
          ) : history.length > 0 ? (
            <div className={["admin-email-history-list", historyListClassName].filter(Boolean).join(" ")}>
              {history.map((email) => (
                <button
                  key={email.id}
                  type="button"
                  className={["admin-email-history-item", historyItemClassName].filter(Boolean).join(" ")}
                  onClick={() => setSelectedEmail(email)}
                >
                  {renderHistoryHeader(email)}
                  {renderHistoryMeta(email)}
                </button>
              ))}
            </div>
          ) : (
            <p className="helper-text">{emptyLabel}</p>
          )}
        </AdminCard>
      </div>

      <div className="dialog-col dialog-tab-section admin-email-compose-shell">
        <h3 className="manual-section-title">{composeTitle}</h3>
        <AdminCard ghost className={["admin-email-composer-card", composerCardClassName].filter(Boolean).join(" ")}>
          <div className={["admin-email-composer-form", composerFormClassName].filter(Boolean).join(" ")}>
            <div className="field full">
              <label htmlFor={`${captchaIdPrefix}-subject`}>Subject</label>
              <input
                id={`${captchaIdPrefix}-subject`}
                placeholder="Email subject..."
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor={`${captchaIdPrefix}-message`}>Message</label>
              <textarea
                id={`${captchaIdPrefix}-message`}
                placeholder={messagePlaceholder}
                className={messageClassName}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>
            <div className="button-row button-row-justify admin-email-actions customer-email-actions">
              <Tooltip content="Clear message fields.">
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={sending || (!subject.trim() && !message.trim())}
                  onClick={() => {
                    setSubject("");
                    setMessage("");
                  }}
                >
                  Clear Draft
                </button>
              </Tooltip>
              <Tooltip content="Send this email.">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={sending || !subject.trim() || !message.trim()}
                  onClick={() => void handleSend()}
                >
                  {sending ? "Sending..." : "Send Email"}
                </button>
              </Tooltip>
            </div>
            <div className="admin-email-captcha-field">
              <CaptchaField idPrefix={captchaIdPrefix} captcha={captcha} />
            </div>
          </div>
        </AdminCard>
      </div>

      <EmailViewerDialog
        isOpen={Boolean(selectedEmail)}
        onClose={() => setSelectedEmail(null)}
        email={selectedEmail}
      />
    </div>
  );
}
