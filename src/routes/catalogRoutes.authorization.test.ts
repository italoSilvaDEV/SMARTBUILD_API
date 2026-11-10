jest.mock('../controllers/MasterDashboard/DashboardController',()=>({DashboardController:jest.fn().mockImplementation(()=>({handle:jest.fn((_req:any,res:any)=>res.sendStatus(204))}))}));
jest.mock('../controllers/MasterDashboard/findClient',()=>{const ctor=jest.fn().mockImplementation(()=>({handle:jest.fn((_req:any,res:any)=>res.sendStatus(204))}));return {FindClientById:ctor,GetClientEditData:ctor,UpdateClientData:ctor};});
import { dashboardMasterRoutes } from './dashboardMasterRoutes';
import express from 'express';
const request = require('supertest');

jest.mock('../utils/prisma', () => ({ prisma: { user: { findUnique: jest.fn() }, subscription: { findUnique: jest.fn() } } }));
jest.mock('../middlewares/checkToken', () => ({
  checkToken: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.userId = 'session-user';
    next();
  },
}));
jest.mock('../controllers/plans/PlanController', () => { const handler=jest.fn((_req: any,res: any)=>res.sendStatus(204)); return { PlanController: jest.fn().mockImplementation(()=>({ create: handler, getAllPlans: handler, getPlanById: handler, updatePlan: handler, patchPlanStatus: handler, deletePlan: handler })) }; });
jest.mock('../controllers/permissions/PermissionController', () => { const handler=jest.fn((_req: any,res: any)=>res.sendStatus(204)); return { PermissionController: jest.fn().mockImplementation(()=>({ create: handler, getAllPermissions: handler, getPermissionById: handler, updatePermission: handler, deletePermission: handler })) }; });
jest.mock('../controllers/permissions/PermissionGroupController', () => { const handler=jest.fn((_req: any,res: any)=>res.sendStatus(204)); return { PermissionGroupController: jest.fn().mockImplementation(()=>({ create: handler, getAllPermissionGroups: handler, getGroupById: handler, updateGroup: handler, deleteGroup: handler, addPermissionsToGroup: handler, removePermissionsFromGroup: handler })) }; });
import { prisma } from '../utils/prisma';
import { planRoutes } from './planRoutes';
import { permissionRoutes } from './permissionRoutes';
import { permissionGroupRoutes } from './permissionGroupRoutes';
import { PlanController } from '../controllers/plans/PlanController';
import { PermissionController } from '../controllers/permissions/PermissionController';
import { PermissionGroupController } from '../controllers/permissions/PermissionGroupController';
const app=express(); app.use(express.json(),planRoutes,permissionRoutes,permissionGroupRoutes,dashboardMasterRoutes);
const handlers=[PlanController,PermissionController,PermissionGroupController].map(c=>(c as jest.Mock).mock.results[0].value.create);
const master={id:'session-user',name:'Master',email:'test@example.com',isDisabled:false,company_id:null,office:{name:'Master',company_id:null},companies:[]};
const routes=[['get','/master-dashboard'],['get','/client/details/company'],['get','/client/edit-data/company'],['put','/client/update/company'],['post','/plans'],['put','/plans/id'],['patch','/plans/id/status'],['delete','/plans/id'],['post','/permissions'],['put','/permissions/id'],['delete','/permissions/id'],['post','/permission-groups'],['put','/permission-groups/id'],['delete','/permission-groups/id'],['post','/permission-groups/id/permissions'],['delete','/permission-groups/id/permissions']];
beforeEach(()=>jest.clearAllMocks());
describe.each(routes)('%s %s catalog protection',(method,path)=>{
 test('requires authentication',async()=>{expect((await request(app)[method](path)).status).toBe(401);handlers.forEach(h=>expect(h).not.toHaveBeenCalled());});
 test.each(['Owner','Administrator','Worker','Master'])('rejects tenant %s even with forged body',async role=>{(prisma.user.findUnique as jest.Mock).mockResolvedValue({...master,company_id:'tenant',office:{name:role,company_id:'tenant'}});expect((await request(app)[method](path).set('Authorization','session').send({role:'Master',userId:'master'})).status).toBe(403);handlers.forEach(h=>expect(h).not.toHaveBeenCalled());});
 test('preserves platform Master',async()=>{(prisma.user.findUnique as jest.Mock).mockResolvedValue(master);expect((await request(app)[method](path).set('Authorization','session')).status).toBe(204);});
 test('denies disabled Master',async()=>{(prisma.user.findUnique as jest.Mock).mockResolvedValue({...master,isDisabled:true});expect((await request(app)[method](path).set('Authorization','session')).status).toBe(403);handlers.forEach(h=>expect(h).not.toHaveBeenCalled());});
 test('fails closed when database unavailable',async()=>{const log=jest.spyOn(console,'error').mockImplementation(()=>{});try{(prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('offline'));expect((await request(app)[method](path).set('Authorization','session')).status).toBe(500);handlers.forEach(h=>expect(h).not.toHaveBeenCalled());}finally{log.mockRestore();}});
});
test.each(['/plans','/plans/id','/permissions','/permissions/id','/permission-groups','/permission-groups/id'])('preserves public catalog reads %s',async path=>{expect((await request(app).get(path)).status).toBe(204);expect(prisma.user.findUnique).not.toHaveBeenCalled();});
