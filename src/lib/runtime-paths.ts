import path from "node:path";

const STANDALONE_SUFFIX = `${path.sep}.next${path.sep}standalone`;

/**
 * Resolves the runtime app root for normal and Next.js standalone processes.
 */
export function resolveRuntimeAppRoot(cwd: string = process.cwd()): string {
  const normalizedCwd = path.resolve(cwd);

  if (normalizedCwd.endsWith(STANDALONE_SUFFIX)) {
    return path.resolve(normalizedCwd, "../..");
  }

  return normalizedCwd;
}

/**
 * Resolves an optional configured storage root against the runtime app root.
 */
export function resolveConfiguredStorageRoot(
  configuredRoot: string | null | undefined,
  defaultRelativeRoot: string,
  cwd: string = process.cwd()
): string {
  const trimmedConfiguredRoot = configuredRoot?.trim();
  if (trimmedConfiguredRoot) {
    return path.isAbsolute(trimmedConfiguredRoot)
      ? path.resolve(trimmedConfiguredRoot)
      : path.resolve(resolveRuntimeAppRoot(cwd), trimmedConfiguredRoot);
  }

  return path.resolve(resolveRuntimeAppRoot(cwd), defaultRelativeRoot);
}

/**
 * Returns true when the configured storage root is set and relative.
 */
export function isRelativeConfiguredPath(configuredRoot: string | null | undefined): boolean {
  const trimmedConfiguredRoot = configuredRoot?.trim();
  if (!trimmedConfiguredRoot) {
    return false;
  }

  return !path.isAbsolute(trimmedConfiguredRoot);
}
