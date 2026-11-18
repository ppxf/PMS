import { readonly, ref, watch } from 'vue'
import { zhCN } from './zh-CN'

export type Locale = 'en' | 'zh-CN'
export const LOCALE_STORAGE_KEY = 'pms.locale'

export function detectLocale(saved?: string | null, languages: readonly string[] = []): Locale {
  if (saved === 'en' || saved === 'zh-CN') return saved
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

function initialLocale(): Locale {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    // Language switching still works when browser storage is unavailable.
  }
  return detectLocale(saved, typeof navigator === 'undefined' ? [] : navigator.languages)
}

const currentLocale = ref<Locale>(initialLocale())
export const locale = readonly(currentLocale)

export function setLocale(value: Locale): void {
  currentLocale.value = value
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, value)
  } catch {
    // A blocked storage area must not prevent changing the current interface.
  }
}

watch(
  currentLocale,
  (value) => {
    if (typeof document !== 'undefined') document.documentElement.lang = value
  },
  { immediate: true, flush: 'sync' },
)

const templates = Object.entries(zhCN)
  .filter(([key]) => /\{\w+\}/.test(key))
  .sort(
    ([left], [right]) => right.replace(/\{\w+\}/g, '').length - left.replace(/\{\w+\}/g, '').length,
  )
  .map(([key, value]) => {
    const names: string[] = []
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = escaped.replace(/\\\{(\w+)\\\}/g, (_, name: string) => {
      names.push(name)
      return name === 'count' ? '([\\d,.]+)' : '(.+?)'
    })
    return { pattern: new RegExp(`^${pattern}$`), names, value }
  })

const hasMessage = (key: string): boolean => Object.prototype.hasOwnProperty.call(zhCN, key)

/** Translate interface copy only; never pass application payloads or protocol values here. */
export function translate(value: unknown, params?: Record<string, string | number>): string {
  const original =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
        ? String(value)
        : ''
  const key = original.replace(/\s+/g, ' ').trim()
  let result = original
  if (currentLocale.value === 'zh-CN') {
    result = hasMessage(key) ? zhCN[key]! : original
    if (!hasMessage(key)) {
      for (const template of templates) {
        const match = template.pattern.exec(key)
        if (!match) continue
        result = template.value.replace(/\{(\w+)\}/g, (_, name: string) => {
          const part = match[template.names.indexOf(name) + 1] ?? ''
          return ['label', 'feature', 'mode'].includes(name) && hasMessage(part)
            ? zhCN[part]!
            : part
        })
        break
      }
    }
  }
  return params
    ? result.replace(/\{(\w+)\}/g, (token, name: string) => String(params[name] ?? token))
    : result
}

export function intlLocale(english = 'en-US'): string {
  return currentLocale.value === 'zh-CN' ? 'zh-CN' : english
}
