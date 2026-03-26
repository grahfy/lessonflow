-- AlterTable
ALTER TABLE `LessonPlan` ADD COLUMN `quickCaptureNotes` TEXT NULL,
    ADD COLUMN `sections` JSON NULL,
    ADD COLUMN `seriesId` VARCHAR(191) NULL,
    ADD COLUMN `seriesSequence` INTEGER NULL,
    ADD COLUMN `status` ENUM('draft', 'in_progress', 'complete') NOT NULL DEFAULT 'draft';

-- AlterTable
ALTER TABLE `LessonPlanTemplate` ADD COLUMN `category` ENUM('technique', 'theory', 'repertoire', 'exam_prep', 'performance', 'general') NOT NULL DEFAULT 'general',
    ADD COLUMN `instrument` VARCHAR(191) NULL,
    ADD COLUMN `sections` JSON NULL,
    ADD COLUMN `skillLevel` VARCHAR(191) NULL,
    ADD COLUMN `tags` TEXT NULL;

-- CreateTable
CREATE TABLE `HomeworkCompletion` (
    `id` VARCHAR(191) NOT NULL,
    `lessonPlanId` VARCHAR(191) NOT NULL,
    `checklistItemId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` TEXT NULL,

    INDEX `HomeworkCompletion_customerId_lessonPlanId_idx`(`customerId`, `lessonPlanId`),
    UNIQUE INDEX `HomeworkCompletion_lessonPlanId_checklistItemId_key`(`lessonPlanId`, `checklistItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonSeries` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `customerId` VARCHAR(191) NULL,
    `teacherId` VARCHAR(191) NULL,
    `totalLessons` INTEGER NOT NULL,
    `status` ENUM('active', 'completed', 'archived') NOT NULL DEFAULT 'active',
    `sourceTemplateId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LessonSeries_customerId_status_idx`(`customerId`, `status`),
    INDEX `LessonSeries_teacherId_status_idx`(`teacherId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonSeriesTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `category` ENUM('technique', 'theory', 'repertoire', 'exam_prep', 'performance', 'general') NOT NULL DEFAULT 'general',
    `skillLevel` VARCHAR(191) NULL,
    `instrument` VARCHAR(191) NULL,
    `totalLessons` INTEGER NOT NULL,
    `isArchived` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LessonSeriesTemplate_isArchived_updatedAt_idx`(`isArchived`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonSeriesTemplateStep` (
    `id` VARCHAR(191) NOT NULL,
    `seriesTemplateId` VARCHAR(191) NOT NULL,
    `lessonPlanTemplateId` VARCHAR(191) NULL,
    `sequenceNumber` INTEGER NOT NULL,
    `title` VARCHAR(191) NULL,
    `notes` TEXT NULL,

    INDEX `LessonSeriesTemplateStep_lessonPlanTemplateId_idx`(`lessonPlanTemplateId`),
    UNIQUE INDEX `LessonSeriesTemplateStep_seriesTemplateId_sequenceNumber_key`(`seriesTemplateId`, `sequenceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `LessonPlan_seriesId_seriesSequence_idx` ON `LessonPlan`(`seriesId`, `seriesSequence`);

-- CreateIndex
CREATE INDEX `LessonPlanTemplate_category_isArchived_idx` ON `LessonPlanTemplate`(`category`, `isArchived`);

-- AddForeignKey
ALTER TABLE `LessonPlan` ADD CONSTRAINT `LessonPlan_seriesId_fkey` FOREIGN KEY (`seriesId`) REFERENCES `LessonSeries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HomeworkCompletion` ADD CONSTRAINT `HomeworkCompletion_lessonPlanId_fkey` FOREIGN KEY (`lessonPlanId`) REFERENCES `LessonPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HomeworkCompletion` ADD CONSTRAINT `HomeworkCompletion_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonSeries` ADD CONSTRAINT `LessonSeries_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonSeries` ADD CONSTRAINT `LessonSeries_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonSeries` ADD CONSTRAINT `LessonSeries_sourceTemplateId_fkey` FOREIGN KEY (`sourceTemplateId`) REFERENCES `LessonSeriesTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonSeriesTemplate` ADD CONSTRAINT `LessonSeriesTemplate_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonSeriesTemplateStep` ADD CONSTRAINT `LessonSeriesTemplateStep_seriesTemplateId_fkey` FOREIGN KEY (`seriesTemplateId`) REFERENCES `LessonSeriesTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonSeriesTemplateStep` ADD CONSTRAINT `LessonSeriesTemplateStep_lessonPlanTemplateId_fkey` FOREIGN KEY (`lessonPlanTemplateId`) REFERENCES `LessonPlanTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
