import type { Request } from 'express';
import { sdkCors } from './sdk-cors';
const id = '550e8400-e29b-41d4-a716-446655440000';
function options(
  path: string,
  method = 'OPTIONS',
  origin = 'https://unknown.test',
) {
  return new Promise<Record<string, unknown>>((resolve) =>
    sdkCors(['https://admin.test'])(
      { path, method, headers: { origin } } as Request,
      (_error, value) => resolve(value as Record<string, unknown>),
    ),
  );
}
describe('SDK CORS boundary', () => {
  it.each([
    '/api/sdk/check',
    `/api/sdk/${id}/envelope`,
    `/api/sdk/${id}/check`,
    '/API/SDK/CHECK',
    '/api/sdk/check/',
    '/api/sdk/%3550e8400-e29b-41d4-a716-446655440000/envelope',
  ])(
    'opens exact SDK POST/OPTIONS %s without database lookup or credentials',
    async (path) => {
      for (const method of ['POST', 'OPTIONS'])
        expect(await options(path, method)).toMatchObject({
          origin: '*',
          credentials: false,
          methods: ['POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'X-PMS-Key'],
        });
    },
  );
  it.each([
    '/api/groups',
    `/api/sdk/${id}/bind`,
    '/api/sdk/check/extra',
    '/api/sdk/not-a-uuid/envelope',
  ])('does not open unrelated path %s', async (path) => {
    expect(await options(path)).toMatchObject({ origin: false });
  });
  it('preserves management static origins and does not open SDK GET', async () => {
    expect(
      await options('/api/groups', 'OPTIONS', 'https://admin.test'),
    ).toMatchObject({ origin: true });
    expect(await options('/api/sdk/check', 'GET')).toMatchObject({
      origin: false,
    });
  });
});
