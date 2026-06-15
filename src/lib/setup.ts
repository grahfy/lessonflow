/**
 * First-Run Setup & Environment Readiness Service
 *
 * LessonsFlow requires a specific set of environment variables and database
 * connectivity to operate. This module provides the logic for the "Setup Wizard"
 * which guides new operators through the initial configuration process.
 *
 * DESIGN RATIONALE:
 * 1. Pre-Flight Checks: Defines a robust suite of `evaluateSetupChecks` that
 *    probe database connectivity, site URL validity, and secret strength
 *    before allowing the application to initialize.
 * 2. Mixed Readiness States: Uses `pass`/`warn`/`fail` toggles so that
 *    the UI can distinguish between "Critical Blockers" (Fail) and
 *    "Sub-optimal Production Settings" (Warn).
 * 3. Dynamic Schema: Exports the `CONFIGURABLE_ENV_VARS` registry which
 *    drives both the server-side validation and the client-side form generation.
 * 4. Security Lockdown: Once at least one admin account is created,
 *    `isSetupComplete` toggles true, shielding the setup API from
 *    future public access.
 *
 * This file is a thin barrel that re-exports the implementation, which now
 * lives in `src/lib/setup/`:
 * - `env-var-registry.ts` — `CONFIGURABLE_ENV_VARS`, env schemas, validation
 * - `seed-data.ts`        — default invoice presets + lesson-plan templates
 * - `setup-checks.ts`     — readiness checks + completion state
 * - `env-file.ts`         — env path resolution, save flows, first admin
 */

export {
  CONFIGURABLE_ENV_VARS,
  envConfigSchema,
  envVarUpdateSchema,
  validateEnvConfig,
} from "./setup/env-var-registry";
export type {
  ConfigurableEnvVar,
  EnvVarKey,
  EnvConfigInput,
  EnvVarUpdate,
} from "./setup/env-var-registry";

export {
  getSetupCompletionState,
  isSetupComplete,
  evaluateSetupChecks,
  getSetupReadiness,
} from "./setup/setup-checks";
export type {
  SetupCheckStatus,
  SetupCheck,
  SetupReadiness,
  SetupCompletionState,
} from "./setup/setup-checks";

export {
  setupInitializeSchema,
  createInitialAdmin,
  getCurrentEnvValues,
  saveEnvConfig,
  saveAdminSettingsConfig,
} from "./setup/env-file";
export type {
  SetupInitializeInput,
  AdminSettingsSaveInput,
  AdminSettingsSaveResult,
} from "./setup/env-file";
