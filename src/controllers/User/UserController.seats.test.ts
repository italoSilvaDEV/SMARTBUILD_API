import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as ts from 'typescript';
import { EmployeeLimitError } from '../../helpers/employeeLimit';
jest.mock('../../utils/prisma',()=>({prisma:{}}));
function extract(relative: string, name: string, method: boolean, context: object): any {
  const file = path.resolve(__dirname, '../..', relative);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const matches: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if ((method ? ts.isMethodDeclaration(node) : ts.isFunctionDeclaration(node)) && (node as any).name?.getText(source) === name) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (matches.length !== 1) throw new Error('Expected one actual status function');
  let code = matches[0].getText(source);
  if (method) code = code.replace(/^async\s+/, 'async function ');
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js + '\n' + name, { ...context, Date, console });
}


const db:any={$transaction:jest.fn(async(write)=>{inside=true;try{return await write(db);}finally{inside=false;}}),user:{findUniqueOrThrow:jest.fn(),findUnique:jest.fn(),create:jest.fn(),update:jest.fn()},userCompany:{findFirst:jest.fn(),findMany:jest.fn(),create:jest.fn(),update:jest.fn()},office:{findUnique:jest.fn()},company:{findUnique:jest.fn()}};
const sendEmail=jest.fn();let inside=false;
const seatTransaction=jest.fn(async(_ids,_options,write)=>{inside=true;try{return await write(db);}finally{inside=false;}});
const savedPolicy=jest.fn();
function run(method:string,body:any){
 let status=200,result:any;
 const res:any={status(code:number){status=code;return this;},json(value:any){result=value;return this;}};
 const fn=extract('controllers/User/UserController.ts',method,true,{prisma:db,isMultiCompanyEnabled:async()=>true,withEmployeeSeatTransaction:seatTransaction,EmployeeLimitError,
 assertEmployeeSeatAvailable:async()=>{},countActiveEmployees:async()=>0,resolveInitialBreakPolicy:async()=>null,saveInitialBreakPolicyAssignment:savedPolicy,
 isOwnerOfficeName:(name:string)=>name==='Owner',OWNER_FULL_ACCESS_DATA:{invoiceEditAll:true},validationResult:()=>({isEmpty:()=>true}),
 bcrypt:{hashSync:()=> 'synthetic-hash',compare:async()=>true},crypto:{randomBytes:()=>({toString:()=> 'synthetic'})},sendEmail,
 NewUser:()=> 'mail',CompanyInvitation:()=> 'mail',getPresignedUrl:async()=>'',deleteFile:jest.fn(),process:{env:{}},console:{log:()=>{},error:()=>{}}});
 return fn.call({deleteFiles:jest.fn()},{userId:'manager',body},res).then(()=>({status,body:result}));
}
beforeEach(()=>{jest.clearAllMocks();inside=false;seatTransaction.mockImplementation(async(_ids,_options,write)=>{inside=true;try{return await write(db);}finally{inside=false;}});
 db.user.findUniqueOrThrow.mockResolvedValue({isDisabled:true,isExtraPaidUser:false});db.user.findUnique.mockResolvedValue(null);db.userCompany.findFirst.mockResolvedValue(null);db.userCompany.findMany.mockResolvedValue([]);
 db.office.findUnique.mockResolvedValue({name:'Worker',company_id:'company',userPermissions:[]});db.company.findUnique.mockResolvedValue({name:'Demo',allowedEmployees:2,paidShortGapEnabled:true});
 db.user.create.mockImplementation(async()=>{expect(inside).toBe(true);return {id:'created'};});db.userCompany.create.mockImplementation(async()=>{expect(inside).toBe(true);return {};});
 db.user.update.mockImplementation(async()=>({id:'existing'}));sendEmail.mockImplementation(async()=>{expect(inside).toBe(false);});});
