CREATE TABLE `GeoblockingSettings` (
  `id` VARCHAR(191) NOT NULL,
  `allowedCountries` JSON NOT NULL,
  `unknownCountryMode` ENUM('allow', 'block') NOT NULL DEFAULT 'allow',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
