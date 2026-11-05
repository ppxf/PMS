export interface MonitoringProfile {
  profileId: string;
  startedAt: string;
  durationMs: number;
  sampleIntervalMs: number;
  name: string;
  environment?: string;
  release?: string;
  traceId?: string;
  spanId?: string;
  truncated: boolean;
  resources: string[];
  frames: {
    name: string;
    resourceId?: number;
    line?: number;
    column?: number;
  }[];
  stacks: { frameId: number; parentId?: number }[];
  samples: { timestamp: number; stackId?: number }[];
}
export interface ProfileEnvelope {
  version: 1;
  type: 'profile';
  sentAt: string;
  profile: MonitoringProfile;
}
export interface ProfileDiagnosticEnvelope {
  version: 1;
  type: 'profile_diagnostic';
  sentAt: string;
  reason: 'permission_denied' | 'start_failed';
}
export type ProfileSummary = Omit<
  MonitoringProfile,
  'resources' | 'frames' | 'stacks' | 'samples'
> & { sampleCount: number };
export interface ProfileQuery {
  start: string;
  end: string;
  environment?: string;
  search?: string;
  traceId?: string;
  page: number;
  pageSize: number;
}
