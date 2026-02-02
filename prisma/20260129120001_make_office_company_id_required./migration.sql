-- Run this migration AFTER running the backfill script (backfillOfficePerCompany.ts)
-- so that every Office has company_id set.
-- After running this, update schema.prisma: Office.company_id to String (required) and company to Company (required).

-- AlterTable
ALTER TABLE `Office` MODIFY COLUMN `company_id` VARCHAR(191) NOT NULL;
