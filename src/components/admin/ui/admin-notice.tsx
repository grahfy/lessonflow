"use client";

import type { HTMLAttributes, ReactNode } from "react";

type AdminNoticeTone = "success" | "error" | "info";

interface AdminNoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone: AdminNoticeTone;
  children: ReactNode;
}

interface AdminNoticeStackProps {
  error?: string;
  notice?: string;
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
}

/**
 * Standard admin notice block for local success/error/info feedback.
 */
export function AdminNotice({ tone, className, children, ...props }: AdminNoticeProps) {
  const classes = ["notice", tone, "admin-notice", className].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Shared success/error/loading notice stack for admin screens and sub-editors.
 */
export function AdminNoticeStack({
  error,
  notice,
  loading,
  loadingLabel = "Loading...",
  className
}: AdminNoticeStackProps) {
  if (!error && !notice && !loading) {
    return null;
  }

  return (
    <div className={["admin-notice-stack", className].filter(Boolean).join(" ")}>
      {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
      {notice ? <AdminNotice tone="success">{notice}</AdminNotice> : null}
      {loading ? <AdminNotice tone="info">{loadingLabel}</AdminNotice> : null}
    </div>
  );
}
