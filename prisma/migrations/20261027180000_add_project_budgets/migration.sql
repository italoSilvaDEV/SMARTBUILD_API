CREATE TABLE `project_budgets` (
  `projectId` VARCHAR(191) NOT NULL,
  `materials` DECIMAL(14,2) NULL,
  `employees` DECIMAL(14,2) NULL,
  `subcontractors` DECIMAL(14,2) NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `updatedBy` VARCHAR(191) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`projectId`),
  CONSTRAINT `project_budgets_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
