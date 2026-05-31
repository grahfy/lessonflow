import { z } from "zod";

import { GEOBLOCKING_COUNTRY_CODES, GEOBLOCKING_COUNTRY_CODE_SET } from "@/lib/geoblocking-countries";

export const GEOBLOCKING_UNKNOWN_COUNTRY_MODES = ["allow", "block"] as const;

export type UnknownCountryModeValue = (typeof GEOBLOCKING_UNKNOWN_COUNTRY_MODES)[number];

export type GeoblockingDecisionReason =
  | "allowlist"
  | "blocked_country"
  | "unknown_allowed"
  | "unknown_blocked";

export type GeoblockingSettingsState = {
  allowedCountries: string[];
  unknownCountryMode: UnknownCountryModeValue;
  updatedAt: string | null;
};

export type PublicGeoblockingEvaluation = {
  country: string | null;
  allowed: boolean;
  reason: GeoblockingDecisionReason;
  unknownCountryMode: UnknownCountryModeValue;
};

const countryCodeSchema = z.string().trim().transform((value) => value.toUpperCase());

export const geoblockingSettingsInputSchema = z.object({
  allowedCountries: z
    .array(countryCodeSchema)
    .transform((value) => Array.from(new Set(value)))
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select at least one allowed country."
        });
      }

      value.forEach((countryCode, index) => {
        if (!/^[A-Z]{2}$/.test(countryCode) || !GEOBLOCKING_COUNTRY_CODE_SET.has(countryCode)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index],
            message: "Use valid ISO alpha-2 country codes."
          });
        }
      });
    }),
  unknownCountryMode: z.enum(GEOBLOCKING_UNKNOWN_COUNTRY_MODES)
});

export type GeoblockingSettingsInput = z.infer<typeof geoblockingSettingsInputSchema>;

// Default is "allow" so that an unconfigured install (allowedCountries = every
// country) is genuinely unrestricted and never blocks the owner during setup or
// legitimate visitors behind unresolvable IPs. The practical "force an unknown
// country" bypass is closed upstream by no longer trusting spoofable client geo
// headers (see resolveRequestCountry / getRequestIpFromHeaders). Operators who
// actively restrict allowedCountries should set unknownCountryMode = "block".
export const DEFAULT_UNKNOWN_COUNTRY_MODE: UnknownCountryModeValue = "allow";

export const DEFAULT_ALLOWED_COUNTRIES = [...GEOBLOCKING_COUNTRY_CODES];

export function buildDefaultGeoblockingSettingsState(): GeoblockingSettingsState {
  return {
    allowedCountries: [...DEFAULT_ALLOWED_COUNTRIES],
    unknownCountryMode: DEFAULT_UNKNOWN_COUNTRY_MODE,
    updatedAt: null
  };
}
