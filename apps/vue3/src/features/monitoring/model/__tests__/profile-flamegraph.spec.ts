import { describe, expect, it } from 'vitest'
import { profileFlamegraph } from '../profile-flamegraph'

describe('aggregated profile flamegraph', () => {
  it('folds distant identical stacks into full-width bars without idle time', () => {
    const result = profileFlamegraph(
      [
        { frameId: 0, name: 'run', start: 0, end: 10, depth: 0 },
        { frameId: 1, name: '', start: 0, end: 10, depth: 1 },
        { frameId: 2, name: 'render', start: 0, end: 10, depth: 2 },
        { frameId: 0, name: 'run', start: 1000, end: 1010, depth: 0 },
        { frameId: 2, name: 'render', start: 1000, end: 1010, depth: 1 },
      ],
      1100,
    )
    expect(result.duration).toBe(20)
    expect(
      result.frames.map(({ name, start, end, depth, count }) => ({
        name,
        start,
        end,
        depth,
        count,
      })),
    ).toEqual([
      { name: 'run', start: 0, end: 20, depth: 0, count: 2 },
      { name: 'render', start: 0, end: 20, depth: 1, count: 2 },
    ])
  })
  it('retains separate call paths and packs all sibling branches proportionally', () => {
    const result = profileFlamegraph(
      [
        { frameId: 0, name: 'run', start: 0, end: 20, depth: 0 },
        { frameId: 1, name: 'render', start: 0, end: 8, depth: 1 },
        { frameId: 2, name: 'request', start: 8, end: 20, depth: 1 },
        { frameId: 1, name: 'render', start: 10, end: 14, depth: 2 },
        { frameId: 3, name: 'timeout', start: 1000, end: 1010, depth: 0 },
      ],
      1100,
    )
    expect(result.duration).toBe(30)
    expect(
      result.frames.map(({ name, start, end, depth }) => ({ name, start, end, depth })),
    ).toEqual([
      { name: 'run', start: 0, end: 20, depth: 0 },
      { name: 'request', start: 0, end: 12, depth: 1 },
      { name: 'render', start: 0, end: 4, depth: 2 },
      { name: 'render', start: 12, end: 20, depth: 1 },
      { name: 'timeout', start: 20, end: 30, depth: 0 },
    ])
  })
  it('clips capture boundaries and rejects unnamed and zero-time frames', () => {
    const result = profileFlamegraph(
      [
        { frameId: 0, name: 'run', start: -10, end: 5, depth: 0 },
        { frameId: 1, name: '', start: 5, end: 20, depth: 0 },
        { frameId: 2, name: 'tiny', start: 5, end: 5.001, depth: 0 },
        { frameId: 3, name: 'late', start: 50, end: 70, depth: 0 },
      ],
      10,
    )
    expect(result.duration).toBe(5)
    expect(result.frames.map((frame) => frame.name)).toEqual(['run'])
  })
})
