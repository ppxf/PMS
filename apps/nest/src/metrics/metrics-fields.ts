import { METRIC_GROUP_FIELDS, MetricFilterOperator } from './metrics-contract';

type FieldType = 'string' | 'number' | 'boolean' | 'mixed';
export function metricFieldOperators(type: FieldType): MetricFilterOperator[] {
  const operators: MetricFilterOperator[] = ['eq', 'in', 'not_in', 'exists'];
  if (type === 'string' || type === 'mixed') operators.push('contains');
  if (type === 'number' || type === 'mixed')
    operators.push('gt', 'gte', 'lt', 'lte');
  return operators;
}
export interface MetricField {
  key: string;
  label: string;
  type: FieldType;
  operators: MetricFilterOperator[];
  column?: string;
  attribute?: string;
}
const columns = {
  name: 'name',
  type: 'type',
  unit: 'unit',
  value: 'value',
  environment: 'environment',
  release: 'release',
  traceId: 'trace_id',
  spanId: 'span_id',
};
export const METRIC_FILTER_FIELDS: MetricField[] = [
  ...Object.entries(columns).map(([key, column]) => ({
    key,
    label: key,
    column,
    type: key === 'value' ? ('number' as const) : ('string' as const),
    operators: metricFieldOperators(key === 'value' ? 'number' : 'string'),
  })),
  ...METRIC_GROUP_FIELDS.filter((field) => field.key !== 'value').map(
    (field) => ({
      ...field,
      ...(field.key !== 'project' ? { attribute: field.key } : {}),
      operators: metricFieldOperators(field.type),
    }),
  ),
];
export function metricFilterField(key: unknown): MetricField | undefined {
  if (typeof key !== 'string') return undefined;
  const builtin = METRIC_FILTER_FIELDS.find((field) => field.key === key);
  if (builtin) return builtin;
  if (!key.startsWith('attributes.')) return undefined;
  const attribute = key.slice(11);
  if (
    !attribute.length ||
    attribute.length > 64 ||
    ['__proto__', 'constructor', 'prototype'].includes(attribute)
  )
    return undefined;
  return {
    key,
    label: key,
    attribute,
    type: 'mixed',
    operators: metricFieldOperators('mixed'),
  };
}
