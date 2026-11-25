import type { ProfileSegment } from './profiles'

export interface FlameFrame {
  name: string
  segment: ProfileSegment
  segments: ProfileSegment[]
  depth: number
  start: number
  end: number
  totalMs: number
  count: number
  averageMs: number
}

export interface FlameGroup {
  index: number
  root: FlameFrame
  duration: number
  sharePercent: number
  frames: FlameFrame[]
}

/** Group by the observed root call, with no inferred lifecycle or business labels. */
export function profileFlameGroups(graph: {
  frames: FlameFrame[]
  duration: number
}): FlameGroup[] {
  const groups: FlameGroup[] = []
  let group: FlameGroup | undefined
  for (const frame of graph.frames) {
    if (frame.depth === 0) {
      group = {
        index: groups.length,
        root: frame,
        duration: frame.totalMs,
        sharePercent: graph.duration > 0 ? (frame.totalMs / graph.duration) * 100 : 0,
        frames: [],
      }
      groups.push(group)
    }
    if (group)
      group.frames.push({
        ...frame,
        start: frame.start - group.root.start,
        end: frame.end - group.root.start,
      })
  }
  return groups
}

interface Node {
  name: string
  segment: ProfileSegment
  segments: ProfileSegment[]
  children: Map<string, Node>
  totalMs: number
  count: number
}

/** Fold identical named call paths, then pack inclusive sampled time without idle gaps. */
export function profileFlamegraph(segments: ProfileSegment[], durationMs: number) {
  const roots = new Map<string, Node>()
  const parents: { segment: ProfileSegment; node: Node }[] = []
  const ordered = segments
    .filter(
      (segment) =>
        segment.frameId != null &&
        segment.name.trim() &&
        Number((Math.min(durationMs, segment.end) - Math.max(0, segment.start)).toFixed(2)) > 0,
    )
    .slice()
    .sort((a, b) => a.start - b.start || a.depth - b.depth || b.end - a.end)
  for (const segment of ordered) {
    while (parents.length) {
      const parent = parents[parents.length - 1]!.segment
      if (
        parent.depth < segment.depth &&
        parent.start <= segment.start &&
        parent.end >= segment.end
      )
        break
      parents.pop()
    }
    const siblings = parents[parents.length - 1]?.node.children ?? roots
    const name = segment.name.trim()
    const key = JSON.stringify([name, segment.resource ?? null])
    let node = siblings.get(key)
    if (!node) {
      node = { name, segment, segments: [], children: new Map(), totalMs: 0, count: 0 }
      siblings.set(key, node)
    }
    node.segments.push(segment)
    if (segment.end - segment.start > node.segment.end - node.segment.start) node.segment = segment
    parents.push({ segment, node })
  }
  function measure(nodes: Map<string, Node>) {
    let total = 0
    for (const node of nodes.values()) {
      let lastEnd = -Infinity
      for (const segment of node.segments.slice().sort((a, b) => a.start - b.start)) {
        const start = Math.max(0, segment.start)
        const end = Math.min(durationMs, segment.end)
        if (start > lastEnd) node.count++
        node.totalMs += Math.max(0, end - Math.max(start, lastEnd))
        lastEnd = Math.max(lastEnd, end)
      }
      measure(node.children)
      total += node.totalMs
    }
    return total
  }
  const duration = measure(roots)
  const frames: FlameFrame[] = []
  function place(nodes: Map<string, Node>, start: number, depth: number) {
    for (const node of [...nodes.values()].sort(
      (a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name),
    )) {
      const end = start + node.totalMs
      frames.push({
        name: node.name,
        segment: node.segment,
        segments: node.segments,
        start,
        end,
        depth,
        totalMs: node.totalMs,
        count: node.count,
        averageMs: node.totalMs / node.count,
      })
      place(node.children, start, depth + 1)
      start = end
    }
  }
  place(roots, 0, 0)
  return { frames, duration }
}
