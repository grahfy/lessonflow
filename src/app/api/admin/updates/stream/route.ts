import { NextRequest } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-route";
import path from "node:path";
import fs from "node:fs";

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const repoRoot = process.cwd();
  const logFile = path.join(repoRoot, ".data", "update.log");
  const lockFile = path.join(repoRoot, ".data", "update.lock");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: string, event = "message") => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      if (!fs.existsSync(logFile)) {
        sendEvent("Log file not found yet. Waiting...");
      }

      let lastReadPosition = 0;

      const readNewLogs = () => {
        if (!fs.existsSync(logFile)) return;
        
        try {
          const stats = fs.statSync(logFile);
          if (stats.size > lastReadPosition) {
            const fd = fs.openSync(logFile, "r");
            const length = stats.size - lastReadPosition;
            const buffer = Buffer.alloc(length);
            fs.readSync(fd, buffer, 0, length, lastReadPosition);
            fs.closeSync(fd);
            
            sendEvent(buffer.toString());
            lastReadPosition = stats.size;
          }
        } catch (error) {
          console.error("Error reading logs:", error);
        }
      };

      // Initial read
      readNewLogs();

      // Watch for changes
      const watcher = fs.watch(path.dirname(logFile), (eventType, filename) => {
        if (filename === "update.log") {
          readNewLogs();
        }
        
        // If update.lock is removed, it means the process finished
        if (filename === "update.lock" && !fs.existsSync(lockFile)) {
          readNewLogs(); // One last read
          sendEvent("Update process finished.", "end");
          // We don't close immediately to let the UI handle it
        }
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 15000);

      request.signal.addEventListener("abort", () => {
        watcher.close();
        clearInterval(keepAlive);
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
