-- AlterTable
ALTER TABLE `project` ADD COLUMN `workContextId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `work_context` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('COMPANY', 'PERSONAL') NOT NULL,
    `label` VARCHAR(191) NULL,
    `Name` VARCHAR(191) NULL,
    `Email` VARCHAR(191) NULL,
    `street` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `zip_code` VARCHAR(191) NULL,
    `city_and_state` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `number` VARCHAR(191) NULL,
    `complement` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `location` TEXT NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `radius` DOUBLE NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `work_context_clientId_idx`(`clientId`),
    INDEX `work_context_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `project_workContextId_idx` ON `project`(`workContextId`);

-- AddForeignKey
ALTER TABLE `project` ADD CONSTRAINT `project_workContextId_fkey` FOREIGN KEY (`workContextId`) REFERENCES `work_context`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_context` ADD CONSTRAINT `work_context_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_context` ADD CONSTRAINT `work_context_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
