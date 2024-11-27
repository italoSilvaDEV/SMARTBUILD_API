-- AlterTable
ALTER TABLE `User` ADD COLUMN `projectId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `_projectResponsibles` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_projectResponsibles_AB_unique`(`A`, `B`),
    INDEX `_projectResponsibles_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_projectResponsibles` ADD CONSTRAINT `_projectResponsibles_A_fkey` FOREIGN KEY (`A`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_projectResponsibles` ADD CONSTRAINT `_projectResponsibles_B_fkey` FOREIGN KEY (`B`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
