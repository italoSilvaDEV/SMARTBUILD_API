/*
  Warnings:

  - Made the column `projectId` on table `ProjectStages` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `ProjectStages` DROP FOREIGN KEY `ProjectStages_projectId_fkey`;

-- AlterTable
ALTER TABLE `ProjectStages` MODIFY `projectId` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `ProjectStages` ADD CONSTRAINT `ProjectStages_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
