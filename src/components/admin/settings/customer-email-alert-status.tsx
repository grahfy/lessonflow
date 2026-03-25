"use client";

import { AlertCircle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { useCustomerEmailAlertStatus, type InboxProviderStatus } from "@/lib/admin/use-customer-email-alert-status";

function renderStatusIcon(status: InboxProviderStatus["status"]) {
  switch (status) {
    case "loading":
      return <RefreshCw className="icon-spin" size={18} />;
    case "connected":
      return <CheckCircle2 className="status-success-icon" size={18} />;
    case "not_configured":
      return <AlertCircle className="status-warning-icon" size={18} />;
    case "error":
      return <XCircle className="status-error-icon" size={18} />;
  }
}

function renderStatusLabel(status: InboxProviderStatus["status"]) {
  switch (status) {
    case "loading":
      return "Checking";
    case "connected":
      return "Connected";
    case "not_configured":
      return "Not Configured";
    case "error":
      return "Connection Error";
  }
}

export function CustomerEmailAlertStatus() {
  const { status, check } = useCustomerEmailAlertStatus();
  const loading = status.gmail.status === "loading" || status.imap.status === "loading";
  const providerDescription = status.providerPreference === "auto"
    ? "Auto (prefers Gmail, then IMAP)"
    : status.providerPreference.toUpperCase();

  return (
    <AdminCard ghost className="gmail-status-card">
      <div className="gmail-status-header">
        <div className="gmail-status-title">
          <strong>
            Inbox Alert Status: {status.alertsEnabled ? "Enabled" : "Disabled"}
            {status.activeProvider ? ` · Active ${status.activeProvider.toUpperCase()}` : ""}
          </strong>
        </div>
        <Tooltip content="Refresh inbox alert connection status.">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={check}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw
              size={14}
              className={loading ? "icon-spin" : ""}
            />
          </button>
        </Tooltip>
      </div>

      <div className="gmail-status-details">
        <p className="helper-text">
          Configured provider preference: <code>{providerDescription}</code>.
        </p>
        {!status.alertsEnabled ? (
          <p className="helper-text">Owner inbox alerts are currently disabled.</p>
        ) : null}
      </div>

      <div className="customer-email-provider-status-grid">
        <div className="customer-email-provider-status-item">
          <div className="gmail-status-title">
            {renderStatusIcon(status.gmail.status)}
            <strong>Gmail: {renderStatusLabel(status.gmail.status)}</strong>
          </div>
          <p className="helper-text">{status.gmail.message}</p>
          {status.gmail.email ? <p className="helper-text">Account: <code>{status.gmail.email}</code></p> : null}
        </div>

        <div className="customer-email-provider-status-item">
          <div className="gmail-status-title">
            {renderStatusIcon(status.imap.status)}
            <strong>IMAP: {renderStatusLabel(status.imap.status)}</strong>
          </div>
          <p className="helper-text">{status.imap.message}</p>
          {status.imap.email ? <p className="helper-text">User: <code>{status.imap.email}</code></p> : null}
          {status.imap.mailbox ? <p className="helper-text">Mailbox: <code>{status.imap.mailbox}</code></p> : null}
        </div>
      </div>
    </AdminCard>
  );
}
