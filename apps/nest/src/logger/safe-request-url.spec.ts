import { safeRequestUrl } from './safe-request-url';

describe('safeRequestUrl', () => {
  it('removes tokens from successful and failed HTTP log paths without losing path context', () => {
    expect(safeRequestUrl('/api/project-invitations/preview?token=secret&other=ok')).toBe('/api/project-invitations/preview');
    expect(safeRequestUrl('/api/groups/team')).toBe('/api/groups/team');
  });
});
