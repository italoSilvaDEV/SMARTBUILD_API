import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import vm from 'vm';
function load(verify:any,refresh:any,legacy:any){
 const source=fs.readFileSync(path.join(__dirname,'MobileAuthController.ts'),'utf8');const ast=ts.createSourceFile('mobile.ts',source,99,true);
 const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='MobileAuthController') as ts.ClassDeclaration;
 const method=cls.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='appleWebhook')!;
 return vm.runInNewContext(ts.transpileModule(`class Controller {${method.getText(ast)}};new Controller()`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,{billingCoordinationEnabled:()=>true,decodeJwtPayload:JSON.parse,verifyApplePurchase:verify,findExistingStoreSubscription:async()=>({id:'owned-sub'}),refreshAppleBillingStatus:refresh,updateExistingStoreSubscription:legacy,console:{error(){}}});
}
test.each(['EXPIRED','REFUND','REVOKE','DID_RENEW','DID_FAIL_TO_RENEW'])('notification %s uses authoritative current state instead of trusting its outer event label',async notificationType=>{
 const verify=jest.fn(async()=>({active:true})),refresh=jest.fn(),legacy=jest.fn();const res:any={status:jest.fn(),json:jest.fn()};res.status.mockReturnValue(res);
 await load(verify,refresh,legacy).appleWebhook({body:{signedPayload:JSON.stringify({notificationType,data:{signedTransactionInfo:'receipt'}})}},res);
 expect(verify).toHaveBeenCalledWith({signedTransactionInfo:'receipt'});expect(refresh).toHaveBeenCalledWith('owned-sub');expect(legacy).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(200);
});
test('provider verification failure cannot apply notification state',async()=>{
 const refresh=jest.fn(),legacy=jest.fn(),res:any={status:jest.fn(),json:jest.fn()};res.status.mockReturnValue(res);
 await load(async()=>{throw Error('offline');},refresh,legacy).appleWebhook({body:{signedPayload:JSON.stringify({data:{signedTransactionInfo:'receipt'}})}},res);
 expect(refresh).not.toHaveBeenCalled();expect(legacy).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(500);
});
