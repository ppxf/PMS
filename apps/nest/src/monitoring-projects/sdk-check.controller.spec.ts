import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { SdkCheckController } from './sdk-check.controller';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

describe('SdkCheckController', () => {
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
