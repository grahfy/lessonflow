CREATE TABLE `LessonPlanMaterialLink` (
  `id` VARCHAR(191) NOT NULL,
  `lessonPlanId` VARCHAR(191) NOT NULL,
  `materialId` VARCHAR(191) NOT NULL,
  `fieldKey` ENUM('lessonFocus', 'goals', 'homework', 'sharedNotes') NOT NULL,
  `startOffset` INTEGER NOT NULL,
  `endOffset` INTEGER NOT NULL,
  `linkedText` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `LessonPlanMaterialLink_lessonPlanId_fieldKey_startOffset_idx`(`lessonPlanId`, `fieldKey`, `startOffset`),
  INDEX `LessonPlanMaterialLink_materialId_idx`(`materialId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LessonPlanMaterialLink`
  ADD CONSTRAINT `LessonPlanMaterialLink_lessonPlanId_fkey`
    FOREIGN KEY (`lessonPlanId`) REFERENCES `LessonPlan`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LessonPlanMaterialLink`
  ADD CONSTRAINT `LessonPlanMaterialLink_materialId_fkey`
    FOREIGN KEY (`materialId`) REFERENCES `LearningMaterial`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
