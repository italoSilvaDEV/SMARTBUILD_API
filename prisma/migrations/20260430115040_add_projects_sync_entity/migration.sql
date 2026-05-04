-- AlterTable
ALTER TABLE `sync_execution` MODIFY `entity` ENUM('customers', 'projects', 'invoices', 'payments') NOT NULL;

-- AlterTable
ALTER TABLE `sync_preferences` MODIFY `typesEntity` ENUM('customers', 'projects', 'invoices', 'payments') NOT NULL;

-- AlterTable
ALTER TABLE `sync_status` MODIFY `entity` ENUM('customers', 'projects', 'invoices', 'payments') NOT NULL;
