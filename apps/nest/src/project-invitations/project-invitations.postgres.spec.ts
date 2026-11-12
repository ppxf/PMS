import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { User, UserStatus } from '../users/entities/user.entity';
import { Group } from '../groups/entities/group.entity';
import { MonitoringPlatform, MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { ProjectMember } from '../project-access/project-member.entity';
import { ProjectAccessService } from '../project-access/project-access.service';
import { MailService } from '../mail/mail.service';
import { ProjectInvitation } from './project-invitation.entity';
import { ProjectInvitationsService } from './project-invitations.service';

// Opt in with a disposable PostgreSQL database. No app tables are modified.
const databaseUrl = process.env.INVITATIONS_TEST_DATABASE_URL ?? process.env.MIGRATIONS_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('PostgreSQL invitation transactions', () => {
  let admin: DataSource;
  let db: DataSource;
  let service: ProjectInvitationsService;
  let owner: User;
  let member: User;
  let other: User;
  let project: MonitoringProject;
  let group: Group;
  let deliveredToken: string;
  const mail = { sendProjectInvitation: jest.fn(async (_email: string, token: string) => { deliveredToken = token; return {}; }) };
  const schema = `invitation_test_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url: databaseUrl }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({ type: 'postgres', url: databaseUrl, schema, extra: { options: `-c search_path=${schema},public` }, entities: [User, Group, MonitoringProject, ProjectMember, ProjectInvitation], synchronize: true, installExtensions: false }).initialize();
    service = new ProjectInvitationsService(db, new ProjectAccessService(db.getRepository(MonitoringProject), db.getRepository(ProjectMember)), mail as unknown as MailService);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) { try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await admin.destroy(); } }
  });
  beforeEach(async () => {
    mail.sendProjectInvitation.mockClear();
    const users = db.getRepository(User);
    owner = await users.save(users.create({ email: `${randomUUID()}@example.com`, name: 'Owner', status: UserStatus.Active, passwordHash: 'test' }));
    member = await users.save(users.create({ email: `${randomUUID()}@example.com`, name: 'Member', status: UserStatus.Active, passwordHash: 'test' }));
    other = await users.save(users.create({ email: `${randomUUID()}@example.com`, name: 'Other', status: UserStatus.Active, passwordHash: 'test' }));
    group = await db.getRepository(Group).save({ ownerId: owner.id, name: 'Group', slug: randomUUID() });
    project = await db.getRepository(MonitoringProject).save({ groupId: group.id, ownerId: owner.id, name: 'Project', slug: 'project', platform: MonitoringPlatform.Vue, publicKey: randomUUID() });
  });
  const invite = () => service.create(owner.id, group.slug, project.slug, { email: member.email, permissions: ['project:issues:read'] });

  it('allows exactly one concurrent acceptance and prevents replay', async () => {
    const invitation = await invite();
    const results = await Promise.allSettled([service.accept(member.id, deliveredToken), service.accept(member.id, deliveredToken)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.getRepository(ProjectMember).countBy({ projectId: project.id, userId: member.id })).toBe(1);
    expect((await db.getRepository(ProjectInvitation).findOneByOrFail({ id: invitation.id })).acceptedAt).toBeInstanceOf(Date);
  });
  it('rejects mismatched accounts and expired or revoked tokens without creating members', async () => {
    const invitation = await invite();
    const token = deliveredToken;
    await expect(service.accept(other.id, token)).rejects.toThrow('verified invited email');
    await db.getRepository(ProjectInvitation).update(invitation.id, { expiresAt: new Date(0) });
    await expect(service.accept(member.id, token)).rejects.toThrow('no longer valid');
    await service.resend(owner.id, group.slug, project.slug, invitation.id);
    const resent = deliveredToken;
    await expect(service.accept(member.id, token)).rejects.toThrow('not found');
    await service.revoke(owner.id, group.slug, project.slug, invitation.id);
    await expect(service.accept(member.id, resent)).rejects.toThrow('no longer valid');
    expect(await db.getRepository(ProjectMember).countBy({ projectId: project.id })).toBe(0);
  });
  it('persists failed delivery, retries and never replaces existing member permissions', async () => {
    mail.sendProjectInvitation.mockRejectedValueOnce(new Error('SMTP unavailable') as never);
    const invitation = await invite();
    expect(invitation.deliveryStatus).toBe('failed');
    expect((await db.getRepository(ProjectInvitation).findOneByOrFail({ id: invitation.id })).deliveryStatus).toBe('failed');
    await service.resend(owner.id, group.slug, project.slug, invitation.id);
    await service.accept(member.id, deliveredToken);
    await service.updateMember(owner.id, group.slug, project.slug, member.id, ['project:metrics:read']);
    await expect(invite()).rejects.toThrow('already has project access');
    expect((await db.getRepository(ProjectMember).findOneByOrFail({ projectId: project.id, userId: member.id })).permissions).toEqual(['project:metrics:read']);
  });
  it('rejects owner invitations, owner mutation and member administration', async () => {
    await expect(service.create(owner.id, group.slug, project.slug, { email: owner.email, permissions: ['project:issues:read'] })).rejects.toThrow('already has project access');
    await expect(service.removeMember(owner.id, group.slug, project.slug, owner.id)).rejects.toThrow('cannot be edited');
    await invite();
    await service.accept(member.id, deliveredToken);
    await expect(service.members(member.id, group.slug, project.slug)).rejects.toThrow('owner required');
  });
});
