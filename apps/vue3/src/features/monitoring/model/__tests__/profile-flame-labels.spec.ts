import { describe, expect, it } from 'vitest'
import { profileFlamegraph } from '../profile-flamegraph'
import { profileFlameLabels } from '../profile-flame-labels'

describe('full flamegraph labels', () => {
  const measure = (text: string) => Array.from(text).length * 7
  it('labels tiny bars without changing their sampled-time proportions', () => {
    const graph = profileFlamegraph(
      [
        { frameId: 0, name: 'main', start: 0, end: 15.6, depth: 0 },
        { frameId: 1, name: 'safe', start: 15.6, end: 15.9, depth: 0 },
      ],
      20,
    )
    const result = profileFlameLabels(graph.frames, graph.duration, 1000, measure)
    expect(result.items[0]!.width).toBeCloseTo(981.132, 3)
    expect(result.items[1]!.width).toBeCloseTo(18.868, 3)
    expect(result.items[0]!.label.outside).toBe(false)
    expect(result.items[1]!.label.outside).toBe(true)
    expect(result.items[1]!.label.lines.join('')).toBe('safe · 0.30 ms')
    expect(result.items[1]!.label.y).toBeGreaterThan(result.items[1]!.y + 29)
  })
  it('wraps full names and separates colliding labels into different lanes', () => {
    const graph = profileFlamegraph(
      Array.from({ length: 3 }, (_, index) => ({
        frameId: index,
        name: `function_${index}_` + 'longName'.repeat(15),
        start: index,
        end: index + 1,
        depth: 0,
      })),
      3,
    )
    const result = profileFlameLabels(graph.frames, graph.duration, 240, measure)
    for (const item of result.items) {
      expect(item.label.lines.join('')).toContain(item.frame.name)
      expect(item.label.x).toBeGreaterThanOrEqual(0)
      expect(item.label.x + item.label.width).toBeLessThanOrEqual(240)
      expect(item.label.y + item.label.height).toBeLessThanOrEqual(result.height)
    }
    for (let i = 0; i < result.items.length; i++)
      for (let j = i + 1; j < result.items.length; j++) {
        const a = result.items[i]!.label,
          b = result.items[j]!.label
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        ).toBe(true)
      }
  })
})
