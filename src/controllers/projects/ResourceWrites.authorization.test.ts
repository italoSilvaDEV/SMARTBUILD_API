import * as documentGuard from '../../middlewares/documentAccess';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as ts from 'typescript';
import * as resourceGuard from '../../middlewares/companyResourceAccess';
import * as workGuard from '../../middlewares/projectWorkAccess';
import { prisma } from '../../utils/prisma';
import { canUseCompanyFeature } from '../../services/CompanyFeatureAccess';
jest.mock('../../utils/prisma',()=>({prisma:Object.fromEntries(['project','invoice','estimate','serviceProject','userServiceProject','invoiceCostProject','costProject','estimateServiceProject','galleryBefore','galleryAfter','pdfProject','user','changeOrder'].map(k=>[k,{findUnique:jest.fn(),findFirst:jest.fn(),findMany:jest.fn(),count:jest.fn(),create:jest.fn(),update:jest.fn(),delete:jest.fn()}]))}));
jest.mock('../../services/CompanyFeatureAccess',()=>({canUseCompanyFeature:jest.fn(),canAccessCompanySubscription:jest.fn()}));
const db=prisma as any, provider=jest.fn(), cleanup=jest.fn();let pending:any;
function load(file:string){const source=fs.readFileSync(path.join(__dirname,file),'utf8');const module={exports:{} as any};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,setImmediate:(callback:any)=>callback(),console:{log:()=>{},error:()=>{}},process:{env:{}},Buffer,require:(id:string)=>{
 if(id.endsWith('/prisma'))return {prisma:db};
 if(id.includes('companyResourceAccess'))return resourceGuard;
 if(id.includes('documentAccess'))return documentGuard;
 if(id.includes('projectWorkAccess'))return workGuard;
 if(id==='multer')return ()=>({single:()=> (q:any,s:any,cb:any)=>{pending=cb();}});
 if(id.endsWith('/config/file'))return {deleteFile:cleanup};
 if(id==='fs')return {unlink:cleanup};
 if(id==='path')return path;
 // No real provider, email, storage or credentials are loaded by this isolated controller harness.
 return new Proxy({}, {get:()=>provider});
 }});return module.exports;}
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
beforeEach(()=>{jest.resetAllMocks();pending=undefined;db.changeOrder.findUnique.mockResolvedValue({estimateId:'estimate'});db.project.findUnique.mockResolvedValue({company_id:'company'});db.invoice.findUnique.mockResolvedValue({companyId:'company'});db.estimate.findUnique.mockResolvedValue({project:{company_id:'company'}});db.serviceProject.findUnique.mockResolvedValue({projectId:'project'});});
const uploads=[
 ['../changeOrder/updatePdfChangeOrderController.ts','UpdatePdfChangeOrderController','handle',{changeOrderId:'order'}],
 ['CreatePdfProjectUploadController.ts','CreatePdfProjectController','handle',{project_id:'project'}],
 ['CreatePdfProjectUploadContractController.ts','CreatePdContractfProjectController','handle',{projectId:'project'}],
 ['CreatePdfProjectEstimateInvoiceController.ts','CreatePdfProjectEstimateInvoiceController','handle',{project_id:'project'}],
 ['../invoice/updatePdfController.ts','updatePdfInvoiceController','handle',{invoiceId:'invoice'}],
 ['../estimates/updatePdfEstimateController.ts','updatePdfEstimateController','handle',{estimateId:'estimate'}],
 ['CreateInvoiceCostProjectController.ts','CreateInvoiceCostProjectController','handle',{project_id:'project'}],
 ['GalleryServiceProjectController.ts','GalleryProjectController','create',{serviceProjectId:'service',type:'before'}],
 ['GalleryServiceProjectController.ts','GalleryProjectController','create',{serviceProjectId:'service',type:'after'}],
];
test.each(uploads as any[])('%s %s refuses upload before storage, email or mutation',async(file,name,method,body)=>{const Controller=load(file)[name];const res=response();await new Controller()[method]({userId:'worker',body,file:{path:'synthetic.tmp',filename:'synthetic.tmp'}},res);await pending;expect(res.status).toHaveBeenCalledWith(403);expect(provider).not.toHaveBeenCalled();expect(cleanup).toHaveBeenCalled();for(const model of Object.values(db) as any[])for(const op of ['create','update','delete'])expect(model[op]).not.toHaveBeenCalled();});
test.each(['removeService','updateService'])('%s binds service ID to its estimate before mutation',async method=>{const Controller=load('EstimateController.ts').EstimateController;db.estimateServiceProject.findFirst.mockResolvedValue(null);const res=response();await new Controller()[method]({params:{id:'estimate',serviceProjectId:'service'},body:{}},res);expect(db.estimateServiceProject.findFirst).toHaveBeenCalledWith({where:{id:'service',estimateId:'estimate'}});expect(res.status).toHaveBeenCalledWith(404);expect(db.estimateServiceProject.update).not.toHaveBeenCalled();expect(db.estimateServiceProject.delete).not.toHaveBeenCalled();});
test('cost search filters results and count by the authorized company',async()=>{const Controller=load('FindCostProjectController.ts').FindCostProjectController;db.costProject.findMany.mockResolvedValue([]);db.costProject.count.mockResolvedValue(0);await new Controller().handle({body:{company_id:'company'}},response());expect(db.costProject.findMany.mock.calls[0][0].where).toEqual({invoiceCostProject:{project_id:{not:null},project:{company_id:'company'}}});expect(db.costProject.count.mock.calls[0][0].where).toEqual(db.costProject.findMany.mock.calls[0][0].where);});

