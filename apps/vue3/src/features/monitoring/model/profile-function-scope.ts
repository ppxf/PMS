export type ProfileFunctionKind = 'application' | 'sdk' | 'dependency' | 'unknown'

/** Classify by source, never by function name. Unknown frames remain visible. */
export function profileFunctionKind(resource?: string): ProfileFunctionKind {
  if (!resource) return 'unknown'
  let path = resource
  try {
    path = decodeURIComponent(resource)
  } catch {
    /* Keep malformed paths readable. */
  }
  path = path.replace(/\\/g, '/').split(/[?#]/, 1)[0]!
  if (
    /(?:^|\/)@pms\/(?:monitoring-core|monitoring-vue)(?:\/|$)/.test(path) ||
    /(?:^|\/)@pms_monitoring-(?:core|vue)(?:[._]|$)/.test(path) ||
    /(?:^|\/)packages\/monitoring-(?:core|vue)\/src\//.test(path)
  )
    return 'sdk'
  if (/(?:^|\/)node_modules\//.test(path) || /^(?:native|\[native code\])$/.test(path))
    return 'dependency'
  return 'application'
}
