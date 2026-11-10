import { SubscriptionController } from './SubscriptionController';
jest.mock('../../utils/prisma',()=>({prisma:{subscription:{findUnique:jest.fn(),update:jest.fn()}}}));
import { prisma } from '../../utils/prisma';
const db=prisma as any;
beforeEach(()=>jest.resetAllMocks());
test.each(['stripe','apple','google'])('administrative cancellation is explicitly local for %s',async billingProvider=>{
 const row={id:'sub',companyId:'company',planId:'plan',isActive:true,billingProvider};
 db.subscription.findUnique.mockResolvedValue(row);db.subscription.update.mockResolvedValue({...row,isActive:false});
 const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()};
 await new SubscriptionController().cancelSubscription({params:{id:'sub'}} as any,res);
 expect(db.subscription.update).toHaveBeenCalledWith({where:{id:'sub'},data:{isActive:false}});
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({isActive:false,operationScope:'local',providerActionPerformed:false,message:'Local subscription deactivated. Provider billing was not canceled.'}));
});
test('missing subscription is not presented as canceled',async()=>{db.subscription.findUnique.mockResolvedValue(null);const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()};await new SubscriptionController().cancelSubscription({params:{id:'missing'}} as any,res);expect(res.status).toHaveBeenCalledWith(404);expect(db.subscription.update).not.toHaveBeenCalled();});
