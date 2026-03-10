"use client";

import React, { useState, useEffect } from "react";
import { PanelLayout } from "@/components/panel-layout";
import { AdminHeader } from "@/components/admin-header";
import { Pagination } from "@/components/pagination";
import { AlertCircle, CheckCircle, Info, RefreshCw, Bug, X } from "lucide-react";

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
  const [totalPages, setTotalPages] = useState(1);
  const [levelFilter, setLevelFilter] = useState("");
  const [isReportingBug, setIsReportingBug] = useState(false);
  const [bugDescription, setBugDescription] = useState("");
  const [submittingBug, setSubmittingBug] = useState(false);
  const [reportResult, setReportResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        level: levelFilter,
      });
      const response = await fetch(`/api/admin/system-logs?${params}`);
      const data = await response.json();
      if (data.logs) {
        setLogs(data.logs);
        setTotalPages(data.totalPages);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, levelFilter]);

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
        setTimeout(() => {
          setIsReportingBug(false);
          setReportResult(null);
        }, 3000);
      } else {
        setReportResult({ error: data.error || "Failed to submit report" });
      }
    } catch (error) {
      setReportResult({ error: "An unexpected error occurred" });
    } finally {
      setSubmittingBug(false);
    }
  };

  const getLevelColor = (level: string) => {
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
        return <AlertCircle size={16} />;
      case "warn":
        return <Info size={16} />;
      case "info":
        return <CheckCircle size={16} />;
      default:
        return <Info size={16} />;
    }
  };

  return (
    <PanelLayout>
      <AdminHeader title="System Logs" />

      <div className="admin-content-pading">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <select
              className="px-3 py-2 border rounded-md text-sm"
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
            <button
              onClick={fetchLogs}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-md transition-colors"
              title="Refresh logs"
            >
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          <button
            onClick={() => setIsReportingBug(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors text-sm"
          >
            <Bug size={16} />
            Report Issue
          </button>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-slate-500 font-medium">
                  <th className="px-4 py-3 w-40">Timestamp</th>
                  <th className="px-4 py-3 w-24">Level</th>
                  <th className="px-4 py-3 w-48">Event</th>
                  <th className="px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                      Loading logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                      No logs found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${getLevelColor(log.level)}`}>
                          {getLevelIcon(log.level)}
                          {log.level.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {log.event}
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-2xl">
                          <p className="text-slate-600 line-clamp-2" title={log.message}>
                            {log.message}
                          </p>
                          {log.meta && Object.keys(log.meta).length > 0 && (
                            <div className="mt-1 text-[10px] text-slate-400 font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                              {JSON.stringify(log.meta)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="px-4 py-3 border-t bg-slate-50">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>

      {/* Report Bug Modal */}
      {isReportingBug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Bug size={20} className="text-slate-500" />
                Report Technical Issue
              </h3>
              <button 
                onClick={() => setIsReportingBug(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleReportBug}>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-500">
                  Describe the issue you're experiencing. Recent system logs will be attached automatically to help with troubleshooting.
                </p>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    required
                    minLength={10}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all h-32 resize-none text-sm"
                    placeholder="What happened? What were you trying to do?"
                    value={bugDescription}
                    onChange={(e) => setBugDescription(e.target.value)}
                  />
                </div>

                {reportResult && (
                  <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${reportResult.success ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
                    {reportResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {reportResult.success ? "Report sent successfully! We'll look into it." : reportResult.error}
                  </div>
                )}
              </div>
              
              <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsReportingBug(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBug || bugDescription.length < 10}
                  className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {submittingBug ? <RefreshCw size={16} className="animate-spin" /> : <Bug size={16} />}
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PanelLayout>
  );
}
