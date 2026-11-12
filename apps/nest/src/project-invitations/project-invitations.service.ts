import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ProjectAccessService } from '../project-access/project-access.service';
import { ProjectMember } from '../project-access/project-member.entity';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { InvitationOutboxService } from '../invitation-outbox/invitation-outbox.service';
import { ProjectInvitation } from './project-invitation.entity';
import {
  normalizeInvitationEmail,
  validatePermissions,
  validateToken,
} from './project-invitation.validation';

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class ProjectInvitationsService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ProjectAccessService,
    private readonly outbox: InvitationOutboxService,
  ) {}

  private publicInvitation(invitation: ProjectInvitation) {
    return {
      id: invitation.id,
      email: invitation.email,
      permissions: invitation.permissions,
      invitedBy: invitation.invitedBy,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      deliveryStatus: invitation.deliveryStatus,
      createdAt: invitation.createdAt,
    };
  }

  async list(userId: string, groupSlug: string, projectSlug: string) {
    const { project } = await this.access.requireOwner(
      userId,
      groupSlug,
      projectSlug,
    );
    const invitations = await this.db
      .getRepository(ProjectInvitation)
      .find({ where: { projectId: project.id }, order: { createdAt: 'DESC' } });
    return invitations.map((invitation) => this.publicInvitation(invitation));
  }

  async create(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    input: { email?: unknown; permissions?: unknown },
  ) {
    const { project } = await this.access.requireOwner(
      userId,
      groupSlug,
      projectSlug,
    );
    const email = normalizeInvitationEmail(input?.email);
    const permissions = validatePermissions(input?.permissions);
    return this.db.transaction(async (manager) => {
      await this.lockProject(manager, project.id, userId);
      await this.assertNewMember(manager, project, email);
      const repository = manager.getRepository(ProjectInvitation);
      // Reinviting an address invalidates every outstanding link for that project.
      await repository
        .createQueryBuilder()
        .update()
        .set({ revokedAt: new Date() })
        .where(
          'project_id = :projectId AND email = :email AND accepted_at IS NULL AND revoked_at IS NULL',
          { projectId: project.id, email },
        )
        .execute();
      const token = randomBytes(32).toString('base64url');
      const invitation = await repository.save(
        repository.create({
          projectId: project.id,
          email,
          permissions,
          invitedBy: userId,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 7 * 86400000),
          acceptedAt: null,
          revokedAt: null,
          deliveryStatus: 'pending',
        }),
      );
      const inviter = await manager
        .getRepository(User)
        .findOneByOrFail({ id: userId });
      await this.outbox.enqueue(
        manager,
        invitation,
        token,
        project.name,
        inviter.name,
      );
      return this.publicInvitation(invitation);
    });
  }

  async resend(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    id: string,
  ) {
    const { project } = await this.access.requireOwner(
      userId,
      groupSlug,
      projectSlug,
    );
    return this.db.transaction(async (manager) => {
      await this.lockProject(manager, project.id, userId);
      const invitation = await this.invitationForUpdate(
        manager,
        project.id,
        id,
      );
      if (invitation.acceptedAt || invitation.revokedAt)
        throw new ConflictException('Invitation is no longer active');
      await this.assertNewMember(manager, project, invitation.email);
      const token = randomBytes(32).toString('base64url');
      invitation.tokenHash = hash(token);
      invitation.expiresAt = new Date(Date.now() + 7 * 86400000);
      invitation.deliveryStatus = 'pending';
      await manager.save(invitation);
      const inviter = await manager
        .getRepository(User)
        .findOneByOrFail({ id: userId });
      await this.outbox.enqueue(
        manager,
        invitation,
        token,
        project.name,
        inviter.name,
      );
      return this.publicInvitation(invitation);
    });
  }

  async revoke(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    id: string,
  ) {
    const { project } = await this.access.requireOwner(
      userId,
      groupSlug,
      projectSlug,
    );
    return this.db.transaction(async (manager) => {
      await this.lockProject(manager, project.id, userId);
      const invitation = await this.invitationForUpdate(
        manager,
        project.id,
        id,
      );
      if (invitation.acceptedAt)
        throw new ConflictException('Invitation has already been accepted');
      invitation.revokedAt ??= new Date();
      await manager.save(invitation);
      await this.outbox.cancel(manager, invitation.id);
      return this.publicInvitation(invitation);
    });
  }

  async preview(userId: string, tokenValue: unknown) {
    const token = validateToken(tokenValue);
    const invitation = await this.db
      .getRepository(ProjectInvitation)
      .findOne({ where: { tokenHash: hash(token) } });
    if (!invitation) throw new NotFoundException('Invitation not found');
    await this.validateRecipient(this.db.manager, invitation, userId);
    const project = await this.db.getRepository(MonitoringProject).findOne({
      where: { id: invitation.projectId },
      relations: { group: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId === userId)
      throw new ConflictException('Project owner cannot become a member');
    const inviter = await this.db
      .getRepository(User)
      .findOneBy({ id: invitation.invitedBy });
    return {
      projectName: project.name,
      groupSlug: project.group.slug,
      projectSlug: project.slug,
      inviterName: inviter?.name ?? '',
      email: invitation.email,
      permissions: invitation.permissions,
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(userId: string, tokenValue: unknown) {
    const tokenHash = hash(validateToken(tokenValue));
    // Read only the project id first, so every mutation locks project before invitation.
    const candidate = await this.db
      .getRepository(ProjectInvitation)
      .findOne({ where: { tokenHash } });
    if (!candidate) throw new NotFoundException('Invitation not found');
    return this.db.transaction(async (manager) => {
      const project = await this.lockProject(manager, candidate.projectId);
      const invitation = await manager
        .getRepository(ProjectInvitation)
        .findOne({
          where: { id: candidate.id, tokenHash },
          lock: { mode: 'pessimistic_write' },
        });
      if (!invitation) throw new NotFoundException('Invitation not found');
      await this.validateRecipient(manager, invitation, userId);
      if (project.ownerId === userId)
        throw new ConflictException('Project owner cannot become a member');
      if (
        await manager
          .getRepository(ProjectMember)
          .existsBy({ projectId: project.id, userId })
      )
        throw new ConflictException('Already a project member');
      await manager.getRepository(ProjectMember).insert({
        projectId: project.id,
        userId,
        permissions: validatePermissions(invitation.permissions),
        invitedBy: invitation.invitedBy,
        joinedAt: new Date(),
      });
      invitation.acceptedAt = new Date();
      await manager.save(invitation);
      const withGroup = await manager
        .getRepository(MonitoringProject)
        .findOneOrFail({
          where: { id: project.id },
          relations: { group: true },
        });
      return {
        groupSlug: withGroup.group.slug,
        projectSlug: project.slug,
        groupId: withGroup.groupId,
        projectId: project.id,
      };
    });
  }

  async members(userId: string, groupSlug: string, projectSlug: string) {
    const { project } = await this.access.requireOwner(
      userId,
      groupSlug,
      projectSlug,
    );
    const owner = await this.db
      .getRepository(User)
      .findOneByOrFail({ id: project.ownerId });
    const members = await this.db
      .getRepository(ProjectMember)
      .find({ where: { projectId: project.id }, order: { joinedAt: 'ASC' } });
    const rows = await Promise.all(
      members.map(async (member) => {
        const user = await this.db
          .getRepository(User)
          .findOneBy({ id: member.userId });
        return {
          userId: member.userId,
          name: user?.name ?? '',
          email: user?.email ?? '',
          role: 'member',
          permissions: member.permissions,
          invitedBy: member.invitedBy,
          joinedAt: member.joinedAt,
        };
      }),
    );
    return [
      {
        userId: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        permissions: [],
      },
      ...rows,
    ];
  }

  async updateMember(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    memberId: string,
    permissionsValue: unknown,
  ) {
    const permissions = validatePermissions(permissionsValue);
    return this.mutateMember(
      userId,
      groupSlug,
      projectSlug,
      memberId,
      permissions,
    );
  }

  async removeMember(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    memberId: string,
  ) {
    return this.mutateMember(userId, groupSlug, projectSlug, memberId);
  }

  private async mutateMember(
    userId: string,
    groupSlug: string,
    projectSlug: string,
    memberId: string,
    permissions?: string[],
  ) {
    const { project } = await this.access.requireOwner(
      userId,
      groupSlug,
      projectSlug,
    );
    return this.db.transaction(async (manager) => {
      await this.lockProject(manager, project.id, userId);
      if (memberId === project.ownerId)
        throw new BadRequestException(
          'Project owner cannot be edited or removed',
        );
      const repository = manager.getRepository(ProjectMember);
      const member = await repository.findOneBy({
        projectId: project.id,
        userId: memberId,
      });
      if (!member) throw new NotFoundException('Member not found');
      if (permissions) {
        member.permissions = permissions;
        await repository.save(member);
        return { userId: memberId, permissions };
      }
      await repository.delete({ projectId: project.id, userId: memberId });
      return { success: true };
    });
  }

  private async lockProject(
    manager: EntityManager,
    id: string,
    ownerId?: string,
  ) {
    const project = await manager
      .getRepository(MonitoringProject)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!project) throw new NotFoundException('Project not found');
    if (ownerId && project.ownerId !== ownerId)
      throw new ForbiddenException('Project owner required');
    return project;
  }
  private async invitationForUpdate(
    manager: EntityManager,
    projectId: string,
    id: string,
  ) {
    const invitation = await manager.getRepository(ProjectInvitation).findOne({
      where: { id, projectId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }
  private async assertNewMember(
    manager: EntityManager,
    project: MonitoringProject,
    email: string,
  ) {
    const user = await manager
      .getRepository(User)
      .findOne({ where: { email } });
    if (
      user &&
      (user.id === project.ownerId ||
        (await manager
          .getRepository(ProjectMember)
          .existsBy({ projectId: project.id, userId: user.id })))
    )
      throw new ConflictException('Recipient already has project access');
  }
  private async validateRecipient(
    manager: EntityManager,
    invitation: ProjectInvitation,
    userId: string,
  ) {
    const user = await manager.getRepository(User).findOneBy({ id: userId });
    if (
      !user ||
      user.status !== UserStatus.Active ||
      normalizeInvitationEmail(user.email) !== invitation.email
    )
      throw new ForbiddenException('Sign in with the verified invited email');
    if (
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt.getTime() <= Date.now() ||
      invitation.deliveryStatus !== 'sent'
    )
      throw new BadRequestException('Invitation is no longer valid');
  }
}
