const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const url=new URL(process.env.TASK220_TEST_DATABASE_URL||'invalid:');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/task220');
const db=new PrismaClient({datasources:{db:{url:url.href}}});
const p=require.resolve('../src/utils/prisma');require.cache[p]={id:p,filename:p,loaded:true,exports:{prisma:db}};
const {withEmployeeSeatTransaction,EmployeeLimitError}=require('../src/helpers/employeeLimit');
async function fixture(allowed=1,extra=0){const company=await db.company.create({data:{name:'Synthetic seat test',allowedEmployees:allowed,extraEmployees:extra}});const office=await db.office.create({data:{name:'Worker',company_id:company.id}});return {company,office};}
let sequence=0;
function newUser(f){return {name:'Synthetic',email:'seat-'+Date.now()+'-'+(++sequence)+'@example.invalid',password:'no-login',rules:{},office_id:f.office.id,company_id:f.company.id};}
(async()=>{
 const f=await fixture();const candidates=await Promise.all(Array.from({length:6},()=>db.user.create({data:{...newUser(f),company_id:null,isDisabled:true}})));
 const results=await Promise.allSettled(candidates.map(user=>withEmployeeSeatTransaction([f.company.id],{isMultiCompany:true,excludeUserId:user.id},async tx=>{await tx.userCompany.create({data:{companyId:f.company.id,userId:user.id,office_id:f.office.id}});return tx.user.update({where:{id:user.id},data:{isDisabled:false}});})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason instanceof EmployeeLimitError).length,5);
 assert.equal(await db.userCompany.count({where:{companyId:f.company.id}}),1);
 console.log('PASS: 6 concurrent invitations/activations => exactly 1 seat, 5 capacity rejections');
 const mixed=await fixture();const disabled=await db.user.create({data:{...newUser(mixed),isDisabled:true}});
 const race=await Promise.allSettled([
 withEmployeeSeatTransaction([mixed.company.id],{isMultiCompany:false},tx=>tx.user.create({data:newUser(mixed)})),
 withEmployeeSeatTransaction([mixed.company.id],{isMultiCompany:false,excludeUserId:disabled.id},tx=>tx.user.update({where:{id:disabled.id},data:{isDisabled:false}}))]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.user.count({where:{company_id:mixed.company.id,isDisabled:false}}),1);
 console.log('PASS: create versus reactivation compete for the same final seat');
 const extras=await fixture(1,1);for(let i=0;i<2;i++)await withEmployeeSeatTransaction([extras.company.id],{isMultiCompany:true},tx=>tx.user.create({data:newUser(extras)}));
 await assert.rejects(withEmployeeSeatTransaction([extras.company.id],{isMultiCompany:true},tx=>tx.user.create({data:newUser(extras)})),EmployeeLimitError);
 assert.equal((await db.company.findUniqueOrThrow({where:{id:extras.company.id}})).extraEmployees,1);
 await db.company.update({where:{id:extras.company.id},data:{allowedEmployees:0}});
 await assert.rejects(withEmployeeSeatTransaction([extras.company.id],{isMultiCompany:true},tx=>tx.user.create({data:newUser(extras)})),EmployeeLimitError);
 assert.equal(await db.user.count({where:{company_id:extras.company.id}}),2);
 console.log('PASS: paid extra seats preserved; over-limit downgrade blocks allocation, deletes nobody');
 const rollback=await fixture();await assert.rejects(withEmployeeSeatTransaction([rollback.company.id],{isMultiCompany:true},async tx=>{await tx.user.create({data:newUser(rollback)});throw new Error('intentional');}));assert.equal(await db.user.count({where:{company_id:rollback.company.id}}),0);
 console.log('PASS: failed allocation transaction rolls back its user');
 // Exercise the actual migration on disposable records, never a configured application database.
 await db.$executeRawUnsafe('ALTER TABLE Office DROP COLUMN legacyPlanPermissions');
 const migration=require('node:fs').readFileSync(require('node:path').join(__dirname,'../prisma/migrations/20261106220000_explicit_office_permission_policy/migration.sql'),'utf8');
 for(const statement of migration.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);
 assert.equal((await db.office.findUniqueOrThrow({where:{id:f.office.id}})).legacyPlanPermissions,true);
 const fresh=await db.office.create({data:{name:'New explicit role',company_id:f.company.id}});assert.equal(fresh.legacyPlanPermissions,false);
 console.log('PASS: actual migration preserves existing legacy roles; new roles default to explicit permissions');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
