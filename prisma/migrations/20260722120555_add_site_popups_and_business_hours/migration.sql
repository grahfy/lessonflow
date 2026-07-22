-- CreateTable
CREATE TABLE `SitePopup` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `heading` VARCHAR(191) NOT NULL,
    `bodyHtml` TEXT NOT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `imageAlt` VARCHAR(191) NULL,
    `ctaLabel` VARCHAR(191) NULL,
    `ctaUrl` VARCHAR(191) NULL,
    `formFactor` ENUM('modal', 'corner', 'bar') NOT NULL DEFAULT 'modal',
    `animation` ENUM('fade', 'slide_up', 'slide_in_right', 'zoom', 'bounce', 'pulse') NOT NULL DEFAULT 'fade',
    `backgroundColor` VARCHAR(191) NOT NULL DEFAULT '#ffffff',
    `textColor` VARCHAR(191) NOT NULL DEFAULT '#111111',
    `buttonBackgroundColor` VARCHAR(191) NOT NULL DEFAULT '#2247d8',
    `buttonTextColor` VARCHAR(191) NOT NULL DEFAULT '#ffffff',
    `widthPx` INTEGER NULL,
    `cornerRadiusPx` INTEGER NULL,
    `imagePlacement` ENUM('top', 'side', 'background', 'none') NOT NULL DEFAULT 'none',
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `targetPaths` JSON NULL,
    `delaySeconds` INTEGER NOT NULL DEFAULT 0,
    `repeatPolicy` ENUM('once', 'session', 'days', 'always') NOT NULL DEFAULT 'session',
    `repeatDays` INTEGER NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SitePopup_enabled_startAt_endAt_idx`(`enabled`, `startAt`, `endAt`),
    INDEX `SitePopup_enabled_createdAt_idx`(`enabled`, `createdAt`),
    INDEX `SitePopup_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PopupDayStat` (
    `id` VARCHAR(191) NOT NULL,
    `popupId` VARCHAR(191) NOT NULL,
    `day` DATETIME(3) NOT NULL,
    `impressions` INTEGER NOT NULL DEFAULT 0,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `dismissals` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PopupDayStat_popupId_day_key`(`popupId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BusinessHours` (
    `id` VARCHAR(191) NOT NULL,
    `weekdays` JSON NOT NULL,
    `slotGranularityMinutes` INTEGER NOT NULL DEFAULT 30,
    `minimumNoticeHours` INTEGER NOT NULL DEFAULT 24,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SitePopup` ADD CONSTRAINT `SitePopup_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PopupDayStat` ADD CONSTRAINT `PopupDayStat_popupId_fkey` FOREIGN KEY (`popupId`) REFERENCES `SitePopup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
