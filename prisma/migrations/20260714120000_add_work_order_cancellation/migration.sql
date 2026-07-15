ALTER TABLE `work_order`
  MODIFY `status` ENUM('pending', 'approved', 'canceled') NOT NULL DEFAULT 'pending',
  ADD COLUMN `canceledAt` DATETIME(3) NULL;
