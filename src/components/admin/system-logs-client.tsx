"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminTable, AdminTableSeparator as Separator } from "@/components/admin/ui/admin-table";
import { AlertCircle, CheckCircle, Info, RefreshCw, Bug, X, Search } from "lucide-react";
import * as DialogPrimitive from '@radix-ui/react-dialog';

type SystemLog = {
  id: string;
  level: string;
  event: string;
  message: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export function SystemLogsClient() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [levelFilter, setLevelFilter] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  
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
      setReportResult({ error: "An unexpected error occurred" });
    } finally {
      setSubmittingBug(false);
    }
  };

  const getLevelStyles = (level: string) => {
    switch (level.toLowerCase()) {
      case "error":
        return "text-red-600 bg-red-50 border-red-100";
      case "warn":
        return "text-amber-600 bg-yellow-50 border-yellow-100";
      case "info":
        return "text-blue-600 bg-blue-50 border-blue-100";
      default:
        return "text-slate-600 bg-slate-50 border-slate-100";
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case "error":
        return <AlertCircle size={14} />;
      case "warn":
        return <Info size={14} />;
      case "info":
        return <CheckCircle size={14} />;
      default:
        return <Info size={14} />;
    }
  };

  const header = (
    <>
      <div className="admin-list-col" style={{ width: '180px' }}>Timestamp</div>
      <Separator />
      <div className="admin-list-col" style={{ width: '100px' }}>Level</div>
      <Separator />
      <div className="admin-list-col" style={{ width: '200px' }}>Event</div>
      <Separator />
      <div className="admin-list-col" style={{ flex: 1 }}>Message</div>
    </>
  );

  return (
    <AdminShell title="System Logs" notice={notice} error={error} className="admin-shell-logs">
      <div className="admin-layout-content">
        <div className="admin-actions-bar">
          <div className="flex gap-2">
            <button 
              className="btn btn-secondary" 
              onClick={fetchLogs}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "animate-spin mr-2" : "mr-2"} />
              REFRESH
            </button>
            <button 
              className="btn btn-primary" 
              onClick={() => setIsReportingBug(true)}
            >
              <Bug size={16} className="mr-2" />
              REPORT TECHNICAL ISSUE
            </button>
          </div>

          <div className="search-box">
            <div className="flex items-center gap-2">
              <label htmlFor="event-search">Search Event</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="event-search"
                  type="text"
                  placeholder="Filter by event..."
                  className="pl-9"
                  value={eventSearch}
                  onChange={(e) => {
                    setEventSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            <div className="admin-sort-inline-row">
              <span className="admin-inline-field">LEVEL</span>
              <select
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
          </div>
        </div>

        <AdminTable
          header={header}
          loading={loading}
          emptyLabel="No system logs found matching your criteria."
          pagination={{
            currentPage: page,
            totalPages: totalPages,
            totalCount: totalCount,
            pageSize: pageSize,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
            pageSizeOptions: [25, 50, 100, 250]
          }}
        >
          {logs.map((log) => (
            <div key={log.id} className="invoice-row-item invoice-table-row cursor-default hover:bg-slate-50/50">
              <div className="admin-list-cell text-slate-500 text-xs" style={{ width: '180px', flexShrink: 0 }}>
                <span className="admin-mobile-label">Timestamp</span>
                {new Date(log.createdAt).toLocaleString("en-AU", { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric', 
                  hour: '2-digit', 
                  minute: '2-digit', 
                  second: '2-digit' 
                })}
              </div>

              <Separator />
              <div className="admin-list-cell" style={{ width: '100px', flexShrink: 0 }}>
                <span className="admin-mobile-label">Level</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getLevelStyles(log.level)}`}>
                  {getLevelIcon(log.level)}
                  {log.level}
                </span>
              </div>

              <Separator />
              <div className="admin-list-cell font-medium text-slate-200" style={{ width: '200px', flexShrink: 0 }}>
                <span className="admin-mobile-label">Event</span>
                {log.event}
              </div>

              <Separator />
              <div className="admin-list-cell" style={{ flex: 1, minWidth: 0 }}>
                <span className="admin-mobile-label">Message</span>
                <div className="w-full overflow-hidden">
                  <p 
                    className="text-slate-400 text-xs whitespace-nowrap overflow-hidden text-ellipsis" 
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
                    title={log.message}
                  >
                    {log.message}
                  </p>
                  {log.meta && Object.keys(log.meta).length > 0 && (
                    <div className="mt-1 text-[9px] text-slate-500 font-mono overflow-hidden text-ellipsis whitespace-nowrap opacity-60">
                      {JSON.stringify(log.meta)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </AdminTable>
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
                  Describe the issue you're experiencing. Recent system logs will be attached automatically to help the developer with troubleshooting.
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
