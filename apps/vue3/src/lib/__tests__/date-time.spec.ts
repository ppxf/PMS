import { describe, expect, it } from 'vitest'
import { formatDateTime } from '../date-time'

describe('formatDateTime', () => {
  it('formats instants in the selected timezone using a 24-hour clock', () => {
    expect(formatDateTime('2026-11-13T07:55:59.716Z', { timeZone: 'Asia/Shanghai' })).toBe(
      '2026-11-13 15:55:59',
    )
    expect(formatDateTime('2026-11-13T00:00:00Z', { timeZone: 'UTC' })).toBe('2026-11-13 00:00:00')
  })
  it('preserves milliseconds for trace timing and supports Date and epoch milliseconds', () => {
    const value = '2026-11-13T07:55:59.007Z'
    const options = { timeZone: 'Asia/Shanghai', milliseconds: true }
    expect(formatDateTime(value, options)).toBe('2026-11-13 15:55:59.007')
    expect(formatDateTime(new Date(value), options)).toBe(
      formatDateTime(Date.parse(value), options),
    )
    expect(formatDateTime(0, { timeZone: 'UTC' })).toBe('1970-01-01 00:00:00')
  })
  it('uses the browser timezone by default and handles absent or invalid dates', () => {
    const value = new Date(2026, 10, 13, 15, 55, 59)
    expect(formatDateTime(value)).toBe('2026-11-13 15:55:59')
    for (const input of [null, undefined, '', 'invalid', NaN, new Date(NaN)]) {
      expect(formatDateTime(input)).toBe('—')
    }
  })
})
