/*
  Warnings:

  - You are about to drop the column `service_id` on the `cost_project` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `cost_project` DROP FOREIGN KEY `cost_project_service_id_fkey`;

-- AlterTable
ALTER TABLE `cost_project` DROP COLUMN `service_id`;
