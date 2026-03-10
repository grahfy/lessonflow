"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AlertCircle, CheckCircle, RefreshCw, Bug, X, Search, Terminal, ChevronRight, ChevronDown, Filter } from "lucide-react";
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Pagination } from "@/components/pagination";

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
  const [bugDescription, setBugDescription] = useState("");
  const [submittingBug, setSubmittingBug] = useState(false);
  const [reportResult, setReportResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        level: levelFilter,
        event: eventSearch,
      });
      const response = await fetch(`/api/admin/system-logs?${params}`);
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
  }, [page, pageSize, levelFilter, eventSearch]);

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
      const response = await fetch("/api/admin/system-logs/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: bugDescription,
          includeRecentLogs: true,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        setReportResult({ success: true });
        setBugDescription("");
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
        {/* ── Toolbar ── */}
        <div className="syslog-toolbar">
          <div className="syslog-toolbar-search">
            <Search size={14} />
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
          </div>

          <div className="syslog-toolbar-field">
            <label htmlFor="syslog-level">Level</label>
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
            <button
              className="btn btn-primary"
              onClick={fetchLogs}
              disabled={loading}
            >
              <Filter size={14} />
              FILTER
            </button>
            <button
              className="btn btn-secondary"
              onClick={fetchLogs}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              REFRESH
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setIsReportingBug(true)}
            >
              <Bug size={14} />
              REPORT ISSUE
            </button>
          </div>
        </div>

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
                  <th>Timestamp ↑</th>
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
                            {log.message}
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
        <div style={{ flexShrink: 0 }}>
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

      {/* Bug Report Dialog */}
      <DialogPrimitive.Root open={isReportingBug} onOpenChange={setIsReportingBug}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-xl bg-white p-0 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
              <DialogPrimitive.Title className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Bug size={20} className="text-slate-500" />
                Report Technical Issue
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button className="rounded-full p-1.5 hover:bg-slate-200 transition-colors">
                  <X className="h-5 w-5 text-slate-500" />
                  <span className="sr-only">Close</span>
                </button>
              </DialogPrimitive.Close>
            </div>
            
            <form onSubmit={handleReportBug}>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Describe the issue you&apos;re experiencing. Recent system logs will be attached automatically to help the developer with troubleshooting.
                </p>
                
                <div className="space-y-1.5">
                  <label htmlFor="bug-desc" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Issue Description
                  </label>
                  <textarea
                    id="bug-desc"
                    required
                    minLength={10}
                    autoFocus
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all h-32 resize-none text-sm bg-slate-50 border-slate-200"
                    placeholder="What happened? What were you trying to do?"
                    value={bugDescription}
                    onChange={(e) => setBugDescription(e.target.value)}
                  />
                </div>

                {reportResult && (
                  <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${reportResult.success ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
                    {reportResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    <span className="font-medium">
                      {reportResult.success ? "Report sent successfully! Thank you." : reportResult.error}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsReportingBug(false)}
                  className="btn btn-secondary"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submittingBug || bugDescription.length < 10}
                  className="btn btn-primary min-w-[140px]"
                >
                  {submittingBug ? (
                    <>
                      <RefreshCw size={16} className="animate-spin mr-2" />
                      SENDING...
                    </>
                  ) : (
                    <>
                      <Bug size={16} className="mr-2" />
                      SUBMIT REPORT
                    </>
                  )}
                </button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </AdminShell>
  );
}
