import { z } from "zod";

/**
 * Query schema for listing customers with pagination and search filters.
 */
export const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(250).default(50),
  isArchived: z.enum(["true", "false"]).optional().default("false")
});

export type ListCustomersQueryInput = z.infer<typeof listCustomersQuerySchema>;
