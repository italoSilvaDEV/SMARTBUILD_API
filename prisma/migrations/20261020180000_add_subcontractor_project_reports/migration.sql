-- AlterTable
ALTER TABLE `Activities` ADD COLUMN `externalAssignmentId` VARCHAR(191) NULL,
    ADD COLUMN `externalAssignmentTargetId` VARCHAR(191) NULL,
    ADD COLUMN `externalAssignmentType` VARCHAR(16) NULL,
    ADD COLUMN `externalProjectId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `GalleryAfter` ADD COLUMN `externalProjectId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Activities_externalProjectId_date_creation_idx` ON `Activities`(`externalProjectId`, `date_creation`);

-- CreateIndex
CREATE INDEX `GalleryAfter_externalProjectId_idx` ON `GalleryAfter`(`externalProjectId`);

-- AddForeignKey
ALTER TABLE `Activities` ADD CONSTRAINT `Activities_externalProjectId_fkey` FOREIGN KEY (`externalProjectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GalleryAfter` ADD CONSTRAINT `GalleryAfter_externalProjectId_fkey` FOREIGN KEY (`externalProjectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
