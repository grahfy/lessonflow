import { z } from "zod";
import type {
  Booking,
  BookingRequest,
  BookingRescheduleRequest,
  LearningMaterial
} from "@/generated/prisma/client";
import { nullableOptionalCustomDurationMinutesSchema } from "@/lib/booking-rules";
import {
  lessonPlanSectionSchema,
  studentPortalLessonPlanV2SummarySchema,
  type StudentPortalLessonPlanV2Summary
} from "@/lib/lesson-plan-contract";

const studentPortalLessonModeSchema = z.enum(["in_person", "video"]);
const studentPortalLessonDurationSchema = z.enum(["min30", "min60"]);
const studentPortalBookingStatusSchema = z.enum(["approved", "cancelled"]);
const studentPortalMaterialTypeSchema = z.enum(["audio", "pdf", "image", "guitar_pro"]);

export const studentPortalMaterialSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  materialType: studentPortalMaterialTypeSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  // `folderId` is the canonical tree location (null = student root). `bookingId`
  // context remains available via the owning booking; folders are the grouping axis.
  folderId: z.string().nullable(),
  // Shared display order within the folder. REQUIRED, deliberately not
  // `.default(0)`: a default on an output schema lets a server that forgets to
  // map the field silently emit 0 for every row, destroying the order with no
  // error anywhere.
  sortOrder: z.number().int(),
  createdAt: z.string().datetime({ offset: true }),
  downloadUrl: z.string().min(1),
  previewUrl: z.string().min(1)
});

/**
 * Student reorder request. Deliberately has NO `customerId` (taken from the
 * session) and NO folder-mutation fields: students may place and order their
 * own materials, never restructure the teacher's folder hierarchy.
 */
export const studentReorderRequestSchema = z.object({
  folderId: z.string().trim().min(1).nullable(),
  movedId: z.string().trim().min(1).nullable(),
  // 200 mirrors REORDER_MAX_IDS; not imported because this module is bundled
  // into client components and `reorder.ts` pulls in prisma.
  orderedIds: z.array(z.string().min(1)).min(1).max(200)
});

/**
 * A single tag on a library item, surfaced for display in the student's
 * "Assigned by teacher" area (e.g. Decade:80s, Style:Rock).
 */
export const studentPortalLibraryItemTagSchema = z.object({
  category: z.string(),
  value: z.string()
});

/**
 * A LibraryItem assigned to the student by a teacher. Still NOT the same shape
 * as `studentPortalMaterialSchema` — library items are shared-by-reference
 * masters with no `bookingId` context, and their `id` is the `LibraryItem.id`
 * used to build the `/api/student/library/{id}/download` URLs. They now DO
 * carry `folderId`/`sortOrder`: placement lives on the `LibraryAssignment` join
 * row, so an assigned item sits in the student's folder tree beside per-customer
 * materials without the shared master being copied or altered.
 * `createdAt` is the ASSIGNMENT time (when the student received the item), not
 * the item's own creation time.
 */
export const studentPortalLibraryItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  materialType: studentPortalMaterialTypeSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  folderId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime({ offset: true }),
  downloadUrl: z.string().min(1),
  previewUrl: z.string().min(1),
  tags: z.array(studentPortalLibraryItemTagSchema)
});

/**
 * Recursive folder tree node for the read-only student materials tree (AC-10).
 * Each node carries the ids of materials placed directly in it; the materials
 * themselves live in the flat `materials`/`standaloneMaterials` arrays and are
 * grouped by `folderId` on the client (C0: folder is the only grouping axis).
 */
export type StudentPortalFolder = {
  id: string;
  parentId: string | null;
  name: string;
  children: StudentPortalFolder[];
};

export const studentPortalFolderSchema: z.ZodType<StudentPortalFolder> = z.lazy(() =>
  z.object({
    id: z.string(),
    parentId: z.string().nullable(),
    name: z.string(),
    children: z.array(studentPortalFolderSchema)
  })
);

/**
 * Pending reschedule request attached to an upcoming booking. Carried per-booking
 * so the portal can show "reschedule requested" state and suppress a second
 * request without a separate lookup.
 */
export const studentPortalPendingRescheduleSchema = z.object({
  id: z.string(),
  requestedStartAt: z.string().datetime({ offset: true }),
  reason: z.string().nullable(),
  status: z.literal("pending"),
  createdAt: z.string().datetime({ offset: true })
});

