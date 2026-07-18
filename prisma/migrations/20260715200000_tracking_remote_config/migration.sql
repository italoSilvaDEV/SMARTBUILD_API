-- Tracking configuration is optional at runtime: until a row exists, the API
-- continues using the existing environment/default values.
CREATE TABLE `tracking_runtime_configs` (
  `id` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(16) NOT NULL,
  `companyId` VARCHAR(191) NULL,
  `config` JSON NOT NULL,
  `updatedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `tracking_runtime_configs_companyId_key`(`companyId`),
  INDEX `tracking_runtime_configs_scope_idx`(`scope`),
  INDEX `tracking_runtime_configs_updatedByUserId_idx`(`updatedByUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracking_runtime_config_audits` (
  `id` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(16) NOT NULL,
  `companyId` VARCHAR(191) NULL,
  `action` VARCHAR(32) NOT NULL,
  `previousConfig` JSON NULL,
  `nextConfig` JSON NULL,
  `changedByUserId` VARCHAR(191) NULL,
  `changedByName` VARCHAR(191) NULL,
  `changedByEmail` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `tracking_runtime_config_audits_scope_companyId_createdAt_idx`(`scope`, `companyId`, `createdAt`),
  INDEX `tracking_runtime_config_audits_changedByUserId_createdAt_idx`(`changedByUserId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tracking_runtime_configs`
  ADD CONSTRAINT `tracking_runtime_configs_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `tracking_runtime_configs_updatedByUserId_fkey`
  FOREIGN KEY (`updatedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `tracking_runtime_config_audits`
  ADD CONSTRAINT `tracking_runtime_config_audits_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `tracking_runtime_config_audits_changedByUserId_fkey`
  FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
