ALTER TABLE `work_order`
  MODIFY `status` ENUM('scheduled', 'in_progress', 'completed', 'canceled', 'pending', 'approved') NOT NULL DEFAULT 'pending';

UPDATE `work_order`
SET `status` = 'pending'
WHERE `status` IN ('scheduled', 'in_progress', 'completed', 'canceled');

ALTER TABLE `work_order`
  MODIFY `status` ENUM('pending', 'approved') NOT NULL DEFAULT 'pending',
  ADD COLUMN `publicToken` VARCHAR(191) NULL,
  ADD COLUMN `approvedAt` DATETIME(3) NULL;

UPDATE `work_order`
SET `publicToken` = UUID()
WHERE `publicToken` IS NULL;

ALTER TABLE `work_order`
  MODIFY `publicToken` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `work_order_publicToken_key` ON `work_order`(`publicToken`);
