import { type AdminUser } from "@/generated/prisma/client";
import { z } from "zod";

const optionalText = z.string().trim().max(5000).optional().nullable();

export const staffProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  displayName: z.string().trim().min(1).max(120),
  age: z.coerce.number().int().min(16).max(120).optional().nullable(),
  unitNumber: z.string().trim().max(30).optional().nullable(),
  houseNumber: z.string().trim().max(20).optional().default(""),
  streetName: z.string().trim().max(120).optional().default(""),
  streetType: z.string().trim().max(40).optional().default(""),
  suburb: z.string().trim().max(80).optional().default(""),
  state: z.string().trim().max(20).optional().default(""),
  postcode: z.string().trim().max(10).optional().default(""),
  instruments: optionalText,
  specialisations: optionalText,
  background: optionalText,
  musicalHistory: optionalText
});

export const createTeacherSchema = staffProfileSchema.extend({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200)
});

export const ownerUpdateStaffSchema = staffProfileSchema.extend({
  email: z.string().trim().email().max(200).optional(),
  isActive: z.boolean().optional()
}).partial();

export const selfUpdateStaffSchema = staffProfileSchema.partial();

export const staffPasswordSchema = z.object({
  password: z.string().min(8).max(200)
});

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function staffProfileDataFromInput(
  input: Partial<z.infer<typeof staffProfileSchema>> | z.infer<typeof createTeacherSchema> | z.infer<typeof ownerUpdateStaffSchema>
) {
  return {
    ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
    ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
    ...(input.age !== undefined ? { age: input.age ?? null } : {}),
    ...(input.unitNumber !== undefined ? { unitNumber: input.unitNumber?.trim() ? input.unitNumber.trim() : null } : {}),
    ...(input.houseNumber !== undefined ? { houseNumber: input.houseNumber?.trim() ?? "" } : {}),
    ...(input.streetName !== undefined ? { streetName: input.streetName?.trim() ?? "" } : {}),
    ...(input.streetType !== undefined ? { streetType: input.streetType?.trim() ?? "" } : {}),
    ...(input.suburb !== undefined ? { suburb: input.suburb?.trim() ?? "" } : {}),
    ...(input.state !== undefined ? { state: input.state?.trim() ?? "" } : {}),
    ...(input.postcode !== undefined ? { postcode: input.postcode?.trim() ?? "" } : {}),
    ...(input.instruments !== undefined ? { instruments: nullableText(input.instruments) } : {}),
    ...(input.specialisations !== undefined ? { specialisations: nullableText(input.specialisations) } : {}),
    ...(input.background !== undefined ? { background: nullableText(input.background) } : {}),
    ...(input.musicalHistory !== undefined ? { musicalHistory: nullableText(input.musicalHistory) } : {})
  };
}

export function mapStaffSummary(admin: AdminUser) {
  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    firstName: admin.firstName,
    lastName: admin.lastName,
    displayName: admin.displayName,
    instruments: admin.instruments,
    specialisations: admin.specialisations,
    profilePhotoUrl: admin.profilePhotoStorageKey ? `/api/admin/staff/${admin.id}/photo` : null
  };
}

export function mapStaffProfile(admin: AdminUser) {
  return {
    ...mapStaffSummary(admin),
    age: admin.age,
    unitNumber: admin.unitNumber,
    houseNumber: admin.houseNumber,
    streetName: admin.streetName,
    streetType: admin.streetType,
    suburb: admin.suburb,
    state: admin.state,
    postcode: admin.postcode,
    background: admin.background,
    musicalHistory: admin.musicalHistory
  };
}

export type StaffSummary = ReturnType<typeof mapStaffSummary>;
export type StaffProfile = ReturnType<typeof mapStaffProfile>;
