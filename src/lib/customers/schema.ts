import { z } from "zod";

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
