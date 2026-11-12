import {
  validatePermissions,
  normalizeInvitationEmail,
} from './project-invitation.validation';

describe('project invitation validation', () => {
  it('normalizes recipient email', () => {
    expect(normalizeInvitationEmail(' Member@Example.com ')).toBe(
      'member@example.com',
    );
  });
  it.each([[], ['admin'], ['project:issues:read', 'admin'], null])(
    'rejects invalid permissions %j',
    (value) => {
      expect(() => validatePermissions(value)).toThrow();
    },
  );
  it('accepts only explicit read permissions and deduplicates them', () => {
    expect(
      validatePermissions(['project:issues:read', 'project:issues:read']),
    ).toEqual(['project:issues:read']);
  });
});
