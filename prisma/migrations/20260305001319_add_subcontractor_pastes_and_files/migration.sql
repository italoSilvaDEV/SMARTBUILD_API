-- CreateTable
CREATE TABLE `subcontractor_pastes` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `userAuthorId` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `companyId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subcontractor_files` (
    `id` VARCHAR(191) NOT NULL,
    `file` VARCHAR(191) NULL,
    `name` TEXT NULL,
    `description` TEXT NULL,
    `type_file` ENUM('text', 'others') NOT NULL DEFAULT 'others',
    `pasteId` VARCHAR(191) NULL,
    `userAuthorId` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `companyId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `subcontractor_pastes` ADD CONSTRAINT `subcontractor_pastes_userAuthorId_fkey` FOREIGN KEY (`userAuthorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcontractor_pastes` ADD CONSTRAINT `subcontractor_pastes_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `subcontractors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcontractor_pastes` ADD CONSTRAINT `subcontractor_pastes_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcontractor_files` ADD CONSTRAINT `subcontractor_files_pasteId_fkey` FOREIGN KEY (`pasteId`) REFERENCES `subcontractor_pastes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcontractor_files` ADD CONSTRAINT `subcontractor_files_userAuthorId_fkey` FOREIGN KEY (`userAuthorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcontractor_files` ADD CONSTRAINT `subcontractor_files_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `subcontractors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcontractor_files` ADD CONSTRAINT `subcontractor_files_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
