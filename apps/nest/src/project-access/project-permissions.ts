export const PROJECT_PERMISSIONS = [
  'project:audit:read',
  'project:issues:read',
  'project:traces:read',
  'project:metrics:read',
  'project:web-vitals:read',
  'project:logs:read',
  'project:profiles:read',
] as const;
export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number];
