CREATE TABLE `BreakPolicy` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `rules` JSON NOT NULL,
  `weekdays` JSON NOT NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `BreakPolicy_companyId_isActive_idx`(`companyId`, `isActive`),
  INDEX `BreakPolicy_companyId_isDefault_idx`(`companyId`, `isDefault`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BreakPolicyAudit` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `policyId` VARCHAR(191) NULL,
  `action` VARCHAR(40) NOT NULL,
  `snapshot` JSON NOT NULL,
  `changedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `BreakPolicyAudit_companyId_createdAt_idx`(`companyId`, `createdAt`),
  INDEX `BreakPolicyAudit_policyId_idx`(`policyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserBreakPolicyAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `policyId` VARCHAR(191) NULL,
  `mode` VARCHAR(191) NOT NULL DEFAULT 'legacy',
  `history` JSON NOT NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `UserBreakPolicyAssignment_userId_companyId_key`(`userId`, `companyId`),
  INDEX `UserBreakPolicyAssignment_companyId_policyId_idx`(`companyId`, `policyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BreakPolicy`
  ADD CONSTRAINT `BreakPolicy_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `BreakPolicyAudit`
  ADD CONSTRAINT `BreakPolicyAudit_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserBreakPolicyAssignment`
  ADD CONSTRAINT `UserBreakPolicyAssignment_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserBreakPolicyAssignment`
  ADD CONSTRAINT `UserBreakPolicyAssignment_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserBreakPolicyAssignment`
  ADD CONSTRAINT `UserBreakPolicyAssignment_policyId_fkey`
  FOREIGN KEY (`policyId`) REFERENCES `BreakPolicy`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