export const studentPortalBookingSchema = z.object({
  id: z.string(),
  status: studentPortalBookingStatusSchema,
  lessonMode: studentPortalLessonModeSchema,
  skillLevel: z.enum(["beginner", "intermediate", "advanced"]),
  lessonDuration: studentPortalLessonDurationSchema,
  customDurationMinutes: z.number().int().min(15).max(300).nullable(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  notes: z.string().nullable(),
  notesContent: z.record(z.unknown()).nullable(),
  lessonPlanSummary: studentPortalLessonPlanV2SummarySchema.nullable(),
  materials: z.array(studentPortalMaterialSchema),
  pendingReschedule: studentPortalPendingRescheduleSchema.nullable(),
  // Attendance is only set on past lessons by admin; null until marked.
  attendanceStatus: z.enum(["attended", "no_show"]).nullable().default(null)
});

export const studentPortalPendingRequestSchema = z.object({
  id: z.string(),
  requestedStartAt: z.string().datetime({ offset: true }),
  lessonMode: studentPortalLessonModeSchema,
  lessonDuration: studentPortalLessonDurationSchema,
  customDurationMinutes: z.number().int().min(15).max(300).nullable(),
  // "waitlisted" mirrors a request parked on the admin waitlist (BookingRequestStatus.waitlisted).
  status: z.enum(["pending", "waitlisted"])
});

// A single usable prepaid lesson-credit batch shown to the student. Only
// non-expired batches with credits remaining are surfaced.
export const studentPortalCreditBatchSchema = z.object({
  id: z.string(),
  durationMinutes: z.number().int().positive().nullable(),
  remainingQuantity: z.number().int().nonnegative(),
  expiresAt: z.string().datetime({ offset: true }).nullable()
});

// Summary of the student's currently-usable prepaid lesson credits.
export const studentPortalLessonCreditsSchema = z.object({
  totalRemaining: z.number().int().nonnegative(),
  batches: z.array(studentPortalCreditBatchSchema)
});

export const studentPortalPayloadSchema = z.object({
  student: z.object({
    id: z.string(),
    fullName: z.string(),
    postcode: z.string()
  }),
  now: z.string().datetime({ offset: true }),
  upcoming: z.array(studentPortalBookingSchema),
  previous: z.array(studentPortalBookingSchema),
  standaloneMaterials: z.array(studentPortalMaterialSchema),
  folders: z.array(studentPortalFolderSchema),
  // Library items assigned to the student by a teacher. A SEPARATE array from the
  // per-student folder tree so LibraryItem ids never collide with folder-tree
  // material ids. Optional so clients/tests that predate the library remain valid.
  assignedByTeacher: z.array(studentPortalLibraryItemSchema).optional(),
  pendingRequests: z.array(studentPortalPendingRequestSchema),
  // Optional so portal clients/tests that predate prepaid credits remain valid.
  lessonCredits: studentPortalLessonCreditsSchema.optional(),
  // Monetary account-credit balance in cents (from redeemed vouchers etc.).
  // Optional so payloads that predate vouchers remain valid; defaults to 0.
  accountCreditCents: z.number().int().nonnegative().optional()
});

export const studentPortalBookingRequestInputSchema = z.object({
  requestedStartAt: z.string().datetime({ offset: true }),
  lessonMode: studentPortalLessonModeSchema.optional(),
  lessonDuration: studentPortalLessonDurationSchema.default("min60"),
  customDurationMinutes: nullableOptionalCustomDurationMinutesSchema,
  notes: z.string().trim().max(1000).optional()
});

export const studentPortalBookingRequestResponseSchema = z.object({
  request: z.object({
    id: z.string(),
    status: z.literal("pending"),
    requestedStartAt: z.string().datetime({ offset: true })
  }),
  partial: z.boolean().optional(),
  warning: z.string().optional(),
  deliveryStatus: z.string().optional()
});

export const studentPortalCancelBookingResponseSchema = z.object({
  booking: z.object({
    id: z.string(),
    status: z.literal("cancelled"),
    cancelledAt: z.string().datetime({ offset: true }).nullable()
  })
});

export const studentPortalRescheduleRequestInputSchema = z.object({
  requestedStartAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(1000).optional()
});

export const studentPortalRescheduleRequestResponseSchema = z.object({
  rescheduleRequest: z.object({
    id: z.string(),
    bookingId: z.string(),
    status: z.literal("pending"),
    requestedStartAt: z.string().datetime({ offset: true })
  }),
  partial: z.boolean().optional(),
  warning: z.string().optional(),
  deliveryStatus: z.string().optional()
});

export type StudentPortalMaterial = z.infer<typeof studentPortalMaterialSchema>;
export type StudentPortalLibraryItem = z.infer<typeof studentPortalLibraryItemSchema>;
export type StudentPortalPendingReschedule = z.infer<typeof studentPortalPendingRescheduleSchema>;
export type StudentPortalBooking = z.infer<typeof studentPortalBookingSchema>;
export type StudentPortalPendingRequest = z.infer<typeof studentPortalPendingRequestSchema>;
export type StudentPortalPayload = z.infer<typeof studentPortalPayloadSchema>;
export type StudentPortalLessonCredits = z.infer<typeof studentPortalLessonCreditsSchema>;
export type StudentPortalCreditBatch = z.infer<typeof studentPortalCreditBatchSchema>;
export type StudentPortalBookingRequestInput = z.infer<typeof studentPortalBookingRequestInputSchema>;
export type StudentPortalBookingRequestResponse = z.infer<typeof studentPortalBookingRequestResponseSchema>;
export type StudentPortalCancelBookingResponse = z.infer<typeof studentPortalCancelBookingResponseSchema>;
export type StudentPortalRescheduleRequestInput = z.infer<typeof studentPortalRescheduleRequestInputSchema>;
export type StudentPortalRescheduleRequestResponse = z.infer<typeof studentPortalRescheduleRequestResponseSchema>;

type MaterialMapInput = Pick<
  LearningMaterial,
  | "id"
  | "title"
  | "description"
  | "materialType"
  | "mimeType"
  | "sizeBytes"
  | "folderId"
  | "sortOrder"
  | "createdAt"
>;

type BookingMapInput = Pick<
  Booking,
  | "id"
  | "status"
  | "lessonMode"
  | "skillLevel"
  | "lessonDuration"
  | "customDurationMinutes"
  | "startAt"
  | "endAt"
  | "notes"
  | "notesContent"
  | "attendanceStatus"
> & {
  lessonPlan?: {
    sections: unknown;
    status: string;
    quickCaptureNotes: string | null;
  } | null;
  learningMaterials: MaterialMapInput[];
  // Pending reschedule requests for this booking. Application logic guarantees at
  // most one pending request per booking, so the portal surfaces the first.
  rescheduleRequests?: Pick<
    BookingRescheduleRequest,
    "id" | "requestedStartAt" | "reason" | "status" | "createdAt"
  >[];
};

type PendingRequestMapInput = Pick<
  BookingRequest,
  "id" | "requestedStartAt" | "lessonMode" | "lessonDuration" | "customDurationMinutes" | "status"
>;

/**
 * Maps one DB learning material row to the public student-portal contract shape.
 */
export function mapStudentPortalMaterial(material: MaterialMapInput): StudentPortalMaterial {
  return studentPortalMaterialSchema.parse({
    id: material.id,
    title: material.title,
    description: material.description,
    materialType: material.materialType,
    mimeType: material.mimeType,
    sizeBytes: material.sizeBytes,
    folderId: material.folderId,
    sortOrder: material.sortOrder,
    createdAt: material.createdAt.toISOString(),
    downloadUrl: `/api/student/learning-materials/${material.id}/download`,
    previewUrl: `/api/student/learning-materials/${material.id}/download?disposition=inline`
  });
}

type LibraryAssignmentMapInput = {
  createdAt: Date;
  folderId: string | null;
  sortOrder: number;
  libraryItem: {
    id: string;
    title: string;
    description: string | null;
    materialType: StudentPortalMaterial["materialType"];
    mimeType: string;
    sizeBytes: number;
    tags?: { tag: { category: string; value: string } }[];
  };
};

/**
 * Maps one LibraryAssignment (with its LibraryItem + tags) to the "Assigned by
 * teacher" contract shape. `id` is the LibraryItem id (drives the download URLs)
 * and `createdAt` is the ASSIGNMENT time (when the student received it).
 */
export function mapStudentPortalLibraryItem(assignment: LibraryAssignmentMapInput): StudentPortalLibraryItem {
  const item = assignment.libraryItem;
  return studentPortalLibraryItemSchema.parse({
    id: item.id,
    title: item.title,
    description: item.description,
    materialType: item.materialType,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    folderId: assignment.folderId,
    sortOrder: assignment.sortOrder,
    createdAt: assignment.createdAt.toISOString(),
    downloadUrl: `/api/student/library/${item.id}/download`,
    previewUrl: `/api/student/library/${item.id}/download?disposition=inline`,
    tags: (item.tags ?? []).map((join) => ({ category: join.tag.category, value: join.tag.value }))
  });
}

/**
 * Maps one DB folder row to the student-portal folder contract (children attached
 * by the tree builder). Used to serialize the read-only materials tree (AC-10).
 */
export function mapStudentPortalFolder(folder: {
  id: string;
  parentId: string | null;
  name: string;
  children: StudentPortalFolder[];
}): StudentPortalFolder {
  return studentPortalFolderSchema.parse({
    id: folder.id,
    parentId: folder.parentId,
    name: folder.name,
    children: folder.children
  });
}

/**
 * Builds the student-safe lesson-plan summary for one booking.
 * Filters to student-visible sections only.
 */
export function mapStudentPortalLessonPlanSummary(
  lessonPlan: { sections: unknown; status: string; quickCaptureNotes: string | null } | null | undefined
): StudentPortalLessonPlanV2Summary | null {
  if (!lessonPlan) return null;

  const rawSections = Array.isArray(lessonPlan.sections) ? lessonPlan.sections : [];
  const parsed = rawSections
    .map((s) => lessonPlanSectionSchema.safeParse(s))
    .filter((r) => r.success)
    .map((r) => r.data)
    .filter((s) => s.visibility === "student_visible")
    .filter((s) => s.content.content.length > 0);

  const quickCaptureNotes = lessonPlan.quickCaptureNotes?.trim() || null;

  if (parsed.length === 0 && !quickCaptureNotes) return null;

  return studentPortalLessonPlanV2SummarySchema.parse({
    sections: parsed.map((s) => ({ key: s.key, title: s.title, content: s.content })),
    quickCaptureNotes
  });
}

/**
 * Maps one DB booking row (with materials) to the student-portal booking contract.
 */
export function mapStudentPortalBooking(booking: BookingMapInput): StudentPortalBooking {
  const pendingReschedule =
    booking.rescheduleRequests?.find((requestRow) => requestRow.status === "pending") ?? null;

  return studentPortalBookingSchema.parse({
    id: booking.id,
    status: booking.status,
    lessonMode: booking.lessonMode,
    skillLevel: booking.skillLevel,
    lessonDuration: booking.lessonDuration,
    customDurationMinutes: booking.customDurationMinutes,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    notes: booking.notes,
    notesContent: booking.notesContent ?? null,
    lessonPlanSummary: mapStudentPortalLessonPlanSummary(booking.lessonPlan),
    materials: booking.learningMaterials.map(mapStudentPortalMaterial),
    attendanceStatus: booking.attendanceStatus ?? null,
    pendingReschedule: pendingReschedule
      ? {
          id: pendingReschedule.id,
          requestedStartAt: pendingReschedule.requestedStartAt.toISOString(),
          reason: pendingReschedule.reason,
          status: "pending",
          createdAt: pendingReschedule.createdAt.toISOString()
        }
      : null
  });
}

/**
 * Maps one pending booking-request row to the student-portal pending-request contract.
 */
export function mapStudentPortalPendingRequest(requestRow: PendingRequestMapInput): StudentPortalPendingRequest {
  return studentPortalPendingRequestSchema.parse({
    id: requestRow.id,
    requestedStartAt: requestRow.requestedStartAt.toISOString(),
    lessonMode: requestRow.lessonMode,
    lessonDuration: requestRow.lessonDuration,
    customDurationMinutes: requestRow.customDurationMinutes,
    status: requestRow.status
  });
}

/**
 * Parses unknown JSON into the student-portal payload contract.
 */
export function parseStudentPortalPayload(input: unknown): StudentPortalPayload {
  return studentPortalPayloadSchema.parse(input);
}

