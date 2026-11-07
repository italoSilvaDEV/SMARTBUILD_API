import { Request } from 'express';
import Jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { verifyRegistrationToken } from '../utils/publicAccessTokens';
import { BillingAttemptError } from './BillingPurchaseCoordinator';

/** Same actor/role rules as subscription management, with the existing signup capability. */
export async function authorizeBillingCheckout(req:Request, companyId:string) {
  let userId:string;
  try {
    if(req.body.registrationToken) {
      const token=verifyRegistrationToken(req.body.registrationToken);
      if(token.companyId!==companyId) throw new Error();
      userId=token.userId;
    } else {
      const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if(!token || !process.env.SECRET_JWT) throw new Error();
      const claims=Jwt.verify(token,process.env.SECRET_JWT,{algorithms:['HS256']});
      if(typeof claims==='string' || claims.purpose || claims.type) throw new Error();
      userId=claims.id||claims.sub;
      if(typeof userId!=='string') throw new Error();
    }
  } catch {throw new BillingAttemptError('BILLING_AUTH_REQUIRED','stripe',401);}
  const actor=await prisma.user.findUnique({where:{id:userId},
    select:{isDisabled:true,company_id:true,office:{select:{name:true,company_id:true}},
      companies:{select:{companyId:true,office:{select:{name:true}}}}}});
  const master=actor && !actor.isDisabled && actor.office?.name?.trim().toLowerCase()==='master'
    && actor.office.company_id==null && actor.company_id==null && actor.companies.length===0;
  const office=actor?.companies.find(link=>link.companyId===companyId)?.office.name
    ?? (actor?.company_id===companyId?actor.office?.name:null);
  if(!actor || actor.isDisabled || (!master && !['owner','administrator'].includes(office?.trim().toLowerCase()||'')))
    throw new BillingAttemptError('BILLING_COMPANY_AUTHORITY_REQUIRED','stripe',403);
}
