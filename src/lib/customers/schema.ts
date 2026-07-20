import { z } from "zod";

import { auPhoneSchema, auPostcodeSchema, auStateSchema, lessonModeSchema, skillLevelSchema } from "@/lib/booking-rules";

/**
 * Builds a trimmed string validator whose "missing key" and "wrong type" errors
 * read the same as its length errors.
 *
 * RATIONALE: Zod's defaults for an absent key ("Required") and a null value
 * ("Expected string, received null") are developer strings. A customer form
 * that omits a field is the single most common 400 here, so it has to name the
 * field like every other message does.
 */
function requiredText(label: string) {
  return z.string({
    required_error: `${label} is required.`,
    invalid_type_error: `${label} is required.`
  }).trim();
}

/**
 * Customer field validators shared by the create (POST) and update (PATCH)
 * routes. Every message names the field in the same words the admin dialog
 * label uses, so a 400 can be shown inline instead of "Invalid customer payload."
 */
export const customerFieldSchemas = {
  firstName: requiredText("First name").min(1, "First name is required.").max(60, "First name must be 60 characters or fewer."),
  lastName: requiredText("Last name").min(1, "Last name is required.").max(60, "Last name must be 60 characters or fewer."),
  fullName: requiredText("Full name").min(2, "Full name must be at least 2 characters.").max(120, "Full name must be 120 characters or fewer."),
  email: requiredText("Email").email("Enter a valid email address.").max(200, "Email must be 200 characters or fewer."),
  // Labelled "Unit number", not "Unit / apartment": the summary prefixes the
  // humanized key, so a message using a different wording prints both names.
  unitNumber: requiredText("Unit number").max(20, "Unit number must be 20 characters or fewer."),
  houseNumber: requiredText("House number").max(20, "House number must be 20 characters or fewer."),
  streetName: requiredText("Street name").max(120, "Street name must be 120 characters or fewer."),
  streetType: requiredText("Street type").max(40, "Street type must be 40 characters or fewer."),
  suburb: requiredText("Suburb").max(80, "Suburb must be 80 characters or fewer."),
  requiredHouseNumber: requiredText("House number").min(1, "House number is required.").max(20, "House number must be 20 characters or fewer."),
  requiredStreetName: requiredText("Street name").min(1, "Street name is required.").max(120, "Street name must be 120 characters or fewer."),
  requiredStreetType: requiredText("Street type").min(1, "Street type is required.").max(40, "Street type must be 40 characters or fewer."),
  requiredSuburb: requiredText("Suburb").min(1, "Suburb is required.").max(80, "Suburb must be 80 characters or fewer."),
  // State and postcode wrap the shared AU validators so their "missing key"
  // errors read as prose too. Without this, an omitted key yields Zod's bare
  // "Required", which keeps the whole 400 from being summarized by field name.
  state: requiredText("State").pipe(
    z.enum(auStateSchema.options, { errorMap: () => ({ message: "Select a valid Australian state." }) })
  ),
  postcode: requiredText("Postcode").pipe(auPostcodeSchema),
  // PATCH variants: a blank is accepted here and rejected downstream only when
  // it would erase a stored value, so legacy blank-address rows stay editable.
  // Operand order matters: a union reports the FIRST branch's failure, so the
  // real validator has to lead. With `z.literal("")` first, an invalid value
  // surfaces Zod's bare "Invalid input" and one such message suppresses the
  // whole summary line.
  clearableState: z
    .enum(auStateSchema.options, { errorMap: () => ({ message: "Select a valid Australian state." }) })
    .or(z.literal("")),
  clearablePostcode: auPostcodeSchema.or(z.literal("")),
  primaryTeacherId: requiredText("Teacher").min(1, "Select a teacher, or leave the assignment empty.")
};

/**
 * Payload accepted by POST /api/admin/customers.
 *
 * Address fields are required here because the admin dialog marks them
 * required; storing "" / "VIC" / "3000" silently was the older behavior.
 */
export const createCustomerSchema = z.object({
  firstName: customerFieldSchemas.firstName,
  lastName: customerFieldSchemas.lastName,
  fullName: customerFieldSchemas.fullName,
  email: customerFieldSchemas.email,
  phone: auPhoneSchema,
  skillLevel: skillLevelSchema.default("beginner"),
  lessonMode: lessonModeSchema.default("in_person"),
  unitNumber: customerFieldSchemas.unitNumber.optional().nullable(),
  houseNumber: customerFieldSchemas.requiredHouseNumber,
  streetName: customerFieldSchemas.requiredStreetName,
  streetType: customerFieldSchemas.requiredStreetType,
  suburb: customerFieldSchemas.requiredSuburb,
  state: customerFieldSchemas.state,
  postcode: customerFieldSchemas.postcode,
  primaryTeacherId: customerFieldSchemas.primaryTeacherId.nullable().optional()
});

/**
 * Payload accepted by PATCH /api/admin/customers/[id].
 *
 * Blank address values pass validation here and are rejected by the route only
 * when they would erase a stored value, so legacy rows with partial addresses
 * stay editable for unrelated changes.
 */
export const updateCustomerSchema = z.object({
  firstName: customerFieldSchemas.firstName.optional(),
  lastName: customerFieldSchemas.lastName.optional(),
  fullName: customerFieldSchemas.fullName.optional(),
  email: customerFieldSchemas.email.optional(),
  phone: auPhoneSchema.optional(),
  skillLevel: skillLevelSchema.optional(),
  lessonMode: lessonModeSchema.optional(),
  unitNumber: customerFieldSchemas.unitNumber.optional().nullable(),
  houseNumber: customerFieldSchemas.houseNumber.optional(),
  streetName: customerFieldSchemas.streetName.optional(),
  streetType: customerFieldSchemas.streetType.optional(),
  suburb: customerFieldSchemas.suburb.optional(),
  state: customerFieldSchemas.clearableState.optional(),
  postcode: customerFieldSchemas.clearablePostcode.optional(),
  primaryTeacherId: customerFieldSchemas.primaryTeacherId.nullable().optional(),
  isArchived: z.boolean().optional()
});

export const customersSortBySchema = z.enum(["customer", "skill_mode"]);
export const customersSortDirectionSchema = z.enum(["asc", "desc"]);

/**
 * Query schema for listing customers with pagination and search filters.
 */
export const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  customerIds: z.string().trim().max(4000).optional(),
  sortBy: customersSortBySchema.default("customer"),
  sortDir: customersSortDirectionSchema.default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(250).default(50),
  isArchived: z.enum(["true", "false"]).optional().default("false")
});

export type ListCustomersQueryInput = z.infer<typeof listCustomersQuerySchema>;
export type CustomersSortBy = z.infer<typeof customersSortBySchema>;
export type CustomersSortDirection = z.infer<typeof customersSortDirectionSchema>;
