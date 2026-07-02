import { prisma } from "@/lib/db";
import { resolveRequestCountry } from "@/lib/geo-country";
import { log } from "@/lib/observability";
import { getRequestIpFromHeaders } from "@/lib/rate-limit";
import {
  buildDefaultGeoblockingSettingsState,
  DEFAULT_ALLOWED_COUNTRIES,
  DEFAULT_UNKNOWN_COUNTRY_MODE,
  geoblockingSettingsInputSchema,
  type GeoblockingSettingsInput,
  type GeoblockingSettingsState,
  type PublicGeoblockingEvaluation
} from "@/lib/geoblocking-settings-contract";

export const DEFAULT_GEOBLOCKING_SETTINGS_ID = "default-geoblocking-settings";
export const PUBLIC_GEOBLOCKED_MESSAGE = "This form is not currently available from your region.";

export type PublicGeoblockingSurface = "booking_requests" | "contact" | "student_portal_booking";

type GeoblockingSettingsRecord = Awaited<ReturnType<typeof prisma.geoblockingSettings.findUnique>>;

function normalizeAllowedCountries(value: unknown): string[] {
  const parsed = geoblockingSettingsInputSchema.shape.allowedCountries.safeParse(value);
  if (!parsed.success) {
    return [...DEFAULT_ALLOWED_COUNTRIES];
  }

  return parsed.data;
}

function serializeGeoblockingSettingsRecord(record: GeoblockingSettingsRecord): GeoblockingSettingsState {
  if (!record) {
    return buildDefaultGeoblockingSettingsState();
  }

  return {
    allowedCountries: normalizeAllowedCountries(record.allowedCountries),
    unknownCountryMode: record.unknownCountryMode,
    updatedAt: record.updatedAt.toISOString()
  };
}

async function hasCompletedInstall(): Promise<boolean> {
  const adminCount = await prisma.adminUser.count();
  return adminCount > 0;
}

export async function getGeoblockingSettings() {
  const existing = await prisma.geoblockingSettings.findUnique({
    where: { id: DEFAULT_GEOBLOCKING_SETTINGS_ID }
  });

  if (existing) {
    return existing;
  }

  if (!(await hasCompletedInstall())) {
    return null;
  }

  return prisma.geoblockingSettings.upsert({
    where: { id: DEFAULT_GEOBLOCKING_SETTINGS_ID },
    update: {},
    create: {
      id: DEFAULT_GEOBLOCKING_SETTINGS_ID,
      allowedCountries: DEFAULT_ALLOWED_COUNTRIES,
      unknownCountryMode: DEFAULT_UNKNOWN_COUNTRY_MODE
    }
  });
}

export async function getGeoblockingSettingsState(): Promise<GeoblockingSettingsState> {
  const settings = await getGeoblockingSettings();
  return serializeGeoblockingSettingsRecord(settings);
}

export async function saveGeoblockingSettings(input: GeoblockingSettingsInput) {
  const parsed = geoblockingSettingsInputSchema.parse(input);

  return prisma.geoblockingSettings.upsert({
    where: { id: DEFAULT_GEOBLOCKING_SETTINGS_ID },
    update: {
      allowedCountries: parsed.allowedCountries,
      unknownCountryMode: parsed.unknownCountryMode
    },
    create: {
      id: DEFAULT_GEOBLOCKING_SETTINGS_ID,
      allowedCountries: parsed.allowedCountries,
      unknownCountryMode: parsed.unknownCountryMode
    }
  });
}

export async function ensureDefaultGeoblockingSettings() {
  return getGeoblockingSettings();
}

export function serializeGeoblockingSettings(
  record: GeoblockingSettingsRecord
): GeoblockingSettingsState {
  return serializeGeoblockingSettingsRecord(record);
}

export async function evaluatePublicGeoblocking(headers: Headers): Promise<PublicGeoblockingEvaluation> {
  const [settings, resolvedCountry] = await Promise.all([
    getGeoblockingSettingsState(),
    resolveRequestCountry(headers)
  ]);

  if (!resolvedCountry.country) {
    return {
      country: null,
      allowed: settings.unknownCountryMode === "allow",
      reason: settings.unknownCountryMode === "allow" ? "unknown_allowed" : "unknown_blocked",
      unknownCountryMode: settings.unknownCountryMode
    };
  }

  const allowed = settings.allowedCountries.includes(resolvedCountry.country);

  return {
    country: resolvedCountry.country,
    allowed,
    reason: allowed ? "allowlist" : "blocked_country",
    unknownCountryMode: settings.unknownCountryMode
  };
}

export function logPublicGeoblockingBlock(
  surface: PublicGeoblockingSurface,
  headers: Headers,
  evaluation: PublicGeoblockingEvaluation
) {
  const ip = getRequestIpFromHeaders(headers);

  log("warn", "public_submission.geoblocked", {
    surface,
    country: evaluation.country,
    reason: evaluation.reason,
    unknownCountryMode: evaluation.unknownCountryMode,
    hasIp: Boolean(ip && ip !== "unknown")
  });
}
