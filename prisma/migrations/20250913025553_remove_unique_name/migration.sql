-- cria índice simples para não quebrar a FK
CREATE INDEX `EstimateServiceProject_estimateId_idx` ON `EstimateServiceProject`(`estimateId`);

-- DropIndex
DROP INDEX `EstimateServiceProject_estimateId_name_key` ON `EstimateServiceProject`;
