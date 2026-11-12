import * as bcrypt from 'bcrypt';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import {
  AuthTokensService,
  AuthTokenType,
} from '../auth-tokens/auth-tokens.service';
import { AuthToken } from '../auth-tokens/entities/auth-token.entity';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { User, UserStatus } from '../users/entities/user.entity';
import { Group } from '../groups/entities/group.entity';
import { GroupsService } from '../groups/groups.service';
import {
  MonitoringPlatform,
  MonitoringProject,
} from '../monitoring-projects/entities/monitoring-project.entity';
import { ProjectMember } from '../project-access/project-member.entity';
import { ProjectAccessService } from '../project-access/project-access.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { InvitationOutbox } from '../invitation-outbox/invitation-outbox.entity';
import { InvitationOutboxService } from '../invitation-outbox/invitation-outbox.service';
import { ProjectInvitation } from './project-invitation.entity';
import { ProjectInvitationsService } from './project-invitations.service';

// Opt in with a disposable PostgreSQL database. No app tables are modified.
const databaseUrl =
  process.env.INVITATIONS_TEST_DATABASE_URL ??
  process.env.MIGRATIONS_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'PostgreSQL invitation transactions',
  () => {
    let admin: DataSource;
    let db: DataSource;
    let service: ProjectInvitationsService;
    let outbox: InvitationOutboxService;
    let owner: User;
    let member: User;
    let other: User;
    let project: MonitoringProject;
    let group: Group;
    let deliveredToken: string;
    const mail = {
      sendProjectInvitation: jest.fn((_email: string, token: string) => {
        deliveredToken = token;
        return Promise.resolve({});
      }),
    };
    const schema = `invitation_test_${randomUUID().replaceAll('-', '')}`;

    beforeAll(async () => {
      admin = await new DataSource({
        type: 'postgres',
        url: databaseUrl,
      }).initialize();
      await admin.query(`CREATE SCHEMA "${schema}"`);
      db = await new DataSource({
        type: 'postgres',
        url: databaseUrl,
        schema,
        extra: { options: `-c search_path=${schema},public` },
        entities: [
          User,
          Group,
          MonitoringProject,
          ProjectMember,
          AuthToken,
          ProjectInvitation,
          InvitationOutbox,
        ],
        synchronize: true,
        installExtensions: false,
      }).initialize();
      outbox = new InvitationOutboxService(
        db,
        mail as unknown as MailService,
        new ConfigService({
          auth: { jwtSecret: 'test-secret-32chars-or-more-test-secret' },
        }),
      );
      service = new ProjectInvitationsService(
        db,
        new ProjectAccessService(
          db.getRepository(MonitoringProject),
          db.getRepository(ProjectMember),
        ),
        outbox,
      );
    }, 30000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
      if (admin?.isInitialized) {
        try {
          await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await admin.destroy();
        }
      }
    });
    beforeEach(async () => {
      await db.getRepository(InvitationOutbox).clear();
      mail.sendProjectInvitation.mockClear();
      const users = db.getRepository(User);
      owner = await users.save(
        users.create({
          email: `${randomUUID()}@example.com`,
          name: 'Owner',
          status: UserStatus.Active,
          passwordHash: 'test',
        }),
      );
      member = await users.save(
        users.create({
          email: `${randomUUID()}@example.com`,
          name: 'Member',
          status: UserStatus.Active,
          passwordHash: 'test',
        }),
      );
      other = await users.save(
        users.create({
          email: `${randomUUID()}@example.com`,
          name: 'Other',
          status: UserStatus.Active,
          passwordHash: 'test',
        }),
      );
      group = await db
        .getRepository(Group)
        .save({ ownerId: owner.id, name: 'Group', slug: randomUUID() });
      project = await db.getRepository(MonitoringProject).save({
        groupId: group.id,
        ownerId: owner.id,
        name: 'Project',
        slug: 'project',
        platform: MonitoringPlatform.Vue,
        publicKey: randomUUID(),
      });
    });
    const invite = async () => {
      const result = await service.create(owner.id, group.slug, project.slug, {
        email: member.email,
        permissions: ['project:issues:read'],
      });
      await outbox.drain();
      return db
        .getRepository(ProjectInvitation)
        .findOneByOrFail({ id: result.id });
    };

    it('preserves canonical group identity instead of writing through a colliding legacy UUID slug', async () => {
      await db
        .getRepository(Group)
        .save({
          id: group.slug,
          ownerId: other.id,
          name: 'Canonical',
          slug: `canonical-${randomUUID()}`,
        });
      await expect(
        new GroupsService(db.getRepository(Group)).findOwnedBySlug(
          owner.id,
          group.slug,
        ),
      ).rejects.toThrow('Group not found');
      await expect(
        service.create(owner.id, group.slug, project.slug, {
          email: member.email,
          permissions: ['project:issues:read'],
        }),
      ).rejects.toThrow('Monitoring project not found');
      expect(
        await db
          .getRepository(ProjectInvitation)
          .countBy({ projectId: project.id }),
      ).toBe(0);
      expect(await db.getRepository(InvitationOutbox).count()).toBe(0);
    });

    it('accepts a legacy UUID-shaped project slug while preserving its existing group ID', async () => {
      const legacySlug = randomUUID();
      await db
        .getRepository(MonitoringProject)
        .update(project.id, { slug: legacySlug });
      const invitation = await service.create(owner.id, group.id, legacySlug, {
        email: member.email,
        permissions: ['project:issues:read'],
      });
      expect(invitation.deliveryStatus).toBe('pending');
      expect(
        await db
          .getRepository(ProjectInvitation)
          .countBy({ id: invitation.id, projectId: project.id }),
      ).toBe(1);
    });

    it('invalidates an actual pre-reset JWT and preserves sessions if the reset transaction rolls back', async () => {
      await db
        .getRepository(User)
        .update(owner.id, {
          passwordHash: await bcrypt.hash('old-password', 4),
        });
      const users = new UsersService(db.getRepository(User));
      const tokens = new AuthTokensService(db.getRepository(AuthToken));
      const jwt = new JwtService({
        secret: 'reset-test-secret-with-32-characters',
      });
      const auth = new AuthService(
        users,
        jwt,
        tokens,
        {} as never,
        db,
        new ConfigService(),
      );
      const guard = new JwtAuthGuard(new Reflector(), jwt, users);
      const before = await auth.login(owner.email, 'old-password');
      const context = (token: string) =>
        ({
          getClass: () => class Test {},
          getHandler: () => () => undefined,
          switchToHttp: () => ({
            getRequest: () => ({
              headers: { authorization: `Bearer ${token}` },
            }),
          }),
        }) as unknown as ExecutionContext;
      const resetToken = await tokens.create(
        owner.id,
        AuthTokenType.PasswordReset,
        30,
      );
      const consume = jest.spyOn(tokens, 'consumeAll');
      consume.mockRejectedValueOnce(new Error('database write failure'));
      await expect(
        auth.resetPassword({
          token: resetToken,
          password: 'new-password',
          passwordConfirmation: 'new-password',
        }),
      ).rejects.toThrow('database write failure');
      expect(
        (await db.getRepository(User).findOneByOrFail({ id: owner.id }))
          .sessionVersion,
      ).toBe(0);
      await expect(
        guard.canActivate(context(before.accessToken)),
      ).resolves.toBe(true);
      consume.mockRestore();
      await auth.resetPassword({
        token: resetToken,
        password: 'new-password',
        passwordConfirmation: 'new-password',
      });
      expect(
        (await db.getRepository(User).findOneByOrFail({ id: owner.id }))
          .sessionVersion,
      ).toBe(1);
      await expect(
        guard.canActivate(context(before.accessToken)),
      ).rejects.toThrow();
      const after = await auth.login(owner.email, 'new-password');
      await expect(guard.canActivate(context(after.accessToken))).resolves.toBe(
        true,
      );
      await expect(
        auth.resetPassword({
          token: resetToken,
          password: 'another-password',
          passwordConfirmation: 'another-password',
        }),
      ).rejects.toThrow('invalid or has expired');
    });
    it('commits a durable encrypted task before SMTP and does not hold invitation locks during delivery', async () => {
      const invitation = await service.create(
        owner.id,
        group.slug,
        project.slug,
        { email: member.email, permissions: ['project:issues:read'] },
      );
      expect(invitation.deliveryStatus).toBe('pending');
      expect(mail.sendProjectInvitation).not.toHaveBeenCalled();
      const job = await db
        .getRepository(InvitationOutbox)
        .findOneByOrFail({ invitationId: invitation.id });
      expect(job.payload).not.toContain(member.email);
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      mail.sendProjectInvitation.mockImplementationOnce(async () => {
        entered();
        await blocked;
        return {};
      });
      const sending = outbox.deliverOne();
      await started;
      try {
        // A second transaction can revoke while SMTP is blocked; a lock held across SMTP would time out here.
        await db.transaction(async (manager) => {
          await manager.query("SET LOCAL lock_timeout='500ms'");
          await manager.query(
            'SELECT id FROM project_invitations WHERE id=$1 FOR UPDATE',
            [invitation.id],
          );
        });
        await service.revoke(owner.id, group.slug, project.slug, invitation.id);
      } finally {
        release();
        await sending;
      }
      const revoked = await db
        .getRepository(ProjectInvitation)
        .findOneByOrFail({ id: invitation.id });
      expect(revoked.deliveryStatus).toBe('pending');
      expect(revoked.revokedAt).toBeInstanceOf(Date);
      expect(
        (
          await db
            .getRepository(InvitationOutbox)
            .findOneByOrFail({ id: job.id })
        ).payload,
      ).toBeNull();
    });
    it('prevents an old successful delivery from marking a resent invitation sent', async () => {
      const invitation = await service.create(
        owner.id,
        group.slug,
        project.slug,
        { email: member.email, permissions: ['project:issues:read'] },
      );
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      mail.sendProjectInvitation.mockImplementationOnce(async () => {
        entered();
        await blocked;
        return {};
      });
      const sending = outbox.deliverOne();
      await started;
      try {
        await service.resend(owner.id, group.slug, project.slug, invitation.id);
      } finally {
        release();
        await sending;
      }
      expect(
        (
          await db
            .getRepository(ProjectInvitation)
            .findOneByOrFail({ id: invitation.id })
        ).deliveryStatus,
      ).toBe('pending');
      await outbox.drain();
      expect(
        (
          await db
            .getRepository(ProjectInvitation)
            .findOneByOrFail({ id: invitation.id })
        ).deliveryStatus,
      ).toBe('sent');
    });
    it('recovers expired leases and claims only once across concurrent workers', async () => {
      const invitation = await service.create(
        owner.id,
        group.slug,
        project.slug,
        { email: member.email, permissions: ['project:issues:read'] },
      );
      await db.getRepository(InvitationOutbox).update(
        { invitationId: invitation.id },
        {
          status: 'processing',
          leaseUntil: new Date(0),
          leaseToken: randomUUID(),
        },
      );
      await Promise.all([outbox.deliverOne(), outbox.deliverOne()]);
      expect(mail.sendProjectInvitation).toHaveBeenCalledTimes(1);
      const job = await db
        .getRepository(InvitationOutbox)
        .findOneByOrFail({ invitationId: invitation.id });
      expect(job.status).toBe('completed');
      expect(job.payload).toBeNull();
    });
    it('backs off failures and clears the sensitive payload after the final attempt', async () => {
      const invitation = await service.create(
        owner.id,
        group.slug,
        project.slug,
        { email: member.email, permissions: ['project:issues:read'] },
      );
      mail.sendProjectInvitation.mockRejectedValueOnce(
        new Error('transport error includes credentials'),
      );
      await outbox.deliverOne();
      let job = await db
        .getRepository(InvitationOutbox)
        .findOneByOrFail({ invitationId: invitation.id });
      expect(job.status).toBe('pending');
      expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20000);
      expect(await outbox.deliverOne()).toBe(false);
      await db
        .getRepository(InvitationOutbox)
        .update(job.id, { nextAttemptAt: new Date(0), attempts: 7 });
      mail.sendProjectInvitation.mockRejectedValueOnce(
        new Error('unavailable'),
      );
      await outbox.deliverOne();
      job = await db
        .getRepository(InvitationOutbox)
        .findOneByOrFail({ id: job.id });
      expect(job.status).toBe('failed');
      expect(job.payload).toBeNull();
      expect(job.attempts).toBe(8);
    });
    it('allows exactly one concurrent acceptance and prevents replay', async () => {
      const invitation = await invite();
      const results = await Promise.allSettled([
        service.accept(member.id, deliveredToken),
        service.accept(member.id, deliveredToken),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        await db
          .getRepository(ProjectMember)
          .countBy({ projectId: project.id, userId: member.id }),
      ).toBe(1);
      expect(
        (
          await db
            .getRepository(ProjectInvitation)
            .findOneByOrFail({ id: invitation.id })
        ).acceptedAt,
      ).toBeInstanceOf(Date);
    });
    it('rejects mismatched accounts and expired or revoked tokens without creating members', async () => {
      const invitation = await invite();
      const token = deliveredToken;
      await expect(service.accept(other.id, token)).rejects.toThrow(
        'verified invited email',
      );
      await db
        .getRepository(ProjectInvitation)
        .update(invitation.id, { expiresAt: new Date(0) });
      await expect(service.accept(member.id, token)).rejects.toThrow(
        'no longer valid',
      );
      await service.resend(owner.id, group.slug, project.slug, invitation.id);
      await outbox.drain();
      const resent = deliveredToken;
      await expect(service.accept(member.id, token)).rejects.toThrow(
        'not found',
      );
      await service.revoke(owner.id, group.slug, project.slug, invitation.id);
      await expect(service.accept(member.id, resent)).rejects.toThrow(
        'no longer valid',
      );
      expect(
        await db
          .getRepository(ProjectMember)
          .countBy({ projectId: project.id }),
      ).toBe(0);
    });
    it('persists failed delivery, retries and never replaces existing member permissions', async () => {
      mail.sendProjectInvitation.mockRejectedValueOnce(
        new Error('SMTP unavailable'),
      );
      const invitation = await invite();
      expect(invitation.deliveryStatus).toBe('failed');
      expect(
        (
          await db
            .getRepository(ProjectInvitation)
            .findOneByOrFail({ id: invitation.id })
        ).deliveryStatus,
      ).toBe('failed');
      await service.resend(owner.id, group.slug, project.slug, invitation.id);
      await outbox.drain();
      await service.accept(member.id, deliveredToken);
      await service.updateMember(
        owner.id,
        group.slug,
        project.slug,
        member.id,
        ['project:metrics:read'],
      );
      await expect(invite()).rejects.toThrow('already has project access');
      expect(
        (
          await db
            .getRepository(ProjectMember)
            .findOneByOrFail({ projectId: project.id, userId: member.id })
        ).permissions,
      ).toEqual(['project:metrics:read']);
    });
    it('rejects owner invitations, owner mutation and member administration', async () => {
      await expect(
        service.create(owner.id, group.slug, project.slug, {
          email: owner.email,
          permissions: ['project:issues:read'],
        }),
      ).rejects.toThrow('already has project access');
      await expect(
        service.removeMember(owner.id, group.slug, project.slug, owner.id),
      ).rejects.toThrow('cannot be edited');
      await invite();
      await outbox.drain();
      await service.accept(member.id, deliveredToken);
      await expect(
        service.members(member.id, group.slug, project.slug),
      ).rejects.toThrow('owner required');
    });
  },
);
