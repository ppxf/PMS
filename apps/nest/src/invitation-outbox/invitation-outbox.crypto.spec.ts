import {
  decryptInvitationPayload,
  encryptInvitationPayload,
} from './invitation-outbox.crypto';
describe('invitation payload encryption', () => {
  it('round trips encrypted tokens using a different nonce for each task', () => {
    const value = { token: 'secret-token', email: 'private@example.com' };
    const encrypted = encryptInvitationPayload('test-secret', value);
    expect(encrypted).not.toContain(value.token);
    expect(encrypted).not.toContain(value.email);
    expect(encryptInvitationPayload('test-secret', value)).not.toBe(encrypted);
    expect(decryptInvitationPayload('test-secret', encrypted)).toEqual(value);
  });
  it('rejects tampering and a different key', () => {
    const encrypted = encryptInvitationPayload('test-secret', {
      token: 'token',
    });
    expect(() => decryptInvitationPayload('other-secret', encrypted)).toThrow();
    const parts = encrypted.split('.');
    parts[1] = Buffer.alloc(16).toString('base64url');
    expect(() =>
      decryptInvitationPayload('test-secret', parts.join('.')),
    ).toThrow();
  });
});
