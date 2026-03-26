ALTER TABLE `LessonPlanMaterialLink`
  MODIFY `fieldKey` ENUM('lessonFocus', 'goals', 'activities', 'homework', 'sharedNotes') NOT NULL;
