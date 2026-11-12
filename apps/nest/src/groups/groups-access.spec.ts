import { GroupsService } from './groups.service';
describe('accessible groups', () => {
 it('filters membership before counting projects and rejects ambiguous slugs',async () => {
  const query:any = {};
  for (const method of ['leftJoin','where','addSelect','groupBy','orderBy']) query[method] = jest.fn().mockReturnValue(query);
  query.getRawAndEntities = jest.fn().mockResolvedValue({entities:[{id:'g',ownerId:'other',slug:'same'},{id:'g2',ownerId:'other2',slug:'same'}],raw:[{projectCount:'1'},{projectCount:'1'}]});
  const service = new GroupsService({createQueryBuilder:jest.fn().mockReturnValue(query)} as never);
  const groups = await service.listAccessible('member');
  expect(query.where).toHaveBeenCalledWith('group.ownerId = :userId OR project.ownerId = :userId OR member.id IS NOT NULL',{userId:'member'});
  expect(groups[0]).toMatchObject({projectCount:1,isOwner:false});
  await expect(service.findAccessibleBySlug('member','same')).rejects.toThrow('ambiguous');
 });
});
