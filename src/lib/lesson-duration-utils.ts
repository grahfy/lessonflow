import { getDurationMinutes } from "@/lib/booking-rules";

export function getPersistedDurationMinutes(input: {
  lessonDuration: "min30" | "min60";
  customDurationMinutes?: number | null;
}): number {
  return getDurationMinutes(input.lessonDuration, input.customDurationMinutes);
}

export function durationMinutesToBookingPayload(durationMinutes: number) {
  if (durationMinutes === 30) {
    return {
      lessonDuration: "min30" as const,
      customDurationMinutes: null
    };
  }

  if (durationMinutes === 60) {
    return {
      lessonDuration: "min60" as const,
      customDurationMinutes: null
    };
  }

  return {
    lessonDuration: "min60" as const,
    customDurationMinutes: durationMinutes
  };
}

export function durationMinutesToChoiceValue(durationMinutes: number): string {
  return String(durationMinutes);
}
