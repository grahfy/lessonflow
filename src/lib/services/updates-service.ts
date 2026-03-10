/**
 * Application Version & Update Service
 * 
 * Provides an interface to the underlying Git repository to detect pending 
 * production updates. This is primarily used by the Admin Dashboard to 
 * notify operators when new code is available on the remote repository.
 * 
 * DESIGN RATIONALE:
 * 1. CLI-First approach: We wrap raw `git` commands rather than using a 
 *    JS Git library to minimize dependency bloat and ensure 100% compatibility 
 *    with the server's Git installation.
 * 2. Caching: Remote fetch operations are expensive and potentially 
 *    rate-limited by providers. We implement a non-persistent in-memory 
 *    cache (5m TTL) to keep the UI snappy.
 * 3. Atomic SHA comparison: Comparisons are done between local `HEAD` and 
 *    `origin/main` to determine update availability.
 * 
 * SECURITY NOTE: This service requires the Node.js process to have read access 
 * to the `.git` directory and execution privileges for `git`.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getUpdatesGitRepoPath } from "@/lib/env";

const execAsync = promisify(exec);

/** Represents the differential state between local and remote codebases. */
export interface UpdateStatus {
  /** True if origin/main is ahead of local HEAD. */
  updateAvailable: boolean;
  localSha: string;
  remoteSha: string;
  lastChecked: Date;
}

/** Sanitized commit information for display in the Admin UI. */
export interface CommitMetadata {
  sha: string;
  author: string;
  date: string;
  message: string;
}

// Simple in-memory cache to prevent redundant Git CLI spawns.
let cachedStatus: UpdateStatus | null = null;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Checks if there are new commits on the remote repository.
 * Performs a `git fetch` and compares local HEAD with `origin/main`.
 * 
 * @param forceFetch - If true, bypasses the 5-minute cache.
 */
export async function getUpdateStatus(forceFetch = false): Promise<UpdateStatus> {
  const now = new Date();

  if (!forceFetch && cachedStatus && now.getTime() - cachedStatus.lastChecked.getTime() < CACHE_TTL_MS) {
    return cachedStatus;
  }

  try {
    const repoPath = getUpdatesGitRepoPath();

    // 1. Fetch latest metadata from remote (non-destructive)
    try {
      await execAsync("git fetch origin main", { cwd: repoPath });
    } catch (fetchError) {
      console.error(`Update check failed: git fetch failed in ${repoPath}.`, (fetchError as Error).message);
      return {
        updateAvailable: false,
        localSha: "fetch-failed",
        remoteSha: "fetch-failed",
        lastChecked: now
      };
    }

    // 2. Get local HEAD SHA
    const { stdout: localShaRaw } = await execAsync("git rev-parse HEAD", { cwd: repoPath });
    const localSha = localShaRaw.trim();

    // 3. Get remote origin/main SHA
    const { stdout: remoteShaRaw } = await execAsync("git rev-parse origin/main", { cwd: repoPath });
    const remoteSha = remoteShaRaw.trim();

    const status: UpdateStatus = {
      updateAvailable: localSha !== remoteSha,
      localSha,
      remoteSha,
      lastChecked: now
    };

    cachedStatus = status;
    return status;
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return {
      updateAvailable: false,
      localSha: "unknown",
      remoteSha: "unknown",
      lastChecked: now
    };
  }
}

/**
 * Retrieves a list of commits present on Remote but not on Local.
 * 
 * RATIONALE: This allows the Admin to see a "Changelog" of what will be 
 * applied before they trigger a deployment.
 * 
 * @param localSha - The current version hash
 * @param remoteSha - The target version hash
 */
export async function getPendingCommits(localSha: string, remoteSha: string): Promise<CommitMetadata[]> {
  if (localSha === remoteSha) return [];

  try {
    const repoPath = getUpdatesGitRepoPath();
    // List commits from localSha to remoteSha using a custom pipe-delimited format for easy parsing.
    const format = "%H|%an|%ad|%s";
    const { stdout } = await execAsync(`git log ${localSha}..${remoteSha} --pretty=format:"${format}" --date=short`, { cwd: repoPath });
    
    if (!stdout.trim()) return [];

    return stdout.trim().split("\n").map(line => {
      const [sha, author, date, message] = line.split("|");
      return { sha, author, date, message };
    });
  } catch (error) {
    console.error("Failed to retrieve pending commits:", error);
    return [];
  }
}
