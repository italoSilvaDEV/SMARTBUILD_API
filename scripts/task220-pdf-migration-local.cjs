// Disposable Docker fixture only. Never reads the application DATABASE_URL.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const container = 'smartbuild-task220-pdf-local';
function sql(input) {
 return execFileSync('docker', ['exec', '-i', container, 'mysql', '-uroot', '-ptask220-local-only', '-N', '-B', 'task220'], { input, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
}
assert.equal(sql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();'), '0', 'Fixture must be empty');
sql("CREATE TABLE pdf_project (id VARCHAR(191) PRIMARY KEY, uri VARCHAR(191)); INSERT INTO pdf_project VALUES ('legacy','unchanged-file');");
sql(fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261106223000_pdf_upload_ownership/migration.sql'), 'utf8'));
assert.equal(sql("SELECT CONCAT(uri, ':', IF(uploadedById IS NULL,'null','set')) FROM pdf_project WHERE id='legacy';"), 'unchanged-file:null');
sql("INSERT INTO pdf_project (id,uri,uploadedById) VALUES ('new','new-file','synthetic-user');");
assert.equal(sql("SELECT uploadedById FROM pdf_project WHERE id='new';"), 'synthetic-user');
console.log('PASS: actual PDF migration preserves legacy records and stores new upload ownership');
