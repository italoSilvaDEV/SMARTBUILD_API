-- Invite-only plans remain hidden from public plan selection and can be
-- redeemed through one active, single-use invitation at a time.
ALTER TABLE `Plan`
    ADD COLUMN `isInviteOnly` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `plan_invites` (
    `id` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'USED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    `activePlanKey` VARCHAR(191) NULL,
    `createdByUserId` VARCHAR(191) NULL,
    `usedByCompanyId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `plan_invites_activePlanKey_key`(`activePlanKey`),
    INDEX `plan_invites_planId_createdAt_idx`(`planId`, `createdAt`),
    INDEX `plan_invites_status_idx`(`status`),
    INDEX `plan_invites_createdByUserId_idx`(`createdByUserId`),
    INDEX `plan_invites_usedByCompanyId_idx`(`usedByCompanyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `plan_invites`
    ADD CONSTRAINT `plan_invites_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `plan_invites`
    ADD CONSTRAINT `plan_invites_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `plan_invites`
    ADD CONSTRAINT `plan_invites_usedByCompanyId_fkey`
    FOREIGN KEY (`usedByCompanyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
