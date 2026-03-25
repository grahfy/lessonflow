"use client";

import { useGmailStatus } from "@/lib/admin/use-gmail-status";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export function GmailStatus() {
  const { status, check } = useGmailStatus();

  const renderIcon = () => {
    switch (status.status) {
      case "loading":
        return <RefreshCw className="icon-spin" size={18} />;
      case "connected":
        return <CheckCircle2 className="status-success-icon" size={18} />;
      case "not_configured":
        return <AlertCircle className="status-warning-icon" size={18} />;
      case "error":
        return <XCircle className="status-error-icon" size={18} />;
    }
  };

  const getStatusLabel = () => {
    switch (status.status) {
      case "loading": return "Checking connection...";
      case "connected": return "Connected";
      case "not_configured": return "Not Configured";
      case "error": return "Connection Error";
    }
  };

  return (
    <AdminCard ghost className="gmail-status-card">
      <div className="gmail-status-header">
        <div className="gmail-status-title">
          {renderIcon()}
          <strong>Gmail API Status: {getStatusLabel()}</strong>
        </div>
        <Tooltip content="Refresh Gmail connection status.">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={check}
            disabled={status.status === "loading"}
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={status.status === "loading" ? "icon-spin" : ""} />
          </button>
        </Tooltip>
      </div>
      
      {status.status === "connected" && (
        <div className="gmail-status-details">
          <p className="helper-text">Authorized as: <code>{status.email}</code></p>
        </div>
      )}
      
      {status.message && status.status !== "connected" && (
        <div className="gmail-status-details">
          <p className="helper-text">{status.message}</p>
        </div>
      )}
    </AdminCard>
  );
}
