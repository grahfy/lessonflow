import fs from "node:fs";
import path from "node:path";

import {
  getUpdatesDeployUser,
  getUpdatesGitRepoPath,
  getWebUpdateServiceName
} from "@/lib/env";

export interface WebUpdateRunnerStatus {
  configured: boolean;
  message?: string;
  serviceName: string;
}

function isSafeSystemdUnitName(value: string): boolean {
  return /^[a-zA-Z0-9_.@-]+\.service$/.test(value);
}

function isSafeOsUser(value: string): boolean {
  return /^[a-z_][a-z0-9_-]*[$]?$/i.test(value);
}

/**
 * Validates whether the host-side web update runner is configured.
 *
 * NOTE: This only performs static readiness checks. It does not try to start
 * the unit or validate sudoers permissions because the status endpoint must
 * remain side-effect free.
 */
export function getWebUpdateRunnerStatus(): WebUpdateRunnerStatus {
  const serviceName = getWebUpdateServiceName();
  const deployUser = getUpdatesDeployUser();
  const repoPath = getUpdatesGitRepoPath();

  if (!isSafeSystemdUnitName(serviceName)) {
    return {
      configured: false,
      message: "Web-triggered updates are disabled because the systemd service name is invalid.",
      serviceName
    };
  }

  if (!deployUser) {
    return {
      configured: false,
      message: "Web-triggered updates are not configured. Set UPDATES_DEPLOY_USER in the shared environment first.",
      serviceName
    };
  }

  if (!isSafeOsUser(deployUser)) {
    return {
      configured: false,
      message: "Web-triggered updates are disabled because UPDATES_DEPLOY_USER contains unsupported characters.",
      serviceName
    };
  }

  const gitDir = path.join(repoPath, ".git");
  if (!repoPath || !fs.existsSync(gitDir)) {
    return {
      configured: false,
      message: "Web-triggered updates are not configured. UPDATES_GIT_REPO_PATH must point to the persistent git checkout used for deployments.",
      serviceName
    };
  }

  const systemdCandidates = [
    path.join("/etc/systemd/system", serviceName),
    path.join("/lib/systemd/system", serviceName),
    path.join("/usr/lib/systemd/system", serviceName)
  ];

  if (!systemdCandidates.some((candidate) => fs.existsSync(candidate))) {
    return {
      configured: false,
      message: `Web-triggered updates are not configured. Install the ${serviceName} unit on the host before using the update button.`,
      serviceName
    };
  }

  return {
    configured: true,
    serviceName
  };
}
