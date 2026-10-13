import { BadRequestException, PipeTransform } from '@nestjs/common';
import { allowedOrigins } from './update-origins.pipe';

export interface PropagationSettings {
  propagationTargets: string[];
  allowedOrigins: string[];
}

export function propagationTargets(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > 20)
    throw new BadRequestException('At most 20 propagation targets');
  return [
    ...new Set(
      input.map((value: unknown) => {
        if (typeof value !== 'string' || !value.trim() || value.length > 512)
          throw new BadRequestException('Invalid target');
        const target = value.trim();
        let url: URL;
        try {
          url = new URL(target, 'https://pms-relative.invalid');
        } catch {
          throw new BadRequestException('Invalid target URL');
        }
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          (!/^https?:\/\//.test(target) &&
            (!target.startsWith('/') || target.startsWith('//')))
        )
          throw new BadRequestException(
            'Use HTTP(S) URLs or absolute paths without query/hash/credentials',
          );
        return /^https?:\/\//.test(target)
          ? `${url.origin}${url.pathname}`
          : url.pathname;
      }),
    ),
  ];
}

export class PropagationSettingsPipe implements PipeTransform<
  unknown,
  PropagationSettings
> {
  transform(input: unknown): PropagationSettings {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (k) => !['propagationTargets', 'allowedOrigins'].includes(k),
      )
    )
      throw new BadRequestException('Invalid propagation settings');
    const value = input as Record<string, unknown>;
    return {
      allowedOrigins: allowedOrigins(value.allowedOrigins),
      propagationTargets: propagationTargets(value.propagationTargets),
    };
  }
}
