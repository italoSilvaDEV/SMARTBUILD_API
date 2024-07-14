/*
  Warnings:

  - You are about to drop the column `workedhoursId` on the `cost_project` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `cost_project` DROP FOREIGN KEY `cost_project_workedhoursId_fkey`;

-- AlterTable
ALTER TABLE `cost_project` DROP COLUMN `workedhoursId`;
