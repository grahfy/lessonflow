import { z } from "zod";
import type { Booking, BookingRequest, LearningMaterial } from "@/generated/prisma/client";
import { nullableOptionalCustomDurationMinutesSchema } from "@/lib/booking-rules";
import {
  lessonPlanSectionSchema,
  studentPortalLessonPlanV2SummarySchema,
  type StudentPortalLessonPlanV2Summary
} from "@/lib/lesson-plan-contract";

const studentPortalLessonModeSchema = z.enum(["in_person", "video"]);
const studentPortalLessonDurationSchema = z.enum(["min30", "min60"]);
const studentPortalBookingStatusSchema = z.enum(["approved", "cancelled"]);
const studentPortalMaterialTypeSchema = z.enum(["audio", "pdf", "image"]);

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
  createdAt: z.string().datetime({ offset: true }),
  downloadUrl: z.string().min(1),
  previewUrl: z.string().min(1)
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
  materials: z.array(studentPortalMaterialSchema)
});

export const studentPortalPendingRequestSchema = z.object({
  id: z.string(),
  requestedStartAt: z.string().datetime({ offset: true }),
  lessonMode: studentPortalLessonModeSchema,
  lessonDuration: studentPortalLessonDurationSchema,
  customDurationMinutes: z.number().int().min(15).max(300).nullable(),
  status: z.literal("pending")
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
  pendingRequests: z.array(studentPortalPendingRequestSchema)
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

export type StudentPortalMaterial = z.infer<typeof studentPortalMaterialSchema>;
export type StudentPortalBooking = z.infer<typeof studentPortalBookingSchema>;
export type StudentPortalPendingRequest = z.infer<typeof studentPortalPendingRequestSchema>;
export type StudentPortalPayload = z.infer<typeof studentPortalPayloadSchema>;
export type StudentPortalBookingRequestInput = z.infer<typeof studentPortalBookingRequestInputSchema>;
export type StudentPortalBookingRequestResponse = z.infer<typeof studentPortalBookingRequestResponseSchema>;
export type StudentPortalCancelBookingResponse = z.infer<typeof studentPortalCancelBookingResponseSchema>;

type MaterialMapInput = Pick<
  LearningMaterial,
  "id" | "title" | "description" | "materialType" | "mimeType" | "sizeBytes" | "folderId" | "createdAt"
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
> & {
  lessonPlan?: {
    sections: unknown;
    status: string;
    quickCaptureNotes: string | null;
  } | null;
  learningMaterials: MaterialMapInput[];
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
    createdAt: material.createdAt.toISOString(),
    downloadUrl: `/api/student/learning-materials/${material.id}/download`,
    previewUrl: `/api/student/learning-materials/${material.id}/download?disposition=inline`
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
    materials: booking.learningMaterials.map(mapStudentPortalMaterial)
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

