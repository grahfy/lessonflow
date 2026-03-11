"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminNotice } from "@/components/admin/ui/admin-notice";
import { AlertCircle, CheckCircle, RefreshCw, Bug, Search, Terminal, ChevronRight, ChevronDown, ImagePlus, X } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import { readApiErrorFromResponse } from "@/lib/admin/utils";

type SystemLog = {
  id: string;
  level: string;
  event: string;
  message: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

/**
 * Extracts a short "source" category from the event string.
 * For example "Booking approved" → "Booking", "Invoice sent" → "Invoice".
 * Falls back to the full event if it's a single word.
 */
function deriveSource(event: string): string {
  const firstWord = event.split(/[\s_-]/)[0];
  return firstWord || event;
}

/**
 * Formats event string into a short identifier.
 * "Booking approved" → "BOOKING_APPROVED"
 */
function deriveEventId(event: string): string {
  return event
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 24);
}

/**
 * Strips the redundant `[timestamp] [level] event {meta}` prefix from
 * stored log messages since those fields are already shown in dedicated
 * table columns. Returns only the meaningful payload.
 */
function cleanMessage(message: string, event: string): string {
  // Messages are stored as: "[ISO] [level] event {meta}"
  // Strip leading "[...] [level] event" prefix if present.
  const prefixPattern = /^\[[^\]]*\]\s*\[[^\]]*\]\s*/;
  let cleaned = message.replace(prefixPattern, "");
  // Also strip the event name from the start if it's duplicated
  if (cleaned.startsWith(event)) {
    cleaned = cleaned.slice(event.length).trim();
  }
  return cleaned || message;
}

