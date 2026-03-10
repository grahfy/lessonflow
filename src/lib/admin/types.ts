export type AuState = "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA";
export const AU_STATES: AuState[] = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

export type DurationChoice = "min30" | "min60" | "custom";

// Used in the multi-step manual booking form
export type ManualStep = "customer" | "lesson" | "schedule";
export const MANUAL_STEP_ORDER: ManualStep[] = ["customer", "lesson", "schedule"];
export const MANUAL_STEP_LABEL: Record<ManualStep, string> = {
    customer: "Customer",
    lesson: "Lesson",
    schedule: "Schedule & Confirm",
};

export type LearningMaterialBooking = {
    id: string;
    startAt: string;
    endAt: string;
    status: "approved" | "cancelled";
    lessonMode: "in_person" | "video";
    lessonDuration: "min30" | "min60";
    customDurationMinutes: number | null;
};

export type LearningMaterialRow = {
    id: string;
    title: string;
    description: string | null;
    bookingId: string | null;
    materialType: "audio" | "pdf" | "image";
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    previewUrl?: string;
    downloadUrl?: string;
};

export const PHONE_PATTERN = /^\d{10}$/;
export const POSTCODE_PATTERN = /^\d{4}$/;
export const LEARNING_MATERIAL_ACCEPT = ".pdf,.mp3,.m4a,.wav,.ogg,.webm,.aac,.flac,.jpg,.jpeg,.png,.gif,.webp,application/pdf,audio/*,image/jpeg,image/png,image/gif,image/webp";
