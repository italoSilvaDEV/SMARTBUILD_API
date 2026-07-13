CREATE TABLE `work_order_number_sequence` (
  `companyId` VARCHAR(191) NOT NULL,
  `nextNumber` INTEGER NOT NULL DEFAULT 1029,
  PRIMARY KEY (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `work_order_settings` (
  `id` VARCHAR(191) NOT NULL,
  `terms` TEXT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `work_order_settings_companyId_key` (`companyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `work_order` (
  `id` VARCHAR(191) NOT NULL,
  `number` INTEGER NOT NULL,
  `status` ENUM('scheduled', 'in_progress', 'completed', 'canceled') NOT NULL DEFAULT 'scheduled',
  `title` VARCHAR(191) NOT NULL,
  `scope` TEXT NOT NULL,
  `startDate` DATETIME(3) NOT NULL,
  `endDate` DATETIME(3) NOT NULL,
  `assigneeType` ENUM('employee', 'subcontractor') NOT NULL,
  `assigneeId` VARCHAR(191) NOT NULL,
  `assigneeName` VARCHAR(191) NOT NULL,
  `assigneeEmail` VARCHAR(191) NULL,
  `assigneePhone` VARCHAR(191) NULL,
  `projectNumber` VARCHAR(191) NULL,
  `projectName` VARCHAR(191) NOT NULL,
  `projectAddress` TEXT NULL,
  `projectManagerName` VARCHAR(191) NULL,
  `projectManagerPhone` VARCHAR(191) NULL,
  `terms` TEXT NULL,
  `paymentTerms` TEXT NULL,
  `assigneeSignature` LONGTEXT NULL,
  `assigneeSignedAt` DATETIME(3) NULL,
  `managerSignature` LONGTEXT NULL,
  `managerSignedAt` DATETIME(3) NULL,
  `lastSentAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `work_order_companyId_number_key` (`companyId`, `number`),
  INDEX `work_order_projectId_idx` (`projectId`),
  INDEX `work_order_companyId_createdAt_idx` (`companyId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `work_order_item` (
  `id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'service',
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `quantity` DECIMAL(12, 2) NOT NULL DEFAULT 1,
  `unitPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `position` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `workOrderId` VARCHAR(191) NOT NULL,
  INDEX `work_order_item_workOrderId_position_idx` (`workOrderId`, `position`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `work_order_email_log` (
  `id` VARCHAR(191) NOT NULL,
  `recipient` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `errorMessage` TEXT NULL,
  `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `workOrderId` VARCHAR(191) NOT NULL,
  INDEX `work_order_email_log_workOrderId_sentAt_idx` (`workOrderId`, `sentAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `work_order_number_sequence` ADD CONSTRAINT `work_order_number_sequence_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `work_order_settings` ADD CONSTRAINT `work_order_settings_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `work_order` ADD CONSTRAINT `work_order_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `work_order` ADD CONSTRAINT `work_order_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `work_order_item` ADD CONSTRAINT `work_order_item_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `work_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `work_order_email_log` ADD CONSTRAINT `work_order_email_log_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `work_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
