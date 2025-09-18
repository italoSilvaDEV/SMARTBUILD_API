-- AlterTable
ALTER TABLE `Estimate` MODIFY `amountPaid` DECIMAL(65, 30) NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `project` MODIFY `amountPaid` DECIMAL(65, 30) NULL DEFAULT 0;
