-- Existing invitations receive a compact opaque code before the column becomes required.
ALTER TABLE `plan_invites`
    ADD COLUMN `code` VARCHAR(24) NULL;

UPDATE `plan_invites`
SET `code` = LEFT(REPLACE(UUID(), '-', ''), 24)
WHERE `code` IS NULL;

ALTER TABLE `plan_invites`
    MODIFY `code` VARCHAR(24) NOT NULL,
    ADD UNIQUE INDEX `plan_invites_code_key`(`code`);
