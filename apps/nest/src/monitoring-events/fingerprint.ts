import { createHash } from 'node:crypto';

export interface ErrorFingerprintInput {
  exceptionType: string;
  message: string;
  stacktrace?: string | null;
  url?: string | null;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function findCulprit(
  stacktrace?: string | null,
  url?: string | null,
): string {
  const firstFrame = stacktrace
    ?.split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith('at '));

  return firstFrame ?? url ?? '';
}

export function createErrorFingerprint(input: ErrorFingerprintInput): string {
  const value = [
    input.exceptionType,
    normalizeWhitespace(input.message),
    findCulprit(input.stacktrace, input.url),
  ].join('\n');

  return createHash('sha256').update(value).digest('hex');
}
