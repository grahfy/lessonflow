"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type UpdateStatus = "connecting" | "updating" | "restarting" | "complete" | "error";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

function collectLogLines(logs: string[]): string[] {
  return logs.flatMap((entry) =>
    entry
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
}

function estimateBuildRemaining(logs: string[], status: UpdateStatus): string | null {
  if (status !== "updating") {
    return null;
  }

  const lines = collectLogLines(logs);
  const fullText = lines.join("\n");

  if (!fullText.includes("Building Next.js application")) {
    return null;
  }

  if (fullText.includes("Build complete.") || fullText.includes("Restarting systemd service")) {
    return null;
  }

  const latestStaticPagesMatch = [...fullText.matchAll(/Generating static pages \((\d+)\/(\d+)\)/g)].at(-1);
  if (latestStaticPagesMatch) {
    const completed = Number.parseInt(latestStaticPagesMatch[1], 10);
    const total = Number.parseInt(latestStaticPagesMatch[2], 10);

    if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
      const remainingPages = Math.max(total - completed, 0);
      const estimatedSeconds = Math.max(20, Math.round(remainingPages * 1.4 + 12));
      return `about ${formatDuration(estimatedSeconds * 1000)}`;
    }
  }

  if (fullText.includes("Finalizing page optimization") || fullText.includes("Collecting build traces")) {
    return "under 1 minute";
  }

  if (fullText.includes("Compiled successfully in")) {
    return "about 1 minute";
  }

  if (fullText.includes("Creating an optimized production build")) {
    return "about 2 to 4 minutes";
  }

  return "about 3 to 5 minutes";
}

export function UpdateProgressClient() {
  const router = useRouter();
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<UpdateStatus>("connecting");
  const logEndRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const interval = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted) return;

    const eventSource = new EventSource("/api/admin/updates/stream");

    eventSource.onopen = () => {
      setStatus("updating");
      setConnectedAt(Date.now());
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

  const elapsedLabel = connectedAt ? formatDuration(timerNow - connectedAt) : null;
  const buildEtaLabel = estimateBuildRemaining(logs, status);

  return (
    <div className="update-progress-container">
      <div className="update-status-header">
        {status === "connecting" && <p className="notice">Establishing connection to update stream...</p>}
        {status === "updating" && <p className="notice">Applying updates. This may take a few minutes. <strong>Do not close this page.</strong></p>}
        {status === "restarting" && <p className="notice success">Build complete. LessonFlow is restarting. Please wait a moment.</p>}
        {status === "complete" && <p className="notice success">Update successful! Your system is now up to date.</p>}
        {status === "error" && <p className="notice error">An error occurred during the update or the connection was lost. Please check server logs.</p>}
        {(elapsedLabel || buildEtaLabel) && (
          <div className="update-timing-meta">
            {elapsedLabel ? <p className="helper-text">Elapsed: {elapsedLabel}</p> : null}
            {buildEtaLabel ? <p className="helper-text">Next.js build ETA: {buildEtaLabel}</p> : null}
          </div>
        )}
      </div>

      {(status === "complete" || status === "error") && (
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
          <button 
            className="btn btn-primary"
            onClick={() => {
              router.push("/admin");
              router.refresh();
            }}
          >
            Back to Admin Dashboard
          </button>
        </div>
      )}

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
        .update-timing-meta {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
