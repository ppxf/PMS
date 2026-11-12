import { ConfigService } from '@nestjs/config';
import { MonitoringProjectsService } from './monitoring-projects.service';
describe('accessible project responses', () => {
 it('whitelists member fields even when entity includes credentials and config',async () => {
  const access = {requireAccess:jest.fn().mockResolvedValue({project:{id:'p',groupId:'g',name:'Project',slug:'project',platform:'vue',createdAt:new Date(),publicKey:'secret',allowedOrigins:['private'],group:{ownerId:'private'}},role:'member',permissions:['project:issues:read']})};
  const service = new MonitoringProjectsService({} as never,{} as never,new ConfigService(),access as never);
  const response = await service.findAccessibleBySlug('member','group','project');
  expect(Object.keys(response).sort()).toEqual(['id','groupId','name','slug','platform','createdAt','role','isOwner','permissions','errorMonitoringEnabled','loggingEnabled','tracingEnabled','metricsEnabled','profilesEnabled','connected','lastSeenAt'].sort());
  expect(response).not.toHaveProperty('publicKey');
 });
 it('rechecks access after membership revocation',async () => {
  const access = {requireAccess:jest.fn().mockResolvedValueOnce({project:{id:'p'},role:'member',permissions:[]}).mockRejectedValueOnce(new Error('revoked'))};
  const service = new MonitoringProjectsService({} as never,{} as never,new ConfigService(),access as never);
  await service.getAccess('u','g','p');
  await expect(service.getAccess('u','g','p')).rejects.toThrow('revoked');
  expect(access.requireAccess).toHaveBeenCalledTimes(2);
 });
});

