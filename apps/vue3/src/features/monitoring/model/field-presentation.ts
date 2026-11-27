type KeyedField = { key: string }

export function fieldCategory(kind: 'log' | 'metric' | 'trace', key: string): string {
  if (kind === 'trace') {
    if (key === 'span.truncated') return 'Advanced'
    if (key.startsWith('http.')) return 'HTTP'
    if (key.startsWith('browser.web_vital.')) return 'Web Vitals'
    return 'Common'
  }
  const attribute = key.replace(/^attributes\./, '')
  if (kind === 'log' && attribute === 'log.source') return 'Common'
  if (/^(sdk\.|browser\.|client\.|user_agent\.)/.test(attribute)) return 'Technical attributes'
  if (key.startsWith('attributes.')) return 'Business attributes'
  if (['logId', 'spanId'].includes(key)) return 'Advanced'
  return 'Common'
}

export function logGroupFields<T extends KeyedField & { type: string }>(
  fields: T[],
  advanced = false,
): T[] {
  return fields.filter(
    ({ key, type }) =>
      ![
        'timestamp',
        'timestamp_precise',
        'payload_size',
        'logId',
        'spanId',
        'user_agent.original',
        'attributes.user_agent.original',
      ].includes(key) &&
      !['date', 'size'].includes(type) &&
      (advanced || !['message', 'trace'].includes(key)),
  )
}

export function visibleMetricFilters<T extends KeyedField>(fields: T[]): T[] {
  return fields.filter(({ key }) => !['name', 'type', 'unit', 'project'].includes(key))
}

export function visibleTraceFields(fields: string[]): string[] {
  return fields.filter((key) => key !== 'browser.web_vital.inp.target')
}
