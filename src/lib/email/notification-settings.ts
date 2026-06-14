import { prisma } from "@/lib/db";

import {
  DEFAULT_NOTIFICATION_CATEGORY_PREFERENCES,
  FIXED_INVOICE_REMINDER_REPEAT_COUNT,
  notificationSettingsInputSchema,
  type NotificationCategory,
  type NotificationCategoryPreferences,
  type NotificationSettingsInput,
  type NotificationSettingsState
} from "@/lib/email/notification-settings-contract";

export const DEFAULT_NOTIFICATION_SETTINGS_ID = "default-notification-settings";

type NotificationSettingsRecord = Awaited<ReturnType<typeof prisma.notificationSettings.findUnique>>;

export type AutomatedEmailNotificationCategory = NotificationCategory | "automatic_invoice_reminders";

export type EmailNotificationMetadata =
  | { triggerMode: "manual" }
  | { triggerMode: "automated"; category: AutomatedEmailNotificationCategory };

export type InvoiceReminderPolicy = {
  firstReminderDelayDays: number;
  resendIntervalDays: number;
  repeatCount: number;
  stages: number[];
};

function normalizeCategoryPreferences(value: unknown): NotificationCategoryPreferences {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? {
          ...DEFAULT_NOTIFICATION_CATEGORY_PREFERENCES,
          ...(value as Partial<Record<NotificationCategory, unknown>>)
        }
      : DEFAULT_NOTIFICATION_CATEGORY_PREFERENCES;

  return {
    owner_contact: input.owner_contact !== false,
    owner_booking_requests: input.owner_booking_requests !== false,
    customer_booking_updates: input.customer_booking_updates !== false,
    owner_daily_digest: input.owner_daily_digest !== false,
    owner_scheduled_reports: input.owner_scheduled_reports !== false
  };
}

export function serializeNotificationSettings(record: NotificationSettingsRecord): NotificationSettingsState {
  return {
    globalAutomatedEmailEnabled: record?.globalAutomatedEmailEnabled ?? true,
    categoryPreferences: normalizeCategoryPreferences(record?.categoryPreferences),
    automaticInvoiceRemindersEnabled: record?.automaticInvoiceRemindersEnabled ?? true,
    invoiceReminderFirstDelayDays: record?.invoiceReminderFirstDelayDays ?? 7,
    invoiceReminderResendIntervalDays: record?.invoiceReminderResendIntervalDays ?? 7,
    autoCreateInvoiceOnApproval: record?.autoCreateInvoiceOnApproval ?? false,
    updatedAt: record?.updatedAt?.toISOString() ?? null
  };
}

export async function getNotificationSettings() {
  return prisma.notificationSettings.findUnique({
    where: { id: DEFAULT_NOTIFICATION_SETTINGS_ID }
  });
}

export async function getNotificationSettingsState(): Promise<NotificationSettingsState> {
  const settings = await getNotificationSettings();
  return serializeNotificationSettings(settings);
}

export async function saveNotificationSettings(input: NotificationSettingsInput) {
  const parsed = notificationSettingsInputSchema.parse(input);

  return prisma.notificationSettings.upsert({
    where: { id: DEFAULT_NOTIFICATION_SETTINGS_ID },
    update: {
      globalAutomatedEmailEnabled: parsed.globalAutomatedEmailEnabled,
      categoryPreferences: parsed.categoryPreferences,
      automaticInvoiceRemindersEnabled: parsed.automaticInvoiceRemindersEnabled,
      invoiceReminderFirstDelayDays: parsed.invoiceReminderFirstDelayDays,
      invoiceReminderResendIntervalDays: parsed.invoiceReminderResendIntervalDays,
      autoCreateInvoiceOnApproval: parsed.autoCreateInvoiceOnApproval
    },
    create: {
      id: DEFAULT_NOTIFICATION_SETTINGS_ID,
      globalAutomatedEmailEnabled: parsed.globalAutomatedEmailEnabled,
      categoryPreferences: parsed.categoryPreferences,
      automaticInvoiceRemindersEnabled: parsed.automaticInvoiceRemindersEnabled,
      invoiceReminderFirstDelayDays: parsed.invoiceReminderFirstDelayDays,
      invoiceReminderResendIntervalDays: parsed.invoiceReminderResendIntervalDays,
      autoCreateInvoiceOnApproval: parsed.autoCreateInvoiceOnApproval
    }
  });
}

export function getInvoiceReminderPolicy(
  settings: Pick<
    NotificationSettingsState,
    "invoiceReminderFirstDelayDays" | "invoiceReminderResendIntervalDays"
  >
): InvoiceReminderPolicy {
  const firstReminderDelayDays = settings.invoiceReminderFirstDelayDays;
  const resendIntervalDays = settings.invoiceReminderResendIntervalDays;
  const stages = Array.from({ length: FIXED_INVOICE_REMINDER_REPEAT_COUNT }, (_, index) =>
    firstReminderDelayDays + resendIntervalDays * index
  );

  return {
    firstReminderDelayDays,
    resendIntervalDays,
    repeatCount: FIXED_INVOICE_REMINDER_REPEAT_COUNT,
    stages
  };
}

export function isAutomatedNotificationEnabled(
  settings: NotificationSettingsState,
  category: AutomatedEmailNotificationCategory
): boolean {
  if (!settings.globalAutomatedEmailEnabled) {
    return false;
  }

  if (category === "automatic_invoice_reminders") {
    return settings.automaticInvoiceRemindersEnabled;
  }

  return settings.categoryPreferences[category];
}
