import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { of, lastValueFrom, throwError } from 'rxjs';
import { DataSource } from 'typeorm';
import { AuditRecordsService } from './audit-records.service';
import { AuditRecordsInterceptor } from './audit-records.interceptor';
import { auditMetadata, parseAuditQuery } from './audit-records.validation';

describe('audit input boundaries', () => {
  it('rejects malformed pagination and dates', () => {
    for (const query of [
      { page: '0' },
      { pageSize: '101' },
      { from: 'yesterday' },
      { projectId: 'invalid' },
      { from: '2026-12-01', to: '2026-01-01' },
    ]) {
      expect(() => parseAuditQuery(query)).toThrow(BadRequestException);
    }
  });
  it('records only route templates and safe request identifiers, never parameter tokens', () => {
    const metadata = auditMetadata({
      method: 'POST',
      route: { path: '/invitations/:token/accept' },
      params: { token: 'secret' },
      body: { password: 'secret' },
      headers: { 'x-request-id': 'unsafe\nsecret' },
    });
    expect(metadata.action).toBe('POST /invitations/:token/accept');
    expect(JSON.stringify(metadata)).not.toContain('secret');
    expect(metadata.requestId).toBeNull();
  });
});

describe('management audit capture', () => {
  function setup() {
    const record = jest.fn().mockResolvedValue({});
    const project = {
      id: 'p',
      name: 'project',
      ownerId: 'owner',
      groupId: 'g',
      group: { name: 'group' },
      loggingEnabled: false,
    };
    const find = jest.fn().mockResolvedValue([project]);
    const db = {
      getRepository: () => ({
        find,
        existsBy: jest.fn().mockResolvedValue(false),
        manager: {
          getRepository: () => ({
            existsBy: jest.fn().mockResolvedValue(false),
          }),
        },
      }),
    };
    const request = {
      method: 'PATCH',
      route: { path: '/groups/:groupSlug/projects/:projectSlug/logging' },
      headers: {},
      params: {
        projectSlug: 'project',
        groupSlug: 'group',
        token: 'credential',
      },
      user: { id: 'owner', name: 'Operator' },
      body: {
        loggingEnabled: true,
        password: 'credential',
        token: 'credential',
      },
    };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ statusCode: 200 }),
      }),
      getClass: () => ({ name: 'MonitoringProjectsController' }),
    } as unknown as ExecutionContext;
    return {
      record,
      context,
      request,
      find,
      project,
      interceptor: new AuditRecordsInterceptor(
        { record } as unknown as AuditRecordsService,
        db as unknown as DataSource,
      ),
    };
  }
  it('persists owner/project snapshot and allowlisted before/after settings', async () => {
    const { record, context, interceptor } = setup();
    await lastValueFrom(
      await interceptor.intercept(context, {
        handle: () => of({ loggingEnabled: true, publicKey: 'credential' }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p',
        projectOwnerId: 'owner',
        projectName: 'project',
        result: 'success',
        summary: { loggingEnabled: { before: false, after: true } },
      }),
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain('credential');
  });
  it('persists failed outcomes without proposed settings or exception text', async () => {
    const { record, context, interceptor } = setup();
    await expect(
      lastValueFrom(
        await interceptor.intercept(context, {
          handle: () => throwError(() => new ForbiddenException('credential')),
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        statusCode: 403,
        summary: {},
      }),
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain('credential');
  });
  it('keeps the project audit snapshot when an old group slug looks like a UUID', async () => {
    const { record, context, interceptor, request, find, project } = setup();
    request.params.groupSlug = 'abcdefab-1234-4567-89ab-abcdefabcdef';
    find.mockResolvedValueOnce([]).mockResolvedValueOnce([project]);
    await lastValueFrom(
      await interceptor.intercept(context, {
        handle: () => of({ loggingEnabled: true }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        projectOwnerId: 'owner',
      }),
    );
  });
});
