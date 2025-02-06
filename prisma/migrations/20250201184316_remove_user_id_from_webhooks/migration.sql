/*
  Warnings:

  - You are about to drop the column `userId` on the `webhooks` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `webhooks` DROP FOREIGN KEY `webhooks_userId_fkey`;

-- AlterTable
ALTER TABLE `webhooks` DROP COLUMN `userId`;
