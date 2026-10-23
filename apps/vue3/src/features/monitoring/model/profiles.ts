export interface ProfileFrame {
  name: string
  resourceId?: number
  line?: number
  column?: number
}
export interface Profile {
  profileId: string
  startedAt: string
  durationMs: number
  sampleIntervalMs: number
  name: string
  environment?: string
  release?: string
  traceId?: string
  spanId?: string
  truncated: boolean
  resources: string[]
  frames: ProfileFrame[]
  stacks: { frameId: number; parentId?: number }[]
  samples: { timestamp: number; stackId?: number }[]
}
export type ProfileSummary = Omit<Profile, 'resources' | 'frames' | 'stacks' | 'samples'> & {
  sampleCount: number
}
export interface ProfileQuery {
  start: string
  end: string
  environment?: string
  search?: string
  traceId?: string
  page?: number
  pageSize?: number
}
export interface ProfilePage {
  items: ProfileSummary[]
  total: number
  page: number
  pageSize: number
}
export interface ProfileFunction {
  frameId: number
  name: string
  resource?: string
  line?: number
  column?: number
  selfMs: number
  totalMs: number
}
export interface ProfileSegment {
  frameId?: number
  stackId?: number
  name: string
  start: number
  end: number
  depth: number
}

export function analyzeProfile(profile: Profile): {
  functions: ProfileFunction[]
  segments: ProfileSegment[]
  unsampledMs: number
} {
  const functions = new Map<number, ProfileFunction>()
  const segments: ProfileSegment[] = []
  const paths: number[][] = []
  let unsampledMs = profile.samples.length ? 0 : Math.max(0, profile.durationMs)
  // Protocol parents precede children. Cache each bounded path once.
  for (const [index, stack] of profile.stacks.entries()) {
    const parent =
      stack.parentId == null ? [] : stack.parentId < index ? paths[stack.parentId] : undefined
    paths.push(
      parent && parent.length < 128 && profile.frames[stack.frameId] ? [...parent, index] : [],
    )
  }
  const lastByDepth: (ProfileSegment | undefined)[] = []
  function interval(start: number, end: number, stackId?: number) {
    if (end <= start) return
    const path = stackId == null ? undefined : paths[stackId]
    const seen = new Set<number>()
    if (!path?.length) unsampledMs += end - start
    const chain: (number | undefined)[] = path?.length ? path : [undefined]
    for (const [depth, id] of chain.entries()) {
      const frameId = id == null ? undefined : profile.stacks[id]?.frameId
      const frame = frameId == null ? undefined : profile.frames[frameId]
      if (frame && frameId != null) {
        let fn = functions.get(frameId)
        if (!fn) {
          fn = {
            frameId,
            name: frame.name,
            resource: frame.resourceId == null ? undefined : profile.resources[frame.resourceId],
            line: frame.line,
            column: frame.column,
            totalMs: 0,
            selfMs: 0,
          }
          functions.set(frameId, fn)
        }
        if (!seen.has(frameId)) fn.totalMs += end - start
        seen.add(frameId)
        if (depth === chain.length - 1) fn.selfMs += end - start
      }
      const last = lastByDepth[depth]
      if (last && last.stackId === id && last.end === start) last.end = end
      else {
        const segment = {
          frameId,
          stackId: id,
          name: frame?.name ?? 'Unsampled',
          start,
          end,
          depth,
        }
        segments.push(segment)
        lastByDepth[depth] = segment
      }
    }
    lastByDepth.length = chain.length
  }
  if (profile.samples.length)
    interval(0, Math.min(profile.samples[0]!.timestamp, profile.durationMs))
  for (const [index, sample] of profile.samples.entries()) {
    interval(
      Math.max(0, sample.timestamp),
      Math.min(profile.samples[index + 1]?.timestamp ?? profile.durationMs, profile.durationMs),
      sample.stackId,
    )
  }
  return {
    functions: [...functions.values()].sort((a, b) => b.selfMs - a.selfMs || b.totalMs - a.totalMs),
    segments,
    unsampledMs,
  }
}
