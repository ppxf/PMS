import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

export function encryptInvitationPayload(
  secret: string,
  value: unknown,
): string {
  const key = createHash('sha256')
    .update('pms:invitation-outbox:v1:')
    .update(secret)
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
}
export function decryptInvitationPayload<T>(
  secret: string,
  encrypted: string,
): T {
  const [iv, tag, value] = encrypted
    .split('.')
    .map((part) => Buffer.from(part, 'base64url'));
  const key = createHash('sha256')
    .update('pms:invitation-outbox:v1:')
    .update(secret)
    .digest();
  const cipher = createDecipheriv('aes-256-gcm', key, iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(value), cipher.final()]).toString('utf8'),
  ) as T;
}