const newBody={name:'Test',email:'test@example.invalid',office_id:'role',company_id:'company',password:'synthetic'};
test('new user and company link are persisted inside allocation transaction; email follows commit',async()=>{expect((await run('create',newBody)).status).toBe(201);expect(seatTransaction).toHaveBeenCalledTimes(1);expect(db.userCompany.create).toHaveBeenCalled();expect(sendEmail).toHaveBeenCalledTimes(1);expect(savedPolicy).toHaveBeenCalledWith(expect.objectContaining({db}));});
test('inviting existing account also allocates under the company lock',async()=>{db.user.findUnique.mockResolvedValue({id:'existing',name:'Test',email:'test@example.invalid'});expect((await run('create',newBody)).status).toBe(201);expect(seatTransaction).toHaveBeenCalledWith(['company'],{isMultiCompany:true,lockUserId:'existing'},expect.any(Function));expect(db.userCompany.create).toHaveBeenCalled();});
test.each([new EmployeeLimitError(2),Object.assign(new Error('deadlock'),{code:'P2034'})])('failed allocation sends no email and creates no user',async error=>{seatTransaction.mockRejectedValueOnce(error);expect([400,409]).toContain((await run('create',newBody)).status);expect(sendEmail).not.toHaveBeenCalled();expect(db.user.create).not.toHaveBeenCalled();expect(db.userCompany.create).not.toHaveBeenCalled();});
test('reactivation uses all linked companies and excludes the reactivated user',async()=>{db.user.findUnique.mockResolvedValue({id:'existing',name:'Test',email:'test@example.invalid',isDisabled:true,company_id:'company',office_id:'role'});db.userCompany.findMany.mockResolvedValue([{companyId:'second'}]);
 db.user.update.mockImplementation(async (args:any)=>{if(args.data.isDisabled===false)expect(inside).toBe(true);return {id:'existing'};});
 expect((await run('update',{id:'existing',name:'Test',email:'test@example.invalid',office:{id:'role'},isDisabled:false})).status).toBe(200);
 expect(seatTransaction).toHaveBeenCalledWith(expect.arrayContaining(['company','second']),{excludeUserId:'existing',isMultiCompany:true},expect.any(Function));});

test('a failed reactivation does not save a new role first',async()=>{
 db.user.findUnique.mockResolvedValue({id:'existing',email:'test@example.invalid',isDisabled:true,company_id:'company',office_id:'old'});
 seatTransaction.mockRejectedValueOnce(new EmployeeLimitError(2));
 const result=await run('update',{id:'existing',name:'Test',email:'test@example.invalid',office:{id:'role'},company_id:'company',isDisabled:false});
 expect(result.status).toBe(400);expect(db.userCompany.update).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();
});
test('role and user fields are saved together inside reactivation transaction',async()=>{
 db.user.findUnique.mockResolvedValue({id:'existing',email:'test@example.invalid',isDisabled:true,company_id:'company',office_id:'old'});
 db.userCompany.update.mockImplementation(async()=>{expect(inside).toBe(true);return {};});
 db.user.update.mockImplementation(async(args:any)=>{expect(inside).toBe(true);expect(args.data.office_id).toBe('role');return {};});
 expect((await run('update',{id:'existing',name:'Test',email:'test@example.invalid',office:{id:'role'},company_id:'company',isDisabled:false})).status).toBe(200);
 expect(db.userCompany.update).toHaveBeenCalledTimes(1);expect(db.user.update).toHaveBeenCalledTimes(1);
});
test('changing email to another existing account never creates an invitation or changes roles',async()=>{
 db.user.findUnique.mockResolvedValueOnce({id:'existing',email:'old@example.invalid',company_id:'company'}).mockResolvedValueOnce({id:'another'});
 expect((await run('update',{id:'existing',name:'Test',email:'used@example.invalid',office:{id:'role'},company_id:'company'})).status).toBe(400);
 expect(db.userCompany.create).not.toHaveBeenCalled();expect(db.userCompany.update).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();
});
