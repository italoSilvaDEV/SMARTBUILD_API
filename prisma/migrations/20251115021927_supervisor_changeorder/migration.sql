/*
  Warnings:

  - A unique constraint covering the columns `[number,estimateId]` on the table `change_order` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `number` to the `change_order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `supervisorId` to the `change_order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `change_order` ADD COLUMN `number` INTEGER NOT NULL,
    ADD COLUMN `supervisorId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `change_order_number_estimateId_key` ON `change_order`(`number`, `estimateId`);

-- AddForeignKey
ALTER TABLE `change_order` ADD CONSTRAINT `change_order_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