test.each(['before','after'])('authorized gallery %s upload is preserved',async type=>{(canUseCompanyFeature as jest.Mock).mockResolvedValue(true);provider.mockResolvedValue('synthetic-key');const C=load('GalleryServiceProjectController.ts').GalleryProjectController;const res=response();await new C().create({userId:'admin',body:{serviceProjectId:'service',type},file:{path:'synthetic.tmp'}},res);await pending;expect(provider).toHaveBeenCalledTimes(1);expect(db[type==='before'?'galleryBefore':'galleryAfter'].create).toHaveBeenCalledWith({data:expect.objectContaining({serviceProjectId:'service',url:'synthetic-key'})});expect(res.status).not.toHaveBeenCalledWith(403);});
test('authorized project PDF upload is preserved',async()=>{(canUseCompanyFeature as jest.Mock).mockResolvedValue(true);provider.mockResolvedValue('synthetic-key');db.pdfProject.create.mockResolvedValue({id:'pdf',original_file_name:'synthetic-key'});const C=load('CreatePdfProjectUploadController.ts').CreatePdfProjectController;const res=response();await new C().handle({userId:'admin',body:{project_id:'project'},file:{path:'synthetic.tmp',filename:'synthetic.tmp'}},res);await pending;expect(res.json).toHaveBeenCalledWith({id:'pdf',original_file_name:'synthetic-key'});expect(db.pdfProject.create).toHaveBeenCalledTimes(1);});
test('authorized Crew invoice cost without file retains its existing contract',async()=>{(canUseCompanyFeature as jest.Mock).mockResolvedValue(true);db.invoiceCostProject.create.mockResolvedValue({id:'cost'});const C=load('CreateInvoiceCostProjectController.ts').CreateInvoiceCostProjectController;const res=response();await new C().handle({userId:'admin',body:{project_id:'project'}},res);await pending;expect(res.json).toHaveBeenCalledWith({id:'cost',original_file_name:undefined});expect(provider).not.toHaveBeenCalled();});
test('own schedule filters all assignment kinds by authorized companies before reading',async()=>{const C=load('ProjectController.ts').ProjectController;db.userServiceProject.findMany.mockResolvedValue([]);await new C().getServiceProjectScheduleByIdUser({body:{user_id:'worker'},allowedScheduleCompanyIds:['active-company']},response());const where=db.userServiceProject.findMany.mock.calls[0][0].where;expect(where).toMatchObject({user_id:'worker',removed_at:null});expect(where.OR).toHaveLength(4);for(const branch of where.OR)expect(JSON.stringify(branch)).toContain('active-company');});
test('administrative worker schedule remains restricted to authorized companies',async()=>{const C=load('ProjectController.ts').ProjectController;db.user.findUnique.mockResolvedValue(null);db.serviceProject.findMany.mockResolvedValue([]);await new C().getWorkerSchedule({params:{id:'worker'},allowedScheduleCompanyIds:['active-company']},response());expect(db.serviceProject.findMany.mock.calls[0][0].where).toMatchObject({Project:{company_id:{in:['active-company']}},UserServiceProject:{some:{user_id:'worker',removed_at:null}}});});

test('two-stage invoice upload records authenticated author without requiring project access',async()=>{
 (canUseCompanyFeature as jest.Mock).mockImplementation(async(_u,_c,f)=>f==='Invoice');
 db.user.findUnique.mockResolvedValue({company_id:'company',companies:[]});provider.mockResolvedValue('synthetic-key');db.pdfProject.create.mockResolvedValue({id:'pdf',original_file_name:'demo.pdf',uri:'synthetic-key'});
 const C=load('CreatePdfProjectEstimateInvoiceController.ts').CreatePdfProjectEstimateInvoiceController;const res=response();
 await new C().handle({userId:'session',body:{type_pdf:'invoice',uploadedById:'attacker'},file:{path:'synthetic.tmp',filename:'synthetic.tmp',originalname:'demo.pdf'}},res);await pending;
 expect(db.pdfProject.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({uploadedById:'session',project_id:null,invoice_id:null,type_pdf:'invoice'})}));
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({id:'pdf'}));expect(cleanup).toHaveBeenCalled();
});
