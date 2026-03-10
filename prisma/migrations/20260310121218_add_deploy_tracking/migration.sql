-- CreateTable
CREATE TABLE `DeployUpdate` (
    `id` VARCHAR(191) NOT NULL,
    `branch` VARCHAR(191) NOT NULL,
    `release` VARCHAR(191) NOT NULL,
    `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `commit` VARCHAR(191) NOT NULL,
    `shortCommit` VARCHAR(191) NOT NULL,
    `previousCommit` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DeployUpdate_commit_key`(`commit`),
    INDEX `DeployUpdate_appliedAt_idx`(`appliedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeployCommit` (
    `id` VARCHAR(191) NOT NULL,
    `deployUpdateId` VARCHAR(191) NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `shortHash` VARCHAR(191) NOT NULL,
    `authorName` VARCHAR(191) NOT NULL,
    `authoredAt` DATETIME(3) NOT NULL,
    `subject` TEXT NOT NULL,
    `body` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeployCommit_deployUpdateId_idx`(`deployUpdateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DeployCommit` ADD CONSTRAINT `DeployCommit_deployUpdateId_fkey` FOREIGN KEY (`deployUpdateId`) REFERENCES `DeployUpdate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
