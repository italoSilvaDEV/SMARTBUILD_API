-- This is an empty migration.

-- Atualizar todos os registros com invoiceType NULL para "stripe"
UPDATE `Invoice`
SET `invoiceType` = 'stripe'
WHERE `invoiceType` IS NULL;