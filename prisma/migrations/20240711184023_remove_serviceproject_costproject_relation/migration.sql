/*
  Warnings:

  - You are about to drop the column `costProjectId` on the `ServiceProject` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `ServiceProject` DROP FOREIGN KEY `ServiceProject_costProjectId_fkey`;

-- AlterTable
ALTER TABLE `ServiceProject` DROP COLUMN `costProjectId`;
