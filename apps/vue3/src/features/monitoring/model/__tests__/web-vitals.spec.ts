import { describe, expect, it } from 'vitest'
import { formatVital, formatRate } from '../web-vitals'
describe('Web Vitals missing data', () => {
  it('does not show a failing zero when no complete core sample exists', () => {
    expect(formatRate(null)).toBe('Insufficient data')
    expect(formatRate(0)).toBe('0%')
  })
  it('preserves CLS units and missing p75', () => {
    expect(formatVital('CLS', 0.123)).toBe('0.123')
    expect(formatVital('LCP', null)).toBe('—')
  })
})
