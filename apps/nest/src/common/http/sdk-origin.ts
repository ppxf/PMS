import { BadRequestException } from '@nestjs/common';

export function normalizeSdkOrigin(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    !/^https?:\/\/[^/?#\\\s]+$/i.test(value)
  )
    throw new BadRequestException('Invalid browser Origin');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Invalid browser Origin');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.hostname.includes('*') ||
    url.username ||
    url.password ||
    url.origin === 'null'
  )
    throw new BadRequestException('Invalid browser Origin');
  return url.origin;
}
