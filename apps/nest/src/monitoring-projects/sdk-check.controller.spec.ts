import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { SdkCheckController } from './sdk-check.controller';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

describe('SdkCheckController', () => {
  it('checks browser Origin against the requested project before connection reporting', async () => {
    const projects = {
      allowsSdkOrigin: jest.fn().mockResolvedValue(false),
      checkConnection: jest.fn().mockResolvedValue({ projectId: 'project' }),
    };
    const controller = new SdkCheckController(projects as never);
    await expect(
      controller.check(
        { projectId: 'project', publicKey: 'key' },
        'https://app.test',
      ),
    ).rejects.toThrow('SDK Origin is not allowed');
    expect(projects.allowsSdkOrigin).toHaveBeenCalledWith(
      'project',
      'https://app.test',
    );
    expect(projects.checkConnection).not.toHaveBeenCalled();
    projects.allowsSdkOrigin.mockResolvedValue(true);
    await expect(
      controller.check(
        { projectId: 'project', publicKey: 'key' },
        'https://app.test',
      ),
    ).resolves.toEqual({ projectId: 'project' });
  });
  it('exposes a public connection check without returning private data', async () => {
    const projects = {
      checkConnection: jest.fn(() =>
        Promise.resolve({
          checkedAt: new Date('2026-09-22T00:00:00Z'),
          platform: 'vue',
          projectId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ),
    };
    const controller = new SdkCheckController(projects as never);

    await expect(
      controller.check({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        publicKey: 'public-key',
      }),
    ).resolves.toEqual({
      checkedAt: new Date('2026-09-22T00:00:00Z'),
      platform: 'vue',
      projectId: '550e8400-e29b-41d4-a716-446655440000',
    });
    const checkHandler = Object.getOwnPropertyDescriptor(
      SdkCheckController.prototype,
      'check',
    )?.value as object;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, checkHandler)).toBe(true);
    expect(
      Reflect.getMetadata(ROUTE_ARGS_METADATA, SdkCheckController, 'check'),
    ).toHaveProperty('3:0');
  });
});
