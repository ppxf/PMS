import { ConfigService } from '@nestjs/config';
import { MonitoringProjectsService } from './monitoring-projects.service';
import { UpdateOriginsPipe } from './dto/update-origins.pipe';
import { PropagationSettingsPipe } from './dto/propagation-settings.pipe';

describe('Project origins management', () => {
  it.each([
    { origins: ['*'] },
    { origins: [] },
    { origins: ['https://app.test'] },
    { origins: ['http://localhost:5173'] },
  ])('accepts supported origins %j', ({ origins }) => {
    expect(
      new UpdateOriginsPipe().transform({ allowedOrigins: origins }),
    ).toEqual({ allowedOrigins: origins });
  });
  it.each(
    [
      ['*', 'https://app.test'],
      ['https://*.test'],
      ['https://app.test/path'],
      ['null'],
      ['https://user:pass@app.test'],
      Array(21).fill('https://app.test'),
    ].map((origins) => ({ origins })),
  )('rejects invalid origins %j', ({ origins }) => {
    expect(() =>
      new UpdateOriginsPipe().transform({ allowedOrigins: origins }),
    ).toThrow();
  });
  it('normalizes exact origins and permits wildcard in the compatibility propagation endpoint', () => {
    expect(
      new UpdateOriginsPipe().transform({
        allowedOrigins: ['https://APP.test:443', 'https://app.test'],
      }),
    ).toEqual({ allowedOrigins: ['https://app.test'] });
    expect(
      new PropagationSettingsPipe().transform({
        propagationTargets: [],
        allowedOrigins: ['*'],
      }),
    ).toEqual({ propagationTargets: [], allowedOrigins: ['*'] });
    expect(() =>
      new UpdateOriginsPipe().transform({ allowedOrigins: ['*'], extra: true }),
    ).toThrow();
  });
  it('enforces ownership before updating origins', async () => {
    const repository = {
      findOne: jest
        .fn()
        .mockResolvedValue({
          id: 'project',
          publicKey: 'key',
          allowedOrigins: ['*'],
        }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const groups = {
      findOwnedBySlug: jest.fn().mockResolvedValue({ id: 'group' }),
    };
    const service = new MonitoringProjectsService(
      repository as never,
      groups as never,
      new ConfigService(),
    );
    await expect(
      service.updateOrigins('owner', 'group', 'project', []),
    ).resolves.toMatchObject({ allowedOrigins: [] });
    expect(groups.findOwnedBySlug).toHaveBeenCalledWith('owner', 'group');
    expect(repository.update).toHaveBeenCalledWith('project', {
      allowedOrigins: [],
    });
    repository.update.mockClear();
    groups.findOwnedBySlug.mockRejectedValue(new Error('not owned'));
    await expect(
      service.updateOrigins('other', 'group', 'project', ['*']),
    ).rejects.toThrow('not owned');
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('accepts any valid browser origin with wildcard, exact match for restricted list, and denies empty list', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue({ allowedOrigins: ['*'] }),
    };
    const service = new MonitoringProjectsService(
      repository as never,
      {} as never,
      new ConfigService(),
    );
    await expect(
      service.allowsSdkOrigin('project', 'https://new.test'),
    ).resolves.toBe(true);
    repository.findOne.mockResolvedValue({
      allowedOrigins: ['https://allowed.test'],
    });
    await expect(
      service.allowsSdkOrigin('project', 'https://new.test'),
    ).resolves.toBe(false);
    await expect(
      service.allowsSdkOrigin('project', 'https://allowed.test'),
    ).resolves.toBe(true);
    repository.findOne.mockResolvedValue({ allowedOrigins: [] });
    await expect(
      service.allowsSdkOrigin('project', 'https://allowed.test'),
    ).resolves.toBe(false);
    repository.findOne.mockResolvedValue(null);
    await expect(
      service.allowsSdkOrigin('missing', 'https://allowed.test'),
    ).resolves.toBe(false);
  });
});
