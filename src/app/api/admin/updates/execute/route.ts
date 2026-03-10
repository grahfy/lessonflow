import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-route";
import path from "node:path";
import fs from "node:fs";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repoRoot = process.cwd();
    const lockFile = path.join(repoRoot, ".data", "update.lock");

    // Check for existing lock file
    if (fs.existsSync(lockFile)) {
      const pid = fs.readFileSync(lockFile, "utf8").trim();
      try {
        // Check if process is still alive
        process.kill(parseInt(pid, 10), 0);
        return NextResponse.json({ error: "Update already in progress." }, { status: 409 });
      } catch (e) {
        // Process is dead, stale lock
        fs.unlinkSync(lockFile);
      }
    }

    // Trigger the update script in the background
    const scriptPath = path.join(repoRoot, "scripts", "trigger-update.sh");
    
    // We use spawn and detach so the script keeps running even if the 
    // Next.js request handler finishes.
    const child = spawn("bash", [scriptPath], {
      detached: true,
      stdio: "ignore",
      cwd: repoRoot
    });

    child.unref();

    return NextResponse.json({
      ok: true,
      message: "Update process started."
    });
  } catch (error) {
    console.error("Failed to execute update:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
