/*
  Warnings:

  - Added the required column `workedhoursId` to the `cost_project` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `cost_project` ADD COLUMN `workedhoursId` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `cost_project` ADD CONSTRAINT `cost_project_workedhoursId_fkey` FOREIGN KEY (`workedhoursId`) REFERENCES `worked_hours`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
