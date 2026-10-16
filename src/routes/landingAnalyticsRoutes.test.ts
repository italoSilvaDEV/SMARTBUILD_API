import express from 'express';
const request = require('supertest');
jest.mock('../middlewares/checkToken',()=>({checkToken:(req:any,res:any,next:any)=>req.headers.authorization ? next() : res.sendStatus(401)}));
jest.mock('../middlewares/requireMaster',()=>({requireMaster:(req:any,res:any,next:any)=>req.headers.authorization === 'master' ? next() : res.sendStatus(403)}));
jest.mock('../utils/prisma',()=>({prisma:{landingAnalyticsEvent:{createMany:jest.fn(),findMany:jest.fn()}}}));
import { prisma } from '../utils/prisma';
import { landingAnalyticsRoutes } from './landingAnalyticsRoutes';
const app=express(); app.use(landingAnalyticsRoutes);
beforeEach(()=>{process.env.LANDING_ANALYTICS_ENABLED='true';jest.clearAllMocks();(prisma.landingAnalyticsEvent.findMany as jest.Mock).mockResolvedValue([]);});
test('protects master reports and validates batches and periods',async()=>{
 expect((await request(app).get('/master/landing-analytics')).status).toBe(401);
 expect((await request(app).get('/master/landing-analytics').set('Authorization','member')).status).toBe(403);
 expect((await request(app).get('/master/landing-analytics?from=2020-01-01').set('Authorization','master')).status).toBe(400);
 expect((await request(app).post('/landing/analytics/events').send({events:[{}]})).status).toBe(400);
 expect((await request(app).get('/master/landing-analytics').set('Authorization','master')).body.sessions).toBe(0);
});
test('deduplicates ingestion and refuses a silently truncated report',async()=>{
 const e={id:'a0000000-0000-4000-8000-000000000001',sessionId:'b0000000-0000-4000-8000-000000000001',action:'session_start',environment:'development',device:'desktop',occurredAt:new Date().toISOString()};
 expect((await request(app).post('/landing/analytics/events').send({events:[e]})).status).toBe(204);
 expect(prisma.landingAnalyticsEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({skipDuplicates:true}));
 (prisma.landingAnalyticsEvent.findMany as jest.Mock).mockResolvedValue(Array(20001).fill(e));
 expect((await request(app).get('/master/landing-analytics').set('Authorization','master')).status).toBe(422);
});
