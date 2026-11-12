import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { ProjectAccessService } from '../project-access/project-access.service';
import { ProjectMember } from '../project-access/project-member.entity';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { ProjectInvitation } from './project-invitation.entity';
import { ProjectInvitationsService } from './project-invitations.service';

describe('ProjectInvitationsService', () => {
  const token = 'a'.repeat(43);
  const project = {
    id: 'project',
    ownerId: 'owner',
    slug: 'project',
    name: 'Project',
    group: { slug: 'group' },
  };
  const user = {
    id: 'member',
    status: UserStatus.Active,
    email: 'member@example.com',
    name: 'Member',
  };
  let invitation: ProjectInvitation;
  let service: ProjectInvitationsService;
  let repositories: Map<unknown, Record<string, jest.Mock>>;
  let mail: { sendProjectInvitation: jest.Mock };
  let transaction: jest.Mock;
  beforeEach(() => {
    invitation = {
      id: 'invitation',
      projectId: project.id,
      email: user.email,
      permissions: ['project:issues:read'],
      invitedBy: 'owner',
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 100000),
      acceptedAt: null,
      revokedAt: null,
      deliveryStatus: 'sent',
    } as ProjectInvitation;
    repositories = new Map();
    const repository = () => ({
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      findOneByOrFail: jest.fn(),
      findOneOrFail: jest.fn(),
      existsBy: jest.fn().mockResolvedValue(false),
      save: jest.fn(async (value) => value),
      insert: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((value) => value),
      createQueryBuilder: jest.fn(() => ({
        update: () => ({
          set: () => ({ where: () => ({ execute: jest.fn() }) }),
        }),
      })),
    });
    for (const entity of [
      ProjectInvitation,
      ProjectMember,
      MonitoringProject,
      User,
    ])
      repositories.set(entity, repository());
    repositories
      .get(ProjectInvitation)!
      .findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.tokenHash && where.tokenHash !== invitation.tokenHash
            ? null
            : invitation,
        ),
      );
    repositories.get(MonitoringProject)!.findOne.mockResolvedValue(project);
    repositories
      .get(MonitoringProject)!
      .findOneOrFail.mockResolvedValue(project);
    repositories
      .get(User)!
      .findOneBy.mockImplementation(({ id }) =>
        Promise.resolve(
          id === 'owner'
            ? { ...user, id: 'owner', email: 'owner@example.com' }
            : user,
        ),
      );
    repositories
      .get(User)!
      .findOneByOrFail.mockResolvedValue({ ...user, id: 'owner' });
    repositories.get(User)!.findOne.mockResolvedValue(null);
    const manager = {
      getRepository: (entity: unknown) => repositories.get(entity),
      save: jest.fn(async (value) => value),
    };
    transaction = jest.fn(async (callback) => callback(manager));
    const db = { manager, getRepository: manager.getRepository, transaction };
    const access = { requireOwner: jest.fn().mockResolvedValue({ project }) };
    mail = {
      sendProjectInvitation: jest.fn().mockResolvedValue({ messageId: 'ok' }),
    };
    service = new ProjectInvitationsService(
      db as unknown as DataSource,
      access as unknown as ProjectAccessService,
      mail as unknown as MailService,
    );
  });

  it('previews only the intended verified account and exposes safe fields', async () => {
    const preview = await service.preview('member', token);
    expect(preview).toMatchObject({
      email: user.email,
      projectSlug: 'project',
      groupSlug: 'group',
    });
    expect(preview).not.toHaveProperty('tokenHash');
  });
  it.each(['wrong-email', 'unverified', 'disabled'])(
    'rejects %s account',
    async (condition) => {
      repositories
        .get(User)!
        .findOneBy.mockResolvedValue({
          ...user,
          ...(condition === 'wrong-email'
            ? { email: 'other@example.com' }
            : {
                status:
                  condition === 'disabled'
                    ? UserStatus.Disabled
                    : UserStatus.PendingVerification,
              }),
        });
      await expect(service.accept('member', token)).rejects.toThrow(
        'verified invited email',
      );
      expect(repositories.get(ProjectMember)!.insert).not.toHaveBeenCalled();
    },
  );
  it.each(['expired', 'accepted', 'revoked', 'failed'])(
    'rejects %s invitations',
    async (condition) => {
      if (condition === 'expired') invitation.expiresAt = new Date(0);
      if (condition === 'accepted') invitation.acceptedAt = new Date();
      if (condition === 'revoked') invitation.revokedAt = new Date();
      if (condition === 'failed') invitation.deliveryStatus = 'failed';
      await expect(service.accept('member', token)).rejects.toThrow(
        'no longer valid',
      );
      expect(repositories.get(ProjectMember)!.insert).not.toHaveBeenCalled();
    },
  );
  it('consumes an invitation once and stores only its explicit permissions', async () => {
    await expect(service.accept('member', token)).resolves.toEqual({
      groupSlug: 'group',
      projectSlug: 'project',
    });
    expect(
      repositories.get(ProjectInvitation)!.findOne,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(repositories.get(ProjectMember)!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'member',
        permissions: ['project:issues:read'],
      }),
    );
    await expect(service.accept('member', token)).rejects.toThrow(
      'no longer valid',
    );
    expect(repositories.get(ProjectMember)!.insert).toHaveBeenCalledTimes(1);
  });
  it('never overwrites existing membership', async () => {
    repositories.get(ProjectMember)!.existsBy.mockResolvedValue(true);
    await expect(service.accept('member', token)).rejects.toThrow(
      'Already a project member',
    );
    expect(repositories.get(ProjectMember)!.insert).not.toHaveBeenCalled();
  });
  it('persists delivery failure and supports retry with an invalidated old token', async () => {
    const previousHash = invitation.tokenHash;
    mail.sendProjectInvitation.mockRejectedValueOnce(
      new Error('SMTP secret token'),
    );
    expect(
      await service.resend('owner', 'group', 'project', invitation.id),
    ).toMatchObject({ deliveryStatus: 'failed' });
    expect(invitation.tokenHash).not.toBe(previousHash);
    const failedHash = invitation.tokenHash;
    expect(
      await service.resend('owner', 'group', 'project', invitation.id),
    ).toMatchObject({ deliveryStatus: 'sent' });
    expect(invitation.tokenHash).not.toBe(failedHash);
    await expect(service.preview('member', token)).rejects.toThrow('not found');
  });
  it('never reinvites existing members or the owner', async () => {
    repositories.get(User)!.findOne.mockResolvedValue({ ...user, id: 'owner' });
    await expect(
      service.create('owner', 'group', 'project', {
        email: 'owner@example.com',
        permissions: ['project:issues:read'],
      }),
    ).rejects.toThrow('already has project access');
    expect(mail.sendProjectInvitation).not.toHaveBeenCalled();
  });
  it('rejects owner membership edits, deletion and invitation acceptance', async () => {
    await expect(
      service.updateMember('owner', 'group', 'project', 'owner', [
        'project:issues:read',
      ]),
    ).rejects.toThrow('cannot be edited');
    await expect(
      service.removeMember('owner', 'group', 'project', 'owner'),
    ).rejects.toThrow('cannot be edited');
    invitation.email = 'owner@example.com';
    await expect(service.accept('owner', token)).rejects.toThrow(
      'cannot become a member',
    );
  });
});
