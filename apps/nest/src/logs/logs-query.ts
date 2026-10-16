import type { LogCondition, LogVisualization } from './logs-contract';
const columns: Record<string, string> = {
  severity: 'level',
  level: 'level',
  message: 'message',
  timestamp: 'timestamp',
  trace: 'trace_id',
  traceId: 'trace_id',
  spanId: 'span_id',
  environment: 'environment',
  release: 'release',
  logId: 'log_id',
};
export function logField(
  key: string,
  bind: (value: unknown) => string,
): string {
  if (key === 'timestamp')
    return `to_jsonb(to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;
  if (Object.hasOwn(columns, key)) return `to_jsonb(${columns[key]})`;
  if (key === 'payload_size')
    return `to_jsonb(octet_length(convert_to(jsonb_build_object('message', message, 'attributes', attributes)::text, 'UTF8')))`;
  if (key === 'timestamp_precise')
    return 'to_jsonb(extract(epoch from timestamp))';
  return `attributes -> ${bind(key.replace(/^attributes\./, ''))}::text`;
}
export function conditionsSql(
  conditions: LogCondition[],
  bind: (value: unknown) => string,
): string {
  return conditions
    .map((c) => {
      const field = logField(c.key, bind);
      if (c.operator === 'exists') return `${field} IS NOT NULL`;
      if (c.operator === 'not_exists') return `${field} IS NULL`;
      if (c.operator === 'in' || c.operator === 'not_in') {
        const list = (c.value as unknown[])
          .map((value) => `${bind(JSON.stringify(value))}::jsonb`)
          .join(', ');
        return c.operator === 'in'
          ? `${field} IN (${list})`
          : `(${field} IS NULL OR ${field} NOT IN (${list}))`;
      }
      if (c.operator === 'contains')
        return `strpos(lower(${field} #>> '{}'), lower(${bind(c.value)}::text)) > 0`;
      const operators = {
        eq: '=',
        neq: 'IS DISTINCT FROM',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
      };
      const operator = operators[c.operator];
      if (['gt', 'gte', 'lt', 'lte'].includes(c.operator))
        return `(CASE WHEN jsonb_typeof(${field}) = 'number' THEN (${field} #>> '{}')::numeric END) ${operator} ${bind(c.value)}::numeric`;
      return `${field} ${operator} ${bind(JSON.stringify(c.value))}::jsonb`;
    })
    .map((sql) => `(${sql})`)
    .join(' AND ');
}
export function aggregateSql(
  v: LogVisualization,
  bind: (value: unknown) => string,
): string {
  if (v.aggregate === 'count' && v.field === 'logs') return 'count(*)::float8';
  const field = logField(v.field, bind);
  if (v.aggregate === 'count') return `count(${field})::float8`;
  if (v.aggregate === 'count_unique') return `count(DISTINCT ${field})::float8`;
  const numeric = `CASE WHEN jsonb_typeof(${field}) = 'number' THEN (${field} #>> '{}')::float8 END`;
  if (v.aggregate.startsWith('p'))
    return `percentile_cont(${Number(v.aggregate.slice(1)) / 100}) WITHIN GROUP (ORDER BY ${numeric})`;
  return `${v.aggregate}(${numeric})::float8`;
}
