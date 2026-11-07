// Synthetic DDL compatibility test only. Never reads .env or DATABASE_URL.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const container = 'smartbuild-task50-mysql';
const database = `hml_migration_fixture_${Date.now()}`;
function sql(input, useDatabase = true) {
  return execFileSync('docker', ['exec', '-i', container, 'mysql', '-uroot', '-ptask50-local-only', '-N', '-B', ...(useDatabase ? [database] : [])],
    { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
sql(`CREATE DATABASE ${database};`, false);
sql("CREATE TABLE Office (id VARCHAR(191) PRIMARY KEY); INSERT INTO Office VALUES ('legacy'); CREATE TABLE pdf_project (id VARCHAR(191) PRIMARY KEY, uri VARCHAR(191)); INSERT INTO pdf_project VALUES ('legacy','unchanged');");
const migrations = [
  '20261106220000_explicit_office_permission_policy',
  '20261106223000_pdf_upload_ownership',
  '20261106230000_google_play_sync',
  '20261106233000_billing_purchase_coordination',
];
for (const migration of migrations) sql(fs.readFileSync(path.join(__dirname, '../prisma/migrations', migration, 'migration.sql'), 'utf8'));
assert.equal(sql("SELECT legacyPlanPermissions FROM Office WHERE id='legacy'"), '1');
sql("INSERT INTO Office(id) VALUES ('new');");
assert.equal(sql("SELECT legacyPlanPermissions FROM Office WHERE id='new'"), '0');
assert.equal(sql("SELECT CONCAT(uri,':',uploadedById IS NULL) FROM pdf_project"), 'unchanged:1');
assert.equal(sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"), '5');
assert.equal(sql("SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='BillingPurchaseAttempt' AND column_name='contractRef'"), 'YES');
sql("INSERT INTO GooglePlayPurchaseSync (id,purchaseToken,updatedAt) VALUES ('one','synthetic',NOW());");
assert.throws(() => sql("INSERT INTO GooglePlayPurchaseSync (id,purchaseToken,updatedAt) VALUES ('two','synthetic',NOW());"));
sql("INSERT INTO BillingPurchaseAttempt (companyId,id,provider,planId,requestKey,state,expiresAt,updatedAt) VALUES ('company','one','google','plan','key','reserved',NOW(),NOW());");
assert.throws(() => sql("INSERT INTO BillingPurchaseAttempt (companyId,id,provider,planId,requestKey,state,expiresAt,updatedAt) VALUES ('company','two','apple','plan','key','reserved',NOW(),NOW());"));
console.log('PASS: four actual migrations, legacy preservation, new-role default, nullable contractRef, unique token/company. Synthetic fixture retained:', database);
