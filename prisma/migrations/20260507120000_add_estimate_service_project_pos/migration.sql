-- AlterTable
ALTER TABLE `estimateserviceproject` ADD COLUMN `pos` INTEGER NOT NULL DEFAULT 0;

SET @current_estimate_id := '';
SET @row_number := -1;

UPDATE `estimateserviceproject` esp
JOIN (
  SELECT ranked.id, ranked.pos
  FROM (
    SELECT
      ordered.id,
      @row_number := IF(@current_estimate_id = ordered.estimateId, @row_number + 1, 0) AS pos,
      @current_estimate_id := ordered.estimateId
    FROM (
      SELECT id, estimateId
      FROM `estimateserviceproject`
      ORDER BY estimateId ASC, date_creation ASC, id ASC
    ) ordered
  ) ranked
) positions ON positions.id = esp.id
SET esp.pos = positions.pos;
