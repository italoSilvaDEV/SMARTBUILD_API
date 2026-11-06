CREATE TABLE `AndroidBillingAttempt` (
  `id` VARCHAR(36) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `country` VARCHAR(2) NOT NULL,
  `externalTransactionToken` LONGTEXT NOT NULL,
  `checkoutId` VARCHAR(191) NULL,
  `subscriptionId` VARCHAR(191) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AndroidBillingAttempt_checkoutId_key` (`checkoutId`),
  INDEX `AndroidBillingAttempt_companyId_status_idx` (`companyId`, `status`),
  INDEX `AndroidBillingAttempt_subscriptionId_createdAt_idx` (`subscriptionId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AndroidBillingReport` (
  `id` VARCHAR(64) NOT NULL,
  `subscriptionId` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `attemptId` VARCHAR(36) NOT NULL,
  `payload` JSON NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `AndroidBillingReport_status_nextAttemptAt_idx` (`status`, `nextAttemptAt`),
  INDEX `AndroidBillingReport_subscriptionId_createdAt_idx` (`subscriptionId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
