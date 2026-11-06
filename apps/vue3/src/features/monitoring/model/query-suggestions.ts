// Suggestions are drawn only from loaded records, never treated as an exhaustive value list.
export function querySuggestions(fields: { key: string }[], rows: object[]) {
  const aliases: Record<string, string> = {
    'span.op': 'op',
    'span.name': 'name',
    'span.status': 'status',
    'span.truncated': 'truncated',
    'span.duration': 'durationMs',
    is_transaction: 'isTransaction',
    'page.route': 'pageRoute',
    'http.method': 'httpMethod',
    'http.route': 'httpRoute',
    'http.status_code': 'httpStatusCode',
    severity: 'level',
    trace: 'traceId',
  }
  return Object.fromEntries(
    fields.map(({ key }) => [
      key,
      [
        ...new Set(
          rows.flatMap((row) => {
            const record = row as Record<string, unknown>
            const attributes = record.attributes as Record<string, unknown> | undefined
            const value = key.startsWith('attributes.')
              ? attributes?.[key.slice(11)]
              : (record[aliases[key] ?? key] ?? attributes?.[key])
            return ['string', 'number', 'boolean'].includes(typeof value) ? [value] : []
          }),
        ),
      ],
    ]),
  )
}
