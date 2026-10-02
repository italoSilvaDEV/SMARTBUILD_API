CREATE TABLE `meta_purchase_deliveries` (
  `stripe_session_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `claimed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sent_at` DATETIME(3) NULL,
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `next_retry_at` DATETIME(3) NULL,
  PRIMARY KEY (`stripe_session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
