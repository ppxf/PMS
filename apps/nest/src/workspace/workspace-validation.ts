import { BadRequestException } from '@nestjs/common';
export type Query = Record<string, unknown>;
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseQuery(
  q: Query,
): Query & { page: number; pageSize: number } {
  const number = (key: string, fallback: number, max: number) => {
    if (q[key] === undefined) return fallback;
    if (typeof q[key] !== 'string' || !/^\d+$/.test(q[key]))
      throw new BadRequestException(`Invalid ${key}`);
    const n = Number(q[key]);
    if (!Number.isSafeInteger(n) || n < 1 || n > max)
      throw new BadRequestException(`Invalid ${key}`);
    return n;
  };
  for (const key of ['projectId', 'groupId'])
    if (
      q[key] !== undefined &&
      (typeof q[key] !== 'string' || !uuid.test(q[key]))
    )
      throw new BadRequestException(`Invalid ${key}`);
  for (const key of ['from', 'to'])
    if (
      q[key] !== undefined &&
      (typeof q[key] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
          q[key],
        ) ||
        !Number.isFinite(Date.parse(q[key])))
    )
      throw new BadRequestException(`Invalid ${key}`);
  for (const key of ['from', 'to'])
    if (typeof q[key] === 'string') {
      const date = q[key].slice(0, 10);
      if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
        throw new BadRequestException(`Invalid ${key}`);
    }
  if (
    q.from &&
    q.to &&
    Date.parse(q.from as string) > Date.parse(q.to as string)
  )
    throw new BadRequestException('Invalid time range');
  for (const key of ['q', 'environment'])
    if (
      q[key] !== undefined &&
      (typeof q[key] !== 'string' || q[key].length > (key === 'q' ? 512 : 128))
    )
      throw new BadRequestException(`Invalid ${key}`);
  return {
    ...q,
    page: number('page', 1, 1000000),
    pageSize: number('pageSize', 20, 100),
  };
}
