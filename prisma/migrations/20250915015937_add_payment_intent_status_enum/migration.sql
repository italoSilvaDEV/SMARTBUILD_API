/*
  Warnings:

  - You are about to alter the column `status` on the `PaymentIntentRecord` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(3))`.

*/
-- AlterTable
ALTER TABLE `PaymentIntentRecord` MODIFY `status` ENUM('requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled', 'succeeded', 'payment_failed', 'disputed') NOT NULL;
