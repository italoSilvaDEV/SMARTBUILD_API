CREATE TABLE `accounts_payable` (
  `id` VARCHAR(191) NOT NULL,
  `company_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(500) NOT NULL DEFAULT '',
  `amount` DECIMAL(15, 2) NOT NULL,
  `paid_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `accounts_payable_company_id_created_at_idx`(`company_id`, `created_at`),
  INDEX `accounts_payable_company_id_paid_at_idx`(`company_id`, `paid_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `accounts_payable`
  ADD CONSTRAINT `accounts_payable_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
