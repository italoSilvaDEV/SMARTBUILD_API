-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `amountChangedAfterPayment` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `balanceRemaining` DECIMAL(65, 30) NULL,
    ADD COLUMN `lastPaymentAt` DATETIME(3) NULL,
    ADD COLUMN `totalAmountPaidQbo` DECIMAL(65, 30) NULL;

-- CreateTable
CREATE TABLE `PaymentTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `externalPaymentId` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `totalAmount` DECIMAL(65, 30) NOT NULL,
    `paymentMethodType` VARCHAR(191) NULL,
    `txnDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `companyId` VARCHAR(191) NULL,

    INDEX `PaymentTransaction_companyId_idx`(`companyId`),
    UNIQUE INDEX `PaymentTransaction_provider_externalPaymentId_key`(`provider`, `externalPaymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentApplication` (
    `id` VARCHAR(191) NOT NULL,
    `paymentTransactionId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `amountApplied` DECIMAL(65, 30) NOT NULL,
    `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentApplication_invoiceId_idx`(`invoiceId`),
    INDEX `PaymentApplication_paymentTransactionId_idx`(`paymentTransactionId`),
    UNIQUE INDEX `PaymentApplication_paymentTransactionId_invoiceId_key`(`paymentTransactionId`, `invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentApplication` ADD CONSTRAINT `PaymentApplication_paymentTransactionId_fkey` FOREIGN KEY (`paymentTransactionId`) REFERENCES `PaymentTransaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentApplication` ADD CONSTRAINT `PaymentApplication_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
