// Reads only subscription/plan metadata over SSH; evaluates current local consumers.
// No names, emails, purchase tokens, credentials or database rows are printed or saved.
require('ts-node/register/transpile-only');
const {execFileSync}=require('child_process');const fs=require('fs'),vm=require('vm'),ts=require('typescript');
const decision=require('../src/services/SubscriptionAccessDecision');
const {resolveEffectivePermissions}=require('../src/utils/planPermissions');
const remote=`require('dotenv').config();const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const companies=await p.company.findMany({select:{id:true,allowedEmployees:true,extraEmployees:true,mobileSubscriptionStatus:true,Plan:{select:{id:true,name:true,validityType:true,validityDuration:true,permissionGroup:{select:{GroupPermissionsList:{select:{Permissions:{select:{description:true}}}}}}}}}});const rows=await p.subscription.findMany({select:{id:true,companyId:true,planId:true,billingProvider:true,startDate:true,endDate:true,isActive:true,paymentFailed:true,stripeSubscriptionCanceled:true,autoRenewing:true,appleBillingStatus:true}});const plans=await p.plan.findMany({select:{id:true,validityType:true}});console.log(JSON.stringify({companies,rows,plans}));})().finally(()=>p.$disconnect());`;
const encoded=Buffer.from(remote).toString('base64');
function extract(file,name,method,context){const src=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);let found;function visit(n){if((method?ts.isMethodDeclaration(n):ts.isFunctionDeclaration(n))&&n.name?.getText(src)===name)found=n;ts.forEachChild(n,visit);}visit(src);if(!found)throw Error('Consumer missing');let code=found.getText(src);if(method)code=code.replace(/^async\s+/,'async function ');return vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText+'\n'+name,context);}
(async()=>{
 const raw=execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','-i','C:/Users/riang/.ssh/smartbuild_hml_codex','root@167.114.42.154',`cd /opt/smartbuild-api && node -e "eval(Buffer.from('${encoded}','base64').toString())"`],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
 const data=JSON.parse(raw.trim());const rows=data.rows.map(r=>({...r,startDate:new Date(r.startDate),endDate:new Date(r.endDate)}));
 const now=Date.now();class FixedDate extends Date {constructor(...args){super(args.length?args[0]:now);}static now(){return now;}}
 const result={companies:0,consumerDifferences:0,allowed:0,expired:0,issues:{},conflictProfiles:{},providers:{}};
 for(const company of data.companies){
  const prisma={user:{findUnique:async()=>({company})},company:{findUnique:async()=>company},userCompany:{findUnique:async()=>({office:{name:'Owner',userPermissions:[]}})},subscription:{findMany:async({where,take})=>rows.filter(r=>r.companyId===where.companyId&&r.isActive===where.isActive&&!(where.NOT&&data.plans.find(p=>p.id===r.planId)?.validityType==='FREE'&&r.endDate<=where.NOT.endDate.lte)).sort((a,b)=>b.startDate-a.startDate).slice(0,take)}};
  const context={prisma,...decision,resolveEffectivePermissions,observeSubscriptionAccess:async()=>{},Date:FixedDate,console:{error:()=>{throw Error('Consumer failed');}}};
  const mobile=extract('src/controllers/mobile/MobileAuthController.ts','getCompanyStatus',false,context);
  const web=extract('src/controllers/User/UserController.ts','getLocalSubscriptionsStatus',true,context);
  let body;await web({userId:'fixture-reader',params:{userId:'fixture-reader',company_id:company.id}},{json(x){body=x;return this;},status(){throw Error('Unexpected HTTP failure');}});
  const app=await mobile(company.id);
  const normalize=(s,plan)=>JSON.stringify({plan,subscription:s.subscription?.id,isExpired:s.isExpired,paymentFailed:s.paymentFailed,stripeSubscriptionCanceled:s.stripeSubscriptionCanceled,permissions:s.permissions,issue:s.accessIssue});
  if(normalize(body,body.plan)!==normalize(app,app.planInfo))result.consumerDifferences++;
  result.companies++;result[body.isExpired?'expired':'allowed']++;
  if(body.accessIssue){result.issues[body.accessIssue]=(result.issues[body.accessIssue]||0)+1;
 const active=rows.filter(r=>r.companyId===company.id&&r.isActive);const key=JSON.stringify({issue:body.accessIssue,companyPlanType:company.Plan?.validityType??null,activeCount:active.length,subscriptionPlanTypes:active.map(r=>data.plans.find(p=>p.id===r.planId)?.validityType??null).sort(),withFutureEnd:active.filter(r=>r.endDate.getTime()>now).length});result.conflictProfiles[key]=(result.conflictProfiles[key]||0)+1;
}
 }
 for(const r of rows)result.providers[r.billingProvider]=(result.providers[r.billingProvider]||0)+1;
 console.log(JSON.stringify(result));
 if(result.consumerDifferences)process.exitCode=1;
})().catch(()=>{console.error('Read-only comparison failed; no customer data printed.');process.exitCode=1;});
