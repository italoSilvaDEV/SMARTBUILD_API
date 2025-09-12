/*
  Warnings:

  - A unique constraint covering the columns `[stripePaymentIntentId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'usd',
    ADD COLUMN `stripePaymentIntentId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `PaymentIntentRecord` (
    `id` VARCHAR(191) NOT NULL,
    `stripePaymentIntentId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `surchargeAmount` DECIMAL(65, 30) NULL,
    `currency` VARCHAR(191) NOT NULL,
    `paymentMethodType` VARCHAR(191) NULL,
    `stripeAccountId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `errorMessage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `PaymentIntentRecord_stripePaymentIntentId_key`(`stripePaymentIntentId`),
    INDEX `PaymentIntentRecord_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Invoice_stripePaymentIntentId_key` ON `Invoice`(`stripePaymentIntentId`);

-- AddForeignKey
ALTER TABLE `PaymentIntentRecord` ADD CONSTRAINT `PaymentIntentRecord_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
