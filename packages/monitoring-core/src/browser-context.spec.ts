import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureBrowserContext } from './browser-context.js'

describe('browser context capture', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ignores Chromium GREASE brands and returns the real browser version', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/152.0.0.0 Safari/537.36',
      userAgentData: {
        brands: [
          { brand: 'Not;A_Brand', version: '24' },
          { brand: 'Chromium', version: '152' },
          { brand: 'Google Chrome', version: '152' },
        ],
      },
    })

    expect(captureBrowserContext().contexts?.browser).toMatchObject({
      name: 'Chrome',
      version: '152',
    })
  })

  it('captures page, request, browser, device, culture and memory data safely', () => {
    vi.stubGlobal('location', { href: 'https://app.example.com/checkout?step=2' })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/152.0.0.0 Safari/537.36',
      language: 'zh-CN',
      languages: ['zh-CN', 'en-US'],
      platform: 'Win32',
      deviceMemory: 16,
      userAgentData: {
        brands: [
          { brand: 'Chromium', version: '152' },
          { brand: 'Google Chrome', version: '152.0.0.0' },
        ],
      },
    })
    vi.stubGlobal('document', {
      referrer: 'https://app.example.com/cart',
      cookie: 'theme=dark; session_id=secret; AUTH_TOKEN=credential',
    })
    vi.stubGlobal('screen', { width: 1920, height: 1080 })
    vi.stubGlobal('innerWidth', 1280)
    vi.stubGlobal('innerHeight', 720)
    vi.stubGlobal('devicePixelRatio', 1.5)
    vi.stubGlobal('performance', {
      memory: { usedJSHeapSize: 1_048_576, totalJSHeapSize: 2_097_152, jsHeapSizeLimit: 4_194_304 },
    })

    const snapshot = captureBrowserContext()

    expect(snapshot.url).toBe('https://app.example.com/checkout?step=2')
    expect(snapshot.contexts?.request).toEqual({
      headers: {
        'User-Agent': expect.stringContaining('Chrome/152.0.0.0'),
        'Accept-Language': 'zh-CN,en-US',
        Referer: 'https://app.example.com/cart',
      },
      cookies: { theme: 'dark', session_id: '[Filtered]', AUTH_TOKEN: '[Filtered]' },
    })
    expect(snapshot.contexts?.browser).toMatchObject({ name: 'Chrome', version: '152.0.0.0' })
    expect(snapshot.contexts?.os).toEqual({ name: 'Windows' })
    expect(snapshot.contexts?.device).toEqual({
      platform: 'Win32', screenWidth: 1920, screenHeight: 1080,
      viewportWidth: 1280, viewportHeight: 720, pixelRatio: 1.5,
    })
    expect(snapshot.contexts?.culture).toMatchObject({ locale: 'zh-CN', languages: ['zh-CN', 'en-US'] })
    expect(snapshot.contexts?.culture?.timezone).toBeTruthy()
    expect(snapshot.contexts?.memory).toEqual({
      usedJSHeapSize: 1_048_576, totalJSHeapSize: 2_097_152,
      jsHeapSizeLimit: 4_194_304, deviceMemoryGiB: 16,
    })
  })

  it('limits maps and strings, tolerates malformed cookies, and drops invalid numbers', () => {
    const cookies = Array.from({ length: 55 }, (_, index) =>
      `${index === 0 ? '%E0%A4%A' : `key-${index}`}=${'v'.repeat(2_100)}`,
    ).join('; ')
    vi.stubGlobal('location', { href: `https://example.com/${'x'.repeat(2_100)}` })
    vi.stubGlobal('navigator', {
      userAgent: 'u'.repeat(1_100), language: 'l'.repeat(100),
      languages: Array.from({ length: 12 }, (_, index) => `lang-${index}`),
      deviceMemory: Number.POSITIVE_INFINITY,
    })
    vi.stubGlobal('document', { referrer: '', cookie: cookies })
    vi.stubGlobal('screen', { width: -1, height: Number.NaN })
    vi.stubGlobal('performance', { memory: { usedJSHeapSize: -1 } })

    const snapshot = captureBrowserContext()

    expect(snapshot.url).toHaveLength(2_048)
    expect(Object.keys(snapshot.contexts?.request?.cookies ?? {})).toHaveLength(50)
    expect(snapshot.contexts?.request?.cookies['%E0%A4%A']).toHaveLength(2_048)
    expect(snapshot.contexts?.browser?.userAgent).toHaveLength(1_024)
    expect(snapshot.contexts?.culture?.languages).toHaveLength(10)
    expect(snapshot.contexts?.culture?.languages?.[0]).toHaveLength(6)
    expect(snapshot.contexts?.memory).toBeUndefined()
    expect(snapshot.contexts?.device?.screenWidth).toBeUndefined()
  })

  it('filters a sensitive cookie before truncating its long name', () => {
    const name = `${'a'.repeat(128)}-session-token`
    vi.stubGlobal('location', { href: 'https://example.com' })
    vi.stubGlobal('navigator', { userAgent: 'test-agent' })
    vi.stubGlobal('document', { referrer: '', cookie: `${name}=secret-value` })

    const cookies = captureBrowserContext().contexts?.request?.cookies
    expect(Object.values(cookies ?? {})).toEqual(['[Filtered]'])
    expect(Object.keys(cookies ?? {})[0]).toHaveLength(128)
  })

  it('keeps independent context fields when URL and user agent are unavailable', () => {
    vi.stubGlobal('location', Object.defineProperty({}, 'href', { get: () => { throw new Error('denied') } }))
    vi.stubGlobal('navigator', Object.defineProperty({}, 'userAgent', { get: () => { throw new Error('denied') } }))
    vi.stubGlobal('document', Object.defineProperty({}, 'cookie', { get: () => { throw new Error('denied') } }))

    const snapshot = captureBrowserContext()
    expect(snapshot.url).toBeUndefined()
    expect(snapshot.contexts?.browser).toBeUndefined()
    expect(snapshot.contexts?.culture?.timezone).toBeTruthy()
  })
})