export function SystemLogsClient() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [levelFilter, setLevelFilter] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  
  // Bug reporting state
  const [isReportingBug, setIsReportingBug] = useState(false);
  const [bugSubject, setBugSubject] = useState("");
  const [bugEmail, setBugEmail] = useState("");
  const [bugDescription, setBugDescription] = useState("");
  const [bugScreenshot, setBugScreenshot] = useState<string | null>(null);
  const [submittingBug, setSubmittingBug] = useState(false);
  const [reportResult, setReportResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  /**
   * Reads a selected image file and converts it to a base64 data URL.
   * Constrains the image to max 1200px width to keep the payload reasonable.
   */
  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // NOTE: Only accept image files up to 5 MB to avoid oversized payloads.
    if (file.size > 5 * 1024 * 1024) {
      setError("Screenshot must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBugScreenshot(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        level: levelFilter,
        event: eventSearch,
      });
      const response = await safeFetch(`/api/admin/system-logs?${params}`);
      if (!response.ok) {
        await handleApiError(response, "Failed to load logs. Please refresh the page.");
        return;
      }
      const data = await response.json();
      if (data.logs) {
        setLogs(data.logs);
        setTotalCount(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
      setError("Failed to load logs. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, levelFilter, eventSearch, safeFetch, handleApiError]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedLogs);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedLogs(newSet);
  };

  const handleReportBug = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingBug(true);
    setReportResult(null);
    try {
      const response = await safeFetch("/api/admin/system-logs/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: bugSubject,
          replyEmail: bugEmail,
          description: bugDescription,
          screenshot: bugScreenshot || undefined,
          includeRecentLogs: true,
        }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          await handleApiError(response, "Failed to submit report.");
          return;
        }

        const message = await readApiErrorFromResponse(response, "Failed to submit report");
        setReportResult({ error: message });
        return;
      }

      const data = await response.json();
      if (data.ok) {
        setReportResult({ success: true });
        setBugSubject("");
        setBugEmail("");
        setBugDescription("");
        setBugScreenshot(null);
        setNotice("Technical issue reported successfully.");
        setTimeout(() => {
          setIsReportingBug(false);
          setReportResult(null);
          setNotice("");
        }, 3000);
      } else {
        setReportResult({ error: data.error || "Failed to submit report" });
      }
    } catch (err) {
      console.error("Failed to submit bug report:", err);
      setReportResult({ error: "An unexpected error occurred" });
    } finally {
      setSubmittingBug(false);
    }
  };

  /**
   * Returns the CSS class suffix for a log level badge.
   */
  const getLevelClass = (level: string): string => {
    switch (level.toLowerCase()) {
      case "error": return "syslog-level-error";
      case "warn": return "syslog-level-warn";
      case "info": return "syslog-level-info";
      default: return "syslog-level-info";
    }
  };

  /**
   * Format timestamp for display in the monitoring-style table.
   * Output: "2026-03-10 23:48:34"
   */
  const formatTimestamp = (iso: string): string => {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // Pagination info for the footer
  const startRange = totalCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRange = Math.min(page * pageSize, totalCount);

  return (
    <AdminShell title="System Logs" notice={notice} error={error} className="admin-shell-logs">
      <div className="admin-layout-content">
        <AdminCard className="admin-toolbar-card syslog-toolbar-card">
          <div className="syslog-toolbar">
            <div className="syslog-toolbar-search">
              <Search size={14} />
              <Tooltip content="Search logs by event name or identifier.">
                <input
                  id="syslog-search"
                  type="text"
                  placeholder="Search logs..."
                  value={eventSearch}
                  onChange={(e) => {
                    setEventSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </Tooltip>
            </div>

            <div className="syslog-toolbar-field">
              <Tooltip content="Filter logs by severity level.">
                <label htmlFor="syslog-level">Level</label>
              </Tooltip>
              <select
                id="syslog-level"
                value={levelFilter}
                onChange={(e) => {
                  setLevelFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Levels</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div className="syslog-toolbar-actions">
              <Tooltip content="Reload the system logs from the server.">
                <button
                  className="btn btn-secondary"
                  onClick={fetchLogs}
                  disabled={loading}
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  REFRESH
                </button>
              </Tooltip>
              <Tooltip content="Open a form to submit a technical issue report to the developer.">
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsReportingBug(true)}
                >
                  <Bug size={14} />
                  REPORT ISSUE
                </button>
              </Tooltip>
            </div>
          </div>
          <p className="helper-text syslog-toolbar-note">Search and level filters apply automatically.</p>
        </AdminCard>

        {/* ── Table container ── */}
        <div className="syslog-table-wrap">
          {/* Table bar */}
          <div className="syslog-table-bar">
            <div className="syslog-table-bar-left">
              <Terminal size={14} />
              <span>System Output</span>
            </div>
            {loading && (
              <div className="syslog-table-bar-status">
                <RefreshCw size={12} className="animate-spin" />
                <span>Loading…</span>
              </div>
            )}
          </div>

          {/* Scrollable table area */}
          <div className="syslog-scroll">
            <table className="syslog-table">
              <thead>
                <tr>
                  <th className="syslog-col-expand"></th>
                  <th>Timestamp</th>
                  <th>Level</th>
                  <th>Source</th>
                  <th>Event ID</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="syslog-empty">
                      No system logs found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const hasMeta = log.meta && Object.keys(log.meta).length > 0;
                    const isExpanded = expandedLogs.has(log.id);
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className={hasMeta ? "syslog-row-expandable" : ""}
                          onClick={() => hasMeta && toggleExpand(log.id)}
                          onKeyDown={(event) => {
                            if (!hasMeta) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleExpand(log.id);
                            }
                          }}
                          tabIndex={hasMeta ? 0 : undefined}
                          aria-expanded={hasMeta ? isExpanded : undefined}
                        >
                          <td className="syslog-col-expand">
                            {hasMeta ? (
                              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                            ) : null}
                          </td>
                          <td className="syslog-col-timestamp">
                            {formatTimestamp(log.createdAt)}
                          </td>
                          <td>
                            <span className={`syslog-level ${getLevelClass(log.level)}`}>
                              {log.level.toUpperCase()}
                            </span>
                          </td>
                          <td className="syslog-col-source">
                            {deriveSource(log.event)}
                          </td>
                          <td className="syslog-col-event" title={log.event}>
                            {deriveEventId(log.event)}
                          </td>
                          <td className="syslog-col-message" title={log.message}>
                            {cleanMessage(log.message, log.event)}
                          </td>
                        </tr>
                        {isExpanded && hasMeta && (
                          <tr>
                            <td colSpan={6} className="syslog-meta-cell">
                              <div className="syslog-meta-block">
                                {JSON.stringify(log.meta, null, 2)}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer with count summary */}
          {totalCount > 0 && (
            <div className="syslog-footer">
              <span>Page {page} of {totalPages}</span>
              <span>{startRange}-{endRange} of {totalCount.toLocaleString()} logs</span>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="syslog-pagination-wrap">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            totalCount={totalCount}
            pageSizeOptions={[25, 50, 100]}
          />
        </div>
      </div>

      {/* Bug Report Dialog — uses the standard AdminDialog component */}
      <AdminDialog
        isOpen={isReportingBug}
        onClose={() => setIsReportingBug(false)}
        title="Report Technical Issue"
        description="Describe the issue you're experiencing. Recent system logs will be attached automatically to help the developer with troubleshooting."
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsReportingBug(false)}
              className="btn btn-secondary"
            >
              CANCEL
            </button>
            <button
              type="submit"
              form="bug-report-form"
              disabled={submittingBug || bugSubject.length < 3 || !bugEmail.includes("@") || bugDescription.length < 10}
              className="btn btn-primary"
            >
              {submittingBug ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  SENDING...
                </>
              ) : (
                <>
                  <Bug size={16} />
                  SUBMIT REPORT
                </>
              )}
            </button>
          </>
        }
      >
        <form id="bug-report-form" onSubmit={handleReportBug}>
          <div className="field">
            <Tooltip content="A short title describing the issue you encountered.">
              <label htmlFor="bug-subject" className="admin-inline-field">Subject</label>
            </Tooltip>
            <input
              id="bug-subject"
              type="text"
              required
              minLength={3}
              maxLength={200}
              autoFocus
              placeholder="Brief summary of the issue"
              value={bugSubject}
              onChange={(e) => setBugSubject(e.target.value)}
            />
          </div>

          <div className="field syslog-report-field">
            <Tooltip content="Where should the developer reply to this report?">
              <label htmlFor="bug-email" className="admin-inline-field">Your Email</label>
            </Tooltip>
            <input
              id="bug-email"
              type="email"
              required
              placeholder="your.email@example.com"
              value={bugEmail}
              onChange={(e) => setBugEmail(e.target.value)}
            />
          </div>

          <div className="field syslog-report-field">
            <Tooltip content="Please provide steps to reproduce the issue.">
              <label htmlFor="bug-desc" className="admin-inline-field">Description</label>
            </Tooltip>
            <textarea
              id="bug-desc"
              required
              minLength={10}
              rows={4}
              placeholder="What happened? What were you trying to do?"
              value={bugDescription}
              onChange={(e) => setBugDescription(e.target.value)}
            />
          </div>

          <div className="field syslog-report-field">
            <label className="admin-inline-field">Screenshot (optional)</label>
            {bugScreenshot ? (
              <div className="syslog-screenshot-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bugScreenshot}
                  alt="Screenshot preview"
                  className="syslog-screenshot-image"
                />
                <button
                  type="button"
                  className="btn btn-secondary syslog-screenshot-remove"
                  onClick={() => setBugScreenshot(null)}
                >
                  <X size={14} />
                  REMOVE
                </button>
              </div>
            ) : (
              <label
                htmlFor="bug-screenshot"
                className="btn btn-secondary syslog-screenshot-trigger"
              >
                <ImagePlus size={16} />
                ATTACH SCREENSHOT
                <input
                  id="bug-screenshot"
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotChange}
                  className="syslog-screenshot-input"
                />
              </label>
            )}
          </div>

          {reportResult && (
            <AdminNotice
              tone={reportResult.success ? "success" : "error"}
              className="syslog-report-result"
            >
              {reportResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {reportResult.success ? " Report sent successfully! Thank you." : ` ${reportResult.error}`}
            </AdminNotice>
          )}
        </form>
      </AdminDialog>
    </AdminShell>
  );
}
