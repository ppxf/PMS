import type { Directive } from 'vue'
import type { PermissionMode, PermissionRequirement } from '@/features/auth/model/permissions'

export interface PermissionDirectiveOptions {
  permissions: PermissionRequirement
  mode?: PermissionMode
  behavior?: 'disable' | 'hide'
}

export type PermissionDirectiveValue = PermissionRequirement | PermissionDirectiveOptions

type PermissionChecker = (requirement: PermissionRequirement, mode?: PermissionMode) => boolean

const originalDisabledState = new WeakMap<HTMLElement, boolean>()

function normalizeValue(value: PermissionDirectiveValue): PermissionDirectiveOptions {
  if (typeof value === 'object' && !Array.isArray(value) && 'permissions' in value) {
    return value
  }

  return { permissions: value as PermissionRequirement }
}

function setDisabled(element: HTMLElement, disabled: boolean): void {
  if (!originalDisabledState.has(element)) {
    originalDisabledState.set(element, 'disabled' in element ? Boolean(element.disabled) : false)
  }

  if ('disabled' in element) {
    element.disabled = disabled || Boolean(originalDisabledState.get(element))
  }

  element.setAttribute('aria-disabled', String(disabled))
}

export function createPermissionDirective(
  canAccess: PermissionChecker,
): Directive<HTMLElement, PermissionDirectiveValue> {
  function applyPermission(element: HTMLElement, value: PermissionDirectiveValue): void {
    const options = normalizeValue(value)
    const allowed = canAccess(options.permissions, options.mode)

    if (options.behavior === 'disable') {
      element.hidden = false
      setDisabled(element, !allowed)
      return
    }

    element.hidden = !allowed
  }

  return {
    mounted(element, binding) {
      applyPermission(element, binding.value)
    },
    updated(element, binding) {
      applyPermission(element, binding.value)
    },
  }
}
