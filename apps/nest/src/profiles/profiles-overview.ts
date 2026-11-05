import type { MonitoringProfile } from './profiles-contract';

export interface Distribution {
  avg: number;
  p50: number;
  p95: number;
}
export interface FunctionOverview {
  key: string;
  name: string;
  resource?: string;
  line?: number;
  column?: number;
  profileId: string;
  count: number;
  self: Distribution;
  total: Distribution;
  baselineSelfP95: number | null;
  changePercent: number | null;
}
export interface ProfileOverview {
  profileCount: number;
  baselineProfileCount: number;
  durationMs: number;
  unsampledMs: number;
  functions: FunctionOverview[];
  transactions: (Distribution & {
    name: string;
    count: number;
    profileId: string;
  })[];
  flamegraph: {
    name: string;
    resource?: string;
    frameId?: number;
    stackId: number;
    depth: number;
    start: number;
    end: number;
  }[];
}
function distribution(values: number[]): Distribution {
  values.sort((a, b) => a - b);
  const quantile = (p: number) => {
    const position = (values.length - 1) * p;
    const lower = Math.floor(position);
    return (
      values[lower] +
      (values[Math.ceil(position)] - values[lower]) * (position - lower)
    );
  };
  return {
    avg: values.reduce((sum, n) => sum + n, 0) / values.length,
    p50: quantile(0.5),
    p95: quantile(0.95),
  };
}
interface FunctionSamples {
  info: Omit<
    FunctionOverview,
    'count' | 'self' | 'total' | 'baselineSelfP95' | 'changePercent'
  >;
  self: number[];
  total: number[];
}
interface FlameNode {
  name: string;
  resource?: string;
  frameId?: number;
  weight: number;
  children: Map<string, FlameNode>;
}

export function buildProfileOverview(
  current: MonitoringProfile[],
  previous: MonitoringProfile[],
): ProfileOverview {
  const root: FlameNode = { name: 'root', weight: 0, children: new Map() };
  const frameIds = new Map<string, number>();
  let unsampledMs = 0;
  function collect(profiles: MonitoringProfile[], flame: boolean) {
    const functions = new Map<string, FunctionSamples>();
    for (const profile of profiles) {
      const frames = profile.frames.map((frame) => {
        const resource =
          frame.resourceId == null
            ? undefined
            : profile.resources[frame.resourceId];
        const key = JSON.stringify([
          frame.name,
          resource ?? null,
          frame.line ?? null,
          frame.column ?? null,
        ]);
        return {
          key,
          name: frame.name,
          resource,
          line: frame.line,
          column: frame.column,
          profileId: profile.profileId,
        };
      });
      const paths: number[][] = [];
      for (const stack of profile.stacks)
        paths.push([
          ...(stack.parentId == null ? [] : paths[stack.parentId]),
          stack.frameId,
        ]);
      const local = new Map<
        string,
        { self: number; total: number; frame: (typeof frames)[number] }
      >();
      const interval = (start: number, end: number, stackId?: number) => {
        const weight = end - start;
        if (weight <= 0) return;
        const path = stackId == null ? [] : paths[stackId];
        if (!path.length && flame) unsampledMs += weight;
        let node = root;
        const seen = new Set<string>();
        for (const [depth, frameId] of path.entries()) {
          const frame = frames[frameId];
          let value = local.get(frame.key);
          if (!value) {
            value = { self: 0, total: 0, frame };
            local.set(frame.key, value);
          }
          if (!seen.has(frame.key)) value.total += weight;
          seen.add(frame.key);
          if (depth === path.length - 1) value.self += weight;
          if (flame) {
            let child = node.children.get(frame.key);
            if (!frameIds.has(frame.key))
              frameIds.set(frame.key, frameIds.size);
            if (!child) {
              child = {
                name: frame.name,
                resource: frame.resource,
                frameId: frameIds.get(frame.key),
                weight: 0,
                children: new Map(),
              };
              node.children.set(frame.key, child);
            }
            child.weight += weight;
            node = child;
          }
        }
        if (flame && !path.length) {
          const key = '__unsampled__';
          const child = root.children.get(key) ?? {
            name: 'Unsampled',
            weight: 0,
            children: new Map<string, FlameNode>(),
          };
          child.weight += weight;
          root.children.set(key, child);
        }
      };
      interval(0, profile.samples[0]?.timestamp ?? profile.durationMs);
      profile.samples.forEach((sample, index) =>
        interval(
          sample.timestamp,
          profile.samples[index + 1]?.timestamp ?? profile.durationMs,
          sample.stackId,
        ),
      );
      for (const [key, value] of local) {
        const entry = functions.get(key) ?? {
          info: value.frame,
          self: [],
          total: [],
        };
        entry.self.push(value.self);
        entry.total.push(value.total);
        functions.set(key, entry);
      }
    }
    return functions;
  }
  const baseline = collect(previous, false);
  const functions = [...collect(current, true)].map(
    ([key, value]): FunctionOverview => {
      const self = distribution(value.self);
      const old = baseline.get(key);
      const baselineSelfP95 = old ? distribution(old.self).p95 : null;
      return {
        ...value.info,
        count: value.self.length,
        self,
        total: distribution(value.total),
        baselineSelfP95,
        changePercent:
          baselineSelfP95 != null && baselineSelfP95 > 0
            ? ((self.p95 - baselineSelfP95) / baselineSelfP95) * 100
            : null,
      };
    },
  );
  const transactions = new Map<
    string,
    { profileId: string; durations: number[] }
  >();
  for (const p of current) {
    const group = transactions.get(p.name) ?? {
      profileId: p.profileId,
      durations: [],
    };
    group.durations.push(p.durationMs);
    transactions.set(p.name, group);
  }
  const flamegraph: ProfileOverview['flamegraph'] = [];
  function layout(
    children: Map<string, FlameNode>,
    start: number,
    depth: number,
  ) {
    for (const [, node] of [...children].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      flamegraph.push({
        name: node.name,
        resource: node.resource,
        frameId: node.frameId,
        stackId: flamegraph.length,
        depth,
        start,
        end: start + node.weight,
      });
      layout(node.children, start, depth + 1);
      start += node.weight;
    }
  }
  layout(root.children, 0, 0);
  return {
    profileCount: current.length,
    baselineProfileCount: previous.length,
    durationMs: current.reduce((sum, p) => sum + p.durationMs, 0),
    unsampledMs,
    functions,
    transactions: [...transactions].map(([name, group]) => ({
      name,
      profileId: group.profileId,
      count: group.durations.length,
      ...distribution(group.durations),
    })),
    flamegraph,
  };
}
