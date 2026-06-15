import { z } from "zod";

export const NOTIFICATION_CATEGORY_DEFINITIONS = [
  {
    key: "owner_contact",
    label: "Contact form alerts",
    description: "Automated owner emails triggered by the public contact form."
  },
  {
    key: "owner_booking_requests",
    label: "Booking request alerts",
    description: "Automated owner emails for public and student-portal booking requests."
  },
  {
    key: "customer_booking_updates",
    label: "Customer booking updates",
    description: "Automated customer emails for booking approvals, rejections, cancellations, and reschedules."
  },
  {
    key: "owner_daily_digest",
    label: "Daily digest emails",
    description: "Automated owner digest emails for upcoming bookings."
  },
  {
    key: "owner_scheduled_reports",
    label: "Scheduled reports",
    description: "Automated owner emails for scheduled admin reports."
  }
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORY_DEFINITIONS)[number]["key"];
export type NotificationCategoryPreferences = Record<NotificationCategory, boolean>;

export const FIXED_INVOICE_REMINDER_REPEAT_COUNT = 3;

export const DEFAULT_NOTIFICATION_CATEGORY_PREFERENCES: NotificationCategoryPreferences = {
  owner_contact: true,
  owner_booking_requests: true,
  customer_booking_updates: true,
  owner_daily_digest: true,
  owner_scheduled_reports: true
};

export const notificationSettingsInputSchema = z.object({
  globalAutomatedEmailEnabled: z.boolean(),
  categoryPreferences: z.object({
    owner_contact: z.boolean(),
    owner_booking_requests: z.boolean(),
    customer_booking_updates: z.boolean(),
    owner_daily_digest: z.boolean(),
    owner_scheduled_reports: z.boolean()
  }),
  automaticInvoiceRemindersEnabled: z.boolean(),
  invoiceReminderFirstDelayDays: z.coerce.number().int().min(1).max(365),
  invoiceReminderResendIntervalDays: z.coerce.number().int().min(1).max(365),
  autoCreateInvoiceOnApproval: z.boolean(),
  lessonReminderEnabled: z.boolean(),
  lessonReminderHoursBefore: z.coerce.number().int().min(1).max(168)
});

export type NotificationSettingsInput = z.infer<typeof notificationSettingsInputSchema>;

export type NotificationSettingsState = NotificationSettingsInput & {
  updatedAt: string | null;
};
