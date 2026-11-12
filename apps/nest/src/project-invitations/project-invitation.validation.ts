import { BadRequestException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import {
  PROJECT_PERMISSIONS,
  ProjectPermission,
} from '../project-access/project-permissions';

export function normalizeInvitationEmail(value: unknown): string {
  if (typeof value !== 'string' || !isEmail(value.trim()) || value.length > 254)
    throw new BadRequestException('Invalid email');
  return value.trim().toLowerCase();
}
export function validatePermissions(value: unknown): ProjectPermission[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some(
      (permission: unknown) =>
        typeof permission !== 'string' ||
        !(PROJECT_PERMISSIONS as readonly string[]).includes(permission),
    )
  )
    throw new BadRequestException('Invalid project permissions');
  return [...new Set(value)] as ProjectPermission[];
}
export function validateToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new BadRequestException('Invalid invitation token');
  return value;
}
