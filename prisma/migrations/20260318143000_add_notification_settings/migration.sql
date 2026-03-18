CREATE TABLE `NotificationSettings` (
  `id` VARCHAR(191) NOT NULL,
  `globalAutomatedEmailEnabled` BOOLEAN NOT NULL DEFAULT true,
  `categoryPreferences` JSON NOT NULL,
  `automaticInvoiceRemindersEnabled` BOOLEAN NOT NULL DEFAULT true,
  `invoiceReminderFirstDelayDays` INTEGER NOT NULL DEFAULT 7,
  `invoiceReminderResendIntervalDays` INTEGER NOT NULL DEFAULT 7,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
