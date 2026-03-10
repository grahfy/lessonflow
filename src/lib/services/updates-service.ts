import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getUpdatesGitRepoPath } from "@/lib/env";

const execAsync = promisify(exec);

export interface UpdateStatus {
  updateAvailable: boolean;
  localSha: string;
  remoteSha: string;
  lastChecked: Date;
}

export interface CommitMetadata {
  sha: string;
  author: string;
  date: string;
  message: string;
}

// Simple in-memory cache
let cachedStatus: UpdateStatus | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Checks if there are new commits on the remote repository.
 * Performs a `git fetch` and compares local HEAD with `origin/main`.
 */
export async function getUpdateStatus(forceFetch = false): Promise<UpdateStatus> {
  const now = new Date();

  if (!forceFetch && cachedStatus && now.getTime() - cachedStatus.lastChecked.getTime() < CACHE_TTL_MS) {
    return cachedStatus;
  }

  try {
    const repoPath = getUpdatesGitRepoPath();

    // 1. Fetch latest from remote
    try {
      await execAsync("git fetch origin main", { cwd: repoPath });
    } catch (fetchError: any) {
      console.error(`Update check failed: git fetch failed in ${repoPath}. Ensure it is a git repository and has remote access.`, fetchError.message);
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
    // Return a safe default if git commands fail
    return {
      updateAvailable: false,
      localSha: "unknown",
      remoteSha: "unknown",
      lastChecked: now
    };
  }
}

/**
 * Retrieves the list of commits between two SHAs.
 * Format: sha|author|date|message
 */
export async function getPendingCommits(localSha: string, remoteSha: string): Promise<CommitMetadata[]> {
  if (localSha === remoteSha) return [];

  try {
    const repoPath = getUpdatesGitRepoPath();
    // List commits from localSha to remoteSha
    // %H: hash, %an: author name, %ad: author date (short), %s: subject
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
