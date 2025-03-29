/*
  Warnings:

  - A unique constraint covering the columns `[number,projectId]` on the table `ChangeOrder` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `number` to the `ChangeOrder` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `ChangeOrder` ADD COLUMN `number` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ChangeOrder_number_projectId_key` ON `ChangeOrder`(`number`, `projectId`);
