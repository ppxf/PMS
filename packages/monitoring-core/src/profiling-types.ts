export interface ProfileFrame {
  name: string;
  resourceId?: number;
  line?: number;
  column?: number;
}
export interface ProfileStack {
  frameId: number;
  parentId?: number;
}
export interface ProfileSample {
  timestamp: number;
  stackId?: number;
}
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
  captureMode?: "manual" | "trace";
  endReason?:
    "completed" | "manual_takeover" | "collection_limit" | "page_hidden";
  truncated: boolean;
  resources: string[];
  frames: ProfileFrame[];
  stacks: ProfileStack[];
  samples: ProfileSample[];
}
export interface ProfileEnvelope {
  version: 1;
  type: "profile";
  sentAt: string;
  profile: MonitoringProfile;
}
export interface ProfileDiagnosticEnvelope {
  version: 1;
  type: "profile_diagnostic";
  sentAt: string;
  reason: "permission_denied" | "start_failed";
}
export interface ProfileStartOptions {
  name?: string;
  traceId?: string;
  spanId?: string;
}
export interface ProfileCapture {
  stop(): Promise<void>;
}
export interface UIProfiler {
  startProfiler(
    options?: ProfileStartOptions,
  ): ProfileCapture | undefined | Promise<ProfileCapture | undefined>;
  getStartStatus(): string;
  stopProfiler(): Promise<void>;
}
