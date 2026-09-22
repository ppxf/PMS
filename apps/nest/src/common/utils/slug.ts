import { randomBytes } from 'node:crypto';

export function createSlug(name: string, fallbackPrefix: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `${fallbackPrefix}-${randomBytes(3).toString('hex')}`;
}
