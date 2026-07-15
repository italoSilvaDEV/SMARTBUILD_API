CREATE TABLE `work_order_project_manager` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `workOrderId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  UNIQUE INDEX `work_order_project_manager_workOrderId_userId_key` (`workOrderId`, `userId`),
  INDEX `work_order_project_manager_workOrderId_position_idx` (`workOrderId`, `position`),
  INDEX `work_order_project_manager_userId_idx` (`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `work_order_project_manager` (`id`, `name`, `email`, `phone`, `position`, `createdAt`, `workOrderId`, `userId`)
SELECT UUID(), COALESCE(NULLIF(wo.`projectManagerName`, ''), u.`name`), u.`email`, COALESCE(NULLIF(wo.`projectManagerPhone`, ''), u.`phone`), 0, wo.`createdAt`, wo.`id`, p.`project_manager_id`
FROM `work_order` wo
INNER JOIN `project` p ON p.`id` = wo.`projectId`
INNER JOIN `User` u ON u.`id` = p.`project_manager_id`
WHERE p.`project_manager_id` IS NOT NULL;

ALTER TABLE `work_order_project_manager`
  ADD CONSTRAINT `work_order_project_manager_workOrderId_fkey` FOREIGN KEY (`workOrderId`) REFERENCES `work_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `work_order_project_manager_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
