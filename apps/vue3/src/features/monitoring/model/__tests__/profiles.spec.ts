import { describe, expect, it } from 'vitest'
import { analyzeProfile, type Profile } from '../profiles'

const profile: Profile = {
  profileId: 'p',
  startedAt: '2026-10-23T00:00:00Z',
  name: 'Home',
  durationMs: 30,
  sampleIntervalMs: 10,
  truncated: false,
  resources: ['app.js'],
  frames: [{ name: 'root' }, { name: 'child' }],
  stacks: [{ frameId: 0 }, { frameId: 1, parentId: 0 }],
  samples: [
    { timestamp: 0, stackId: 0 },
    { timestamp: 10, stackId: 1 },
    { timestamp: 20, stackId: 1 },
  ],
}
describe('profile sample analysis', () => {
  it('weights adjacent intervals and the final sample to duration', () => {
    const result = analyzeProfile(profile)
    expect(result.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'root', totalMs: 30, selfMs: 10 }),
        expect.objectContaining({ name: 'child', totalMs: 20, selfMs: 20 }),
      ]),
    )
    expect(result.segments.find((s) => s.name === 'child')).toMatchObject({
      start: 10,
      end: 30,
      depth: 1,
    })
  })
  it('counts recursive function total only once per sample', () => {
    const result = analyzeProfile({
      ...profile,
      stacks: [{ frameId: 0 }, { frameId: 0, parentId: 0 }],
      samples: [{ timestamp: 0, stackId: 1 }],
    })
    expect(result.functions).toEqual([
      expect.objectContaining({ name: 'root', totalMs: 30, selfMs: 30 }),
    ])
  })
  it('keeps missing stacks separate and supports empty samples', () => {
    expect(analyzeProfile({ ...profile, samples: [] })).toEqual({
      functions: [],
      segments: [],
      unsampledMs: 30,
    })
    expect(
      analyzeProfile({ ...profile, samples: [{ timestamp: 0 }, { timestamp: 10, stackId: 0 }] })
        .unsampledMs,
    ).toBe(10)
    expect(analyzeProfile({ ...profile, samples: [{ timestamp: 0 }] }).segments[0]).toMatchObject({
      name: 'Unsampled',
      start: 0,
      end: 30,
    })
  })
  it('uses interval weights instead of sample counts', () => {
    const result = analyzeProfile({
      ...profile,
      samples: [
        { timestamp: 0, stackId: 0 },
        { timestamp: 2, stackId: 1 },
      ],
    })
    expect(result.functions.find((f) => f.name === 'child')?.selfMs).toBe(28)
  })
  it('keeps the initial sample gap unsampled and avoids zero-duration attribution', () => {
    const result = analyzeProfile({ ...profile, samples: [{ timestamp: 10, stackId: 0 }] })
    expect(result.unsampledMs).toBe(10)
    expect(result.functions[0]?.selfMs).toBe(20)
    expect(analyzeProfile({ ...profile, durationMs: 0 }).functions).toEqual([])
  })
})
