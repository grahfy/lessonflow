import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { getWebUpdateRunnerStatus } from "@/lib/updates-runner";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appRoot = process.cwd();
    const lockFile = path.join(appRoot, ".data", "update.lock");

    // Check for existing lock file
    if (fs.existsSync(lockFile)) {
      const pid = fs.readFileSync(lockFile, "utf8").trim();
      try {
        // Check if process is still alive
        process.kill(parseInt(pid, 10), 0);
        return NextResponse.json({ error: "Update already in progress." }, { status: 409 });
      } catch {
        // Process is dead, stale lock
        fs.unlinkSync(lockFile);
      }
    }

    const runner = getWebUpdateRunnerStatus();
    if (!runner.configured) {
      return NextResponse.json(
        {
          error: runner.message || "Web-triggered updates are not configured on this host."
        },
        { status: 503 }
      );
    }

    // Start the host runner asynchronously so the browser can navigate to the
    // progress page immediately instead of waiting for the full oneshot deploy.
    const startResult = spawnSync("sudo", ["-n", "systemctl", "start", "--no-block", runner.serviceName], {
      cwd: appRoot,
      encoding: "utf8"
    });

    if (startResult.error || startResult.status !== 0) {
      const stderr = startResult.stderr?.trim();
      const stdout = startResult.stdout?.trim();
      const details = stderr || stdout;
      return NextResponse.json(
        {
          error: details
            ? `Unable to start the host update runner. ${details}`
            : "Unable to start the host update runner. Confirm the web-update systemd unit and sudoers entry are installed."
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Update process started."
    });
  } catch (error) {
    console.error("Failed to execute update:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
