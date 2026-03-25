CREATE TABLE `LessonPlanTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `lessonFocus` TEXT NOT NULL,
  `goals` TEXT NOT NULL,
  `activities` TEXT NOT NULL,
  `homework` TEXT NOT NULL,
  `sharedNotes` TEXT NOT NULL,
  `privateNotes` TEXT NOT NULL,
  `isArchived` BOOLEAN NOT NULL DEFAULT false,
  `createdById` VARCHAR(191) NOT NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `LessonPlanTemplate_isArchived_updatedAt_idx`(`isArchived`, `updatedAt`),
  INDEX `LessonPlanTemplate_createdById_isArchived_updatedAt_idx`(`createdById`, `isArchived`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LessonPlan` (
  `id` VARCHAR(191) NOT NULL,
  `bookingId` VARCHAR(191) NOT NULL,
  `sourceTemplateId` VARCHAR(191) NULL,
  `lessonFocus` TEXT NOT NULL,
  `goals` TEXT NOT NULL,
  `activities` TEXT NOT NULL,
  `homework` TEXT NOT NULL,
  `sharedNotes` TEXT NOT NULL,
  `privateNotes` TEXT NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `LessonPlan_bookingId_key`(`bookingId`),
  INDEX `LessonPlan_sourceTemplateId_idx`(`sourceTemplateId`),
  INDEX `LessonPlan_updatedAt_idx`(`updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LessonPlanTemplate`
  ADD CONSTRAINT `LessonPlanTemplate_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `AdminUser`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LessonPlanTemplate`
  ADD CONSTRAINT `LessonPlanTemplate_updatedById_fkey`
    FOREIGN KEY (`updatedById`) REFERENCES `AdminUser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `LessonPlan`
  ADD CONSTRAINT `LessonPlan_bookingId_fkey`
    FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LessonPlan`
  ADD CONSTRAINT `LessonPlan_sourceTemplateId_fkey`
    FOREIGN KEY (`sourceTemplateId`) REFERENCES `LessonPlanTemplate`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `LessonPlan`
  ADD CONSTRAINT `LessonPlan_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `AdminUser`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LessonPlan`
  ADD CONSTRAINT `LessonPlan_updatedById_fkey`
    FOREIGN KEY (`updatedById`) REFERENCES `AdminUser`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
