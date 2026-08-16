export type PermissionMode = 'all' | 'any'
export type PermissionRequirement = string | readonly string[]

export function normalizePermissions(requirement: PermissionRequirement | undefined): string[] {
  if (!requirement) {
    return []
  }

  return typeof requirement === 'string' ? [requirement] : [...requirement]
}

export function hasPermissions(
  grantedPermissions: readonly string[],
  requirement: PermissionRequirement | undefined,
  mode: PermissionMode = 'all',
): boolean {
  const requiredPermissions = normalizePermissions(requirement)

  if (requiredPermissions.length === 0) {
    return true
  }

  const granted = new Set(grantedPermissions)

  if (granted.has('*')) {
    return true
  }

  const predicate = (permission: string) => granted.has(permission)
  return mode === 'any' ? requiredPermissions.some(predicate) : requiredPermissions.every(predicate)
}
