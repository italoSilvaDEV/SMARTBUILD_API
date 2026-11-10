import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import {execFileSync} from 'child_process';
const file='src/services/StripeSubscriptionItemService.ts';
// Pin the pre-coordination implementation: committing must not move the oracle.
const baseline=execFileSync('git',['show','6e030bc7d99b911f6da0d23327a9470b55cd8917:'+file],{encoding:'utf8'});
const current=fs.readFileSync(path.resolve(file),'utf8');
async function execute(source:string,oldSeats:number,newSeats:number,extra:number,injected=false){
 const calls:any[]=[];
 const db:any={company:{findUnique:async()=>({id:'company',extraEmployees:extra}),update:async(x:any)=>calls.push(['db',x])},subscription:{findFirst:async()=>({stripeSubscriptionId:'sub_existing'})}};
 const stripe={subscriptions:{retrieve:async(id:string)=>{calls.push(['retrieve',id]);return {items:{data:[{id:'extra_item',quantity:extra,price:{metadata:{type:'extra_employee'}}}]}};}},subscriptionItems:{del:async(...a:any[])=>calls.push(['del',...a]),update:async(...a:any[])=>calls.push(['update',...a])}};
 const ast=ts.createSourceFile('service.ts',source,99,true);
 const code=ast.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(ast)).join('\n');
 const exports:any={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,{exports,stripeConfig:{getClient:()=>stripe},prisma:injected?new Proxy({},{get(){throw Error('escaped transaction');}}):db,console:{log(){}}});
 await exports.StripeSubscriptionItemService.handlePlanUpgrade('company',oldSeats,newSeats,...(injected?[db]:[]));
 return JSON.parse(JSON.stringify(calls));
}
test.each([[2,10,4],[2,4,5],[6,2,4],[2,2,4],[2,6,0]])('seat upgrade %j keeps existing Stripe amounts/proration/operation order with transaction injection',async(oldSeats,newSeats,extra)=>{
 const expected=await execute(baseline,oldSeats,newSeats,extra);
 expect(await execute(current,oldSeats,newSeats,extra,true)).toEqual(expected);
 expect(await execute(current,oldSeats,newSeats,extra,false)).toEqual(expected);
});
