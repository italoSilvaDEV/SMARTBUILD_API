import * as documentGuard from '../middlewares/documentAccess';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as ts from 'typescript';
import * as guard from '../middlewares/companyResourceAccess';
import * as workGuard from '../middlewares/projectWorkAccess';
import * as workerGuard from '../middlewares/workerResourceAccess';
import { requireMaster } from '../middlewares/requireMaster';
import { prisma } from '../utils/prisma';
import { canUseCompanyFeature } from '../services/CompanyFeatureAccess';
const request = require('supertest');
jest.setTimeout(15000);
jest.mock('../utils/prisma',()=>({prisma:Object.fromEntries(['project','client','estimate','estimateServiceProject','invoice','invoiceItem','serviceProject','pdfProject','user','changeOrder','changeOrderService'].map(key=>[key,{findUnique:jest.fn(),findFirst:jest.fn()}]))}));
jest.mock('../services/CompanyFeatureAccess',()=>({canUseCompanyFeature:jest.fn()}));
const effect=jest.fn((_req,res)=>res.sendStatus(204));
const checkToken=(req:any,res:any,next:any)=>{if(!req.headers.authorization)return res.sendStatus(401);req.userId='session';next();};
// Execute the real route registrations and authorization middleware. Business controllers are isolated
// so a test can never send mail, upload a file or reach a payment provider.
function router(file:string,name:string){const source=fs.readFileSync(path.resolve(__dirname,file),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;const module={exports:{} as any};
 const fakeClass=function(){return new Proxy({}, {get:()=>effect});};
 const requireLocal=(id:string):any=>{
  if(id==='express')return {Router:express.Router};
  if(id.includes('companyResourceAccess'))return guard;
 if(id.includes('documentAccess'))return documentGuard;
  if(id.includes('projectWorkAccess'))return workGuard;
  if(id.includes('workerResourceAccess'))return workerGuard;
  if(id.endsWith('/checkToken'))return {checkToken};
  if(id.endsWith('/requireMaster'))return {requireMaster};
  if(id.endsWith('/publicAccess'))return {checkTokenOrEstimatePublicAccess:(req:any,res:any,next:any)=>{if(req.query.publicToken==='verified-test'){req.publicEstimateAccess=true;return next();}return checkToken(req,res,next);}};
  if(id==='multer')return ()=>({single:()=> (_q:any,_s:any,n:any)=>n(),array:()=> (_q:any,_s:any,n:any)=>n(),fields:()=> (_q:any,_s:any,n:any)=>n()});
  if(id.includes('/config/upload'))return {upload:()=>({}),uploadUtf8:()=>({})};
  if(id.includes('/config/compressImage'))return {compressImage:()=> (_q:any,_s:any,n:any)=>n()};
  if(id.includes('/controllers/'))return new Proxy({}, {get:(_t,key)=>String(key).endsWith('Controller')?new Proxy(fakeClass,{get:()=>effect}):effect});
  throw new Error('Unisolated dependency: '+id);
 };vm.runInNewContext(code,{require:requireLocal,exports:module.exports,module});return module.exports[name];}
const app=express();app.use(express.json());app.use('/estimates',router('estimateRoutes.ts','estimateRoutes'));app.use(router('invoiceRoutes.ts','invoiceRoutes'));app.use(router('projectRoutes.ts','projectRoutes'));
app.use(router('companyRoutes.ts','companyRoutes'));app.use('/extra',router('extraEmployeeRoutes.ts','extraEmployeeRoutes'));
app.use(router('customInvoiceRoutes.ts','customInvoiceRoutes'));app.use(router('customInvoicePaymentRoutes.ts','invoicePaymentRoutes'));app.use('/changes',router('changeOrderRoutes.ts','default'));
const db=prisma as any;
beforeEach(()=>{jest.clearAllMocks();db.changeOrder.findUnique.mockImplementation(async({where}:any)=>({estimateId:where.id}));db.changeOrderService.findUnique.mockImplementation(async({where}:any)=>({changeOrderId:where.id}));(canUseCompanyFeature as jest.Mock).mockResolvedValue(true);const company=(id:string)=>id.startsWith('other')?'other-company':'company';db.project.findUnique.mockImplementation(async({where}:any)=>({company_id:company(where.id)}));db.client.findUnique.mockImplementation(async({where}:any)=>({company_id:company(where.id)}));db.estimate.findUnique.mockImplementation(async({where}:any)=>({project:{company_id:company(where.id)}}));db.invoice.findUnique.mockImplementation(async({where}:any)=>({companyId:company(where.id),project:{company_id:company(where.id)}}));db.invoice.findFirst.mockResolvedValue({id:'bound'});db.invoiceItem.findUnique.mockImplementation(async({where}:any)=>({invoiceId:where.id}));db.estimateServiceProject.findUnique.mockImplementation(async({where}:any)=>({estimateId:where.id}));db.serviceProject.findUnique.mockImplementation(async({where}:any)=>({projectId:where.id}));db.pdfProject.findUnique.mockImplementation(async({where}:any)=>({project_id:where.id}));});
const cases:any[]=[
 ['post','/invoices/id/payment',{},'Invoice'],['get','/invoices/id/payment',{},'Invoice'],['put','/invoices/id/payment',{},'Invoice'],
 ['post','/changes/create',{estimateId:'id',projectId:'id',pdfId:'id'},'Estimates'],
 ['put','/changes/update',{changeOrderId:'id'},'Estimates'],['put','/changes/update-full',{changeOrderId:'id'},'Estimates'],
 ['patch','/changes/id/manual-approval',{},'Estimates'],['patch','/changes/id/remove-manual-signature',{},'Estimates'],
 ['get','/changes/by-project/id',{},'Estimates'],['delete','/changes/id/company/company',{},'Estimates'],
 ['post','/changes/service/create',{changeOrderId:'id'},'Estimates'],['get','/changes/service/id',{},'Estimates'],
 ['put','/changes/service/update',{changeOrderServiceId:'id'},'Estimates'],['delete','/changes/service/id',{},'Estimates'],['post','/changes/id/send',{},'Estimates'],
 ['post','/custom/invoice/mobile/project/id',{},'Invoice'],['put','/custom/invoice/mobile/project/id',{},'Invoice'],
 ['post','/custom/invoice/mobile/standalone',{companyId:'company'},'Invoice'],['get','/custom/invoice/mobile/id',{},'Invoice'],['put','/custom/invoice/mobile/id',{},'Invoice'],
 ['post','/custom/invoice/id',{},'Invoice'],['get','/custom/invoice/id/generate-number',{},'Invoice'],['get','/custom/invoice/global/company/generate-number',{},'Invoice'],
 ['get','/custom/invoices/id',{},'Invoice'],['post','/custom/invoice/1001/send',{companyId:'company'},'Invoice'],['post','/custom/invoice/id/cancel',{},'Invoice'],['get','/custom/invoice/1001/pdf?companyId=company',{},'Invoice'],
 ['post','/custom/invoice/1001/send-multiple',{companyId:'company'},'Invoice'],['post','/invoice/send/paid',{invoiceId:'id'},'Invoice'],['put','/custom/invoice/id',{},'Invoice'],

 ['get','/extra/company/company',{},'User Management'],['post','/extra/company/company',{},'User Management'],['post','/extra/company/company/reduce',{},'User Management'],['post','/costproject/find',{company_id:'company'},'Projects'],
 ['get','/invoice/id',{},'Invoice'],['post','/invoice/id/send',{},'Invoice'],['post','/invoice/id/cancel',{},'Invoice'],['delete','/invoice/delete/id',{},'Invoice'],['post','/invoice/create/item',{invoiceId:'id'},'Invoice'],['put','/invoice/update/item',{invoiceItemId:'id'},'Invoice'],['delete','/invoice/delete/item/id',{},'Invoice'],['patch','/invoice/link-to-project/id',{projectId:'id'},'Invoice'],
 ['get','/estimates/allestimates/company',{},'Estimates'],['post','/estimates/new-service',{estimateId:'id'},'Estimates'],['patch','/estimates/update/fields',{estimateId:'id'},'Estimates'],['put','/estimates/id',{},'Estimates'],['delete','/estimates/service/id',{},'Estimates'],['post','/estimates/id/send',{},'Estimates'],['post','/estimates/mobile/manual',{companyId:'company'},'Estimates'],['post','/estimates/create-full',{payload:JSON.stringify({project:{company_id:'company'}})},'Estimates'],['get','/estimates/id',{},'Estimates'],['patch','/estimates/id/sign',{},'Estimates'],
 ['post','/project',{company_id:'company'},'Projects'],['patch','/project/id',{},'Projects'],['get','/project/find?company_id=company',{},'Projects'],['delete','/project/delete/id',{},'Projects'],['post','/service-project',{id_project:'id'},'Projects'],['get','/project/amount-paid/id',{},'Projects'],['post','/project/id/cover-photo',{},'Projects']
];
describe.each(cases)('%s %s', (method,url,body,feature)=>{
 test('valid contract reaches controller',async()=>{expect((await request(app)[method](url).set('Authorization','session').send(body)).status).toBe(204);expect(canUseCompanyFeature).toHaveBeenCalledWith('session','company',feature);expect(effect).toHaveBeenCalledTimes(1);});
 test('direct API call with no feature is denied before effects',async()=>{(canUseCompanyFeature as jest.Mock).mockResolvedValue(false);expect((await request(app)[method](url).set('Authorization','session').send(body)).status).toBe(403);expect(effect).not.toHaveBeenCalled();});
 test('anonymous call is denied',async()=>{expect((await request(app)[method](url).send(body)).status).toBe(401);expect(effect).not.toHaveBeenCalled();});
});
// R5: each entry is a read proven by a client screen gated by that permission.
const grant=(allowed:string)=>(canUseCompanyFeature as jest.Mock).mockImplementation(async(_u:string,_c:string,f:string)=>f===allowed);
const send=(method:string,url:string,body:object)=>(request(app) as any)[method](url).set('Authorization','session').send(body);
const screenReads:[string,string,object,string[]][]=[
 ['get','/project/find?company_id=company',{},['Invoice','Time Cards','Job Schedule','Job Dispatch','Estimates']],
 ['get','/project/find/id',{},['Invoice']],
 ['get','/project/services-project/id',{},['Time Cards','Reports']],
 ['get','/time-activies?id=company',{},['Activities']],
 ['post','/project/schedule',{company_id:'company'},['Job Schedule']],
 ['post','/service-project/schedule',{company_id:'company'},['Job Dispatch']],
 ['get','/estimates/project/id',{},['Projects','Invoice']],
 ['get','/changes/by-project/id',{},['Projects']],
 ['get','/invoice/id',{},['Projects']],
];
describe.each(screenReads)('R5 %s %s',(method,url,body,features)=>{
 test.each(features)('screen permission %s reaches the read',async feature=>{grant(feature);expect((await send(method,url,body)).status).toBe(204);expect(effect).toHaveBeenCalledTimes(1);});
 test('an unrelated permission stays denied',async()=>{grant('Catalog');expect((await send(method,url,body)).status).toBe(403);expect(effect).not.toHaveBeenCalled();});
});
test.each([
 ['Invoice','post','/project',{company_id:'company'}],['Invoice','patch','/project/id',{}],['Invoice','delete','/project/delete/id',{}],
 ['Time Cards','patch','/project/update/status',{id:'id'}],['Reports','patch','/project/id',{}],['Job Schedule','patch','/service-project/update/dates',{id:'id'}],
 ['Projects','post','/invoice/id/send',{}],['Projects','delete','/invoice/delete/id',{}],['Projects','post','/custom/invoice/id/cancel',{}],
 ['Projects','post','/changes/create',{estimateId:'id',projectId:'id',pdfId:'id'}],['Activities','get','/project/dashboard/company',{}],
 ['Invoice','get','/project/dashboard/company',{}],['Time Cards','get','/invoice/company/company',{}],['Invoice','get','/estimates/allestimates/company',{}],
])('R5 %s alone does not open %s %s',async(feature,method,url,body)=>{grant(feature as string);expect((await send(method as string,url as string,body as object)).status).toBe(403);expect(effect).not.toHaveBeenCalled();});
test('R5 a screen permission cannot read another company',async()=>{grant('Invoice');(canUseCompanyFeature as jest.Mock).mockImplementation(async(_u:string,c:string,f:string)=>f==='Invoice'&&c==='company');expect((await send('get','/project/find/other-project',{})).status).toBe(403);expect(effect).not.toHaveBeenCalled();});
test('invoice relinking cannot cross company',async()=>{expect((await request(app).patch('/invoice/link-to-project/id').set('Authorization','session').send({projectId:'other-project'})).status).toBe(403);expect(effect).not.toHaveBeenCalled();});
test('estimate service cannot come from another company',async()=>{expect((await request(app).put('/estimates/id/service/other-service').set('Authorization','session')).status).toBe(403);expect(effect).not.toHaveBeenCalled();});
test.each(['get','patch'])('verified public estimate grant preserved for %s',async method=>{const url=method==='get'?'/estimates/id?publicToken=verified-test':'/estimates/id/sign?publicToken=verified-test';expect((await request(app)[method](url)).status).toBe(204);expect(canUseCompanyFeature).not.toHaveBeenCalled();});
test('public estimate grant does not authorize administrative resend',async()=>{expect((await request(app).post('/estimates/id/resend?publicToken=verified-test')).status).toBe(401);expect(effect).not.toHaveBeenCalled();});

const adminPaths=[['post','/company/master-new-client'],['post','/company/master'],['put','/company/company'],['patch','/company/company/archive'],['put','/extra/price']];
test.each(adminPaths)('%s %s rejects company Owner before privileged effects',async(method,url)=>{db.user.findUnique.mockResolvedValue({id:'session',office:{name:'Owner',company_id:'company'},company_id:'company',companies:[]});expect((await request(app)[method](url).set('Authorization','session')).status).toBe(403);expect(effect).not.toHaveBeenCalled();});
test.each(adminPaths)('%s %s preserves platform Master',async(method,url)=>{db.user.findUnique.mockResolvedValue({id:'session',office:{name:'Master',company_id:null},company_id:null,companies:[],isDisabled:false});expect((await request(app)[method](url).set('Authorization','session')).status).toBe(204);expect(effect).toHaveBeenCalledTimes(1);});

test('change order cannot bind another company PDF',async()=>{expect((await request(app).post('/changes/create').set('Authorization','session').send({estimateId:'id',projectId:'id',pdfId:'other-pdf'})).status).toBe(403);expect(effect).not.toHaveBeenCalled();});
test.each(['/changes/id','/custom/invoices/public/id','/custom/invoices/public/id/pdf'])('existing public customer view preserved: %s',async url=>{expect((await request(app).get(url)).status).toBe(204);expect(canUseCompanyFeature).not.toHaveBeenCalled();});
