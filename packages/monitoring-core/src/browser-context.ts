import type { BrowserEventContexts } from './types.js'

const URL_LIMIT = 2_048
const USER_AGENT_LIMIT = 1_024
const KEY_LIMIT = 128
const VALUE_LIMIT = 2_048
const MAP_LIMIT = 50
const LANGUAGE_LIMIT = 10
const LANGUAGE_VALUE_LIMIT = 64
const FILTERED = '[Filtered]'
const SENSITIVE_PARTS = [
  'authorization', 'cookie', 'set-cookie', 'token', 'session', 'password',
  'passwd', 'secret', 'credential', 'jwt', 'auth',
]

export interface BrowserContextSnapshot {
  url?: string
  contexts?: BrowserEventContexts
}

function read<T>(getter: () => T): T | undefined {
  try {
    return getter()
  } catch {
    return undefined
  }
}

function text(value: unknown, limit: number): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, limit) : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function compact<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined)
  return entries.length ? Object.fromEntries(entries) as T : undefined
}

function isSensitiveName(name: string): boolean {
  const normalized = name.toLowerCase()
  return SENSITIVE_PARTS.some((part) => normalized.includes(part))
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseCookies(serialized: string | undefined): Record<string, string> {
  if (!serialized) return {}
  const result: Record<string, string> = {}
  for (const part of serialized.split(';').slice(0, MAP_LIMIT)) {
    const separator = part.indexOf('=')
    const rawName = (separator < 0 ? part : part.slice(0, separator)).trim()
    if (!rawName) continue
    const decodedName = safeDecode(rawName)
    const name = decodedName.slice(0, KEY_LIMIT)
    const rawValue = separator < 0 ? '' : part.slice(separator + 1).trim()
    result[name] = isSensitiveName(decodedName) ? FILTERED : rawValue.slice(0, VALUE_LIMIT)
  }
  return result
}

function identifyBrowser(userAgent: string | undefined): { name?: string; version?: string } {
  if (!userAgent) return {}
  const patterns: Array<[string, RegExp]> = [
    ['Edge', /Edg\/([\d.]+)/],
    ['Chrome', /Chrome\/([\d.]+)/],
    ['Firefox', /Firefox\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ]
  for (const [name, pattern] of patterns) {
    const match = userAgent.match(pattern)
    if (match) return { name, version: match[1] }
  }
  return {}
}

function identifyClientHintBrowser(): { name?: string; version?: string } {
  const brands = read(() => (globalThis.navigator as Navigator & {
    userAgentData?: { brands?: Array<{ brand?: string; version?: string }> }
  }).userAgentData?.brands)
  const selected = brands?.find(({ brand }) =>
    brand && !/^(Chromium|Not[ _]A Brand)$/iu.test(brand),
  )
  if (!selected?.brand) return {}
  const names: Record<string, string> = {
    'Google Chrome': 'Chrome',
    'Microsoft Edge': 'Edge',
  }
  return {
    name: names[selected.brand] ?? selected.brand.slice(0, KEY_LIMIT),
    ...(selected.version ? { version: selected.version.slice(0, KEY_LIMIT) } : {}),
  }
}

function identifyOperatingSystem(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined
  if (/Windows/i.test(userAgent)) return 'Windows'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/(iPhone|iPad|iPod)/i.test(userAgent)) return 'iOS'
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macOS'
  if (/Linux/i.test(userAgent)) return 'Linux'
  return undefined
}

export function captureBrowserContext(): BrowserContextSnapshot {
  const href = text(read(() => globalThis.location.href), URL_LIMIT)
  const userAgent = text(read(() => globalThis.navigator.userAgent), USER_AGENT_LIMIT)
  const locale = text(read(() => globalThis.navigator.language), LANGUAGE_VALUE_LIMIT)
  const languages = read(() => Array.from(globalThis.navigator.languages ?? []))
    ?.slice(0, LANGUAGE_LIMIT)
    .map((value) => text(value, LANGUAGE_VALUE_LIMIT))
    .filter((value): value is string => value !== undefined)
  const referrer = text(read(() => globalThis.document.referrer), VALUE_LIMIT)
  const cookies = parseCookies(read(() => globalThis.document.cookie))
  const acceptLanguage = (languages?.length ? languages : locale ? [locale] : []).join(',')
  const headers = Object.fromEntries(
    [
      ['User-Agent', userAgent],
      ['Accept-Language', acceptLanguage || undefined],
      ['Referer', referrer],
    ].filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  const request = Object.keys(headers).length || Object.keys(cookies).length
    ? { headers, cookies }
    : undefined

  const clientHintIdentity = identifyClientHintBrowser()
  const browserIdentity = clientHintIdentity.name ? clientHintIdentity : identifyBrowser(userAgent)
  const browser = compact({ ...browserIdentity, userAgent })
  const os = compact({ name: identifyOperatingSystem(userAgent) })
  const device = compact({
    platform: text(read(() => globalThis.navigator.platform), KEY_LIMIT),
    screenWidth: number(read(() => globalThis.screen.width)),
    screenHeight: number(read(() => globalThis.screen.height)),
    viewportWidth: number(read(() => globalThis.innerWidth)),
    viewportHeight: number(read(() => globalThis.innerHeight)),
    pixelRatio: number(read(() => globalThis.devicePixelRatio)),
  })
  const timezone = text(
    read(() => new Intl.DateTimeFormat().resolvedOptions().timeZone),
    KEY_LIMIT,
  )
  const culture = compact({
    locale,
    languages: languages?.length ? languages : undefined,
    timezone,
  })
  const memoryApi = read(() => (globalThis.performance as Performance & {
    memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number }
  }).memory)
  const deviceMemory = read(() => (globalThis.navigator as Navigator & { deviceMemory?: number }).deviceMemory)
  const memory = compact({
    usedJSHeapSize: number(memoryApi?.usedJSHeapSize),
    totalJSHeapSize: number(memoryApi?.totalJSHeapSize),
    jsHeapSizeLimit: number(memoryApi?.jsHeapSizeLimit),
    deviceMemoryGiB: number(deviceMemory),
  })
  const contexts = compact({ request, browser, os, device, culture, memory })

  return {
    ...(href ? { url: href } : {}),
    ...(contexts ? { contexts } : {}),
  }
}
