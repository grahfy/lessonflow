import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { AdminBuildInfo } from "@/lib/build-info-types";
import { readLatestDeployUpdate } from "@/lib/deploy-updates";

const execAsync = promisify(exec);

const PACKAGE_JSON_PATH = path.join(process.cwd(), "package.json");

const STATIC_BUILD_INFO = {
  developedYear: "2026",
  createdBy: "Dean Thomson",
  repositoryUrl: "https://gitlab.com/grahfmusic/lessonflow.git",
  wikiUrl: "https://gitlab.com/grahfmusic/lessonflow/-/wikis/home",
  contactEmail: "contact@grahfmusic.com"
} as const;

let cachedBuildInfoPromise: Promise<AdminBuildInfo> | null = null;

async function runGitCommand(command: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(command, { cwd: process.cwd() });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function readPackageVersion(): Promise<string> {
  try {
    const packageJson = await readFile(PACKAGE_JSON_PATH, "utf8");
    const parsed = JSON.parse(packageJson) as { version?: string };
    return parsed.version?.trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function loadAdminBuildInfo(): Promise<AdminBuildInfo> {
  const packageVersion = await readPackageVersion();
  const releaseLabel = await runGitCommand("git describe --tags --abbrev=0");
  const shortCommit = await runGitCommand("git rev-parse --short HEAD");
  const gitFallback = await runGitCommand("git describe --tags --always");

  if (releaseLabel || shortCommit || gitFallback) {
    const commitLabel = shortCommit || gitFallback || packageVersion;
    const versionText = releaseLabel ? `${releaseLabel} · ${commitLabel}` : commitLabel;

    return {
      versionText,
      releaseLabel: releaseLabel || packageVersion,
      shortCommit: shortCommit || (!releaseLabel && gitFallback ? gitFallback : "unavailable"),
      packageVersion,
      source: "git",
      ...STATIC_BUILD_INFO
    };
  }

  const latestDeployUpdate = await readLatestDeployUpdate();
  if (latestDeployUpdate?.shortCommit) {
    const deployRelease = latestDeployUpdate.release?.trim() || packageVersion;
    const deployCommit = latestDeployUpdate.shortCommit.trim();
    const versionText = deployRelease ? `${deployRelease} · ${deployCommit}` : deployCommit;

    return {
      versionText,
      releaseLabel: deployRelease,
      shortCommit: deployCommit,
      packageVersion,
      source: "deploy",
      ...STATIC_BUILD_INFO
    };
  }

  return {
    versionText: packageVersion,
    releaseLabel: packageVersion,
    shortCommit: "unavailable",
    packageVersion,
    source: "package",
    ...STATIC_BUILD_INFO
  };
}

/**
 * Resolves the build metadata shown in admin surfaces and docs.
 */
export async function getAdminBuildInfo(): Promise<AdminBuildInfo> {
  cachedBuildInfoPromise ??= loadAdminBuildInfo();
  return cachedBuildInfoPromise;
}

/**
 * Test-only helper that clears the module cache between assertions.
 */
export function resetAdminBuildInfoCache(): void {
  cachedBuildInfoPromise = null;
}
