"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function UpdateProgressClient() {
  const router = useRouter();
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"connecting" | "updating" | "restarting" | "complete" | "error">("connecting");
  const logEndRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const eventSource = new EventSource("/api/admin/updates/stream");

    eventSource.onopen = () => {
      setStatus("updating");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLogs((prev) => [...prev, data]);
      } catch {
        setLogs((prev) => [...prev, event.data]);
      }
    };

    eventSource.addEventListener("end", () => {
      setStatus("restarting");
      eventSource.close();
      startPolling();
    });

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      // Don't set error immediately, could be transient or restart-induced
      if (status === "restarting") {
        eventSource.close();
      } else {
        setStatus("error");
        eventSource.close();
      }
    };

    return () => {
      eventSource.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function startPolling() {
    // Wait a bit for the service to actually go down/start restarting
    await new Promise(r => setTimeout(r, 5000));

    const poll = async () => {
      try {
        const res = await fetch("/api/admin/updates/status", { cache: 'no-store' });
        if (res.ok) {
          setStatus("complete");
          setTimeout(() => {
            router.push("/admin");
            router.refresh();
          }, 2000);
          return;
        }
      } catch {
        // Expected failure during restart
      }
      // Retry in 3 seconds
      setTimeout(poll, 3000);
    };

    poll();
  }

  if (!isMounted) return null;

  return (
    <div className="update-progress-container">
      <div className="update-status-header">
        {status === "connecting" && <p className="notice">Establishing connection to update stream...</p>}
        {status === "updating" && <p className="notice">Applying updates. This may take a few minutes. <strong>Do not close this page.</strong></p>}
        {status === "restarting" && <p className="notice success">Build complete. LessonFlow is restarting. You will be redirected automatically.</p>}
        {status === "complete" && <p className="notice success">Update successful! Redirecting to dashboard...</p>}
        {status === "error" && <p className="notice error">Connection to update stream lost. Please check server logs or refresh the page.</p>}
      </div>

      <div 
        className="update-log-view"
        style={{
          background: "rgba(0, 0, 0, 0.3)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-md)",
          padding: "20px",
          height: "500px",
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: "0.85rem",
          lineHeight: "1.4",
          color: "var(--ink-1)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all"
        }}
      >
        {logs.map((log, i) => (
          <div key={i} className="log-entry">{log}</div>
        ))}
        <div ref={logEndRef} />
      </div>

      <style jsx>{`
        .update-progress-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 1000px;
          margin: 0 auto;
        }
        .log-entry {
          margin-bottom: 4px;
        }
      `}</style>
    </div>
  );
}
