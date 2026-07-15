ALTER TABLE `images_attachments`
  ADD COLUMN `workOrderId` VARCHAR(191) NULL,
  ADD INDEX `images_attachments_workOrderId_idx` (`workOrderId`),
  ADD CONSTRAINT `images_attachments_workOrderId_fkey`
    FOREIGN KEY (`workOrderId`) REFERENCES `work_order` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
