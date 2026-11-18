import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectLocale, intlLocale, locale, LOCALE_STORAGE_KEY, setLocale, translate } from '..'

beforeEach(() => setLocale('en'))
afterEach(() => {
  vi.restoreAllMocks()
  setLocale('en')
  localStorage.removeItem(LOCALE_STORAGE_KEY)
})

describe('interface languages', () => {
  it('uses the saved language before the browser language and falls back to English', () => {
    expect(detectLocale('en', ['zh-CN'])).toBe('en')
    expect(detectLocale('zh-CN', ['en-US'])).toBe('zh-CN')
    expect(detectLocale(null, ['zh-Hans-CN'])).toBe('zh-CN')
    expect(detectLocale('invalid', ['fr-FR'])).toBe('en')
    expect(detectLocale()).toBe('en')
  })

  it('persists the choice and updates the document language and formatting locale', () => {
    setLocale('zh-CN')
    expect(locale.value).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN')
    expect(intlLocale()).toBe('zh-CN')
    expect(translate('Feature settings')).toBe('功能开关')
    setLocale('en')
    expect(intlLocale('en-GB')).toBe('en-GB')
    expect(translate('Feature settings')).toBe('Feature settings')
  })

  it('supports dynamic feedback, normalized copy, and untranslated technical values', () => {
    setLocale('zh-CN')
    expect(translate('Copied initialization code')).toBe('已复制初始化代码')
    expect(translate('Restore after 1,000 events')).toBe('达到 1,000 条事件后恢复')
    expect(translate('Unable to update Logging settings. Please try again.')).toBe(
      '更新日志采集设置失败，请重试。',
    )
    expect(translate('  Feature\n settings ')).toBe('功能开关')
    expect(translate('span.duration')).toBe('span.duration')
    expect(translate('constructor')).toBe('constructor')
    expect(translate('__proto__')).toBe('__proto__')
    expect(translate('Unrecognized server response')).toBe('Unrecognized server response')
    expect(translate(null)).toBe('')
    expect(translate('{count}m ago', { count: 3 })).toBe('3 分钟前')
  })

  it('continues switching if storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => setLocale('zh-CN')).not.toThrow()
    expect(translate('Settings')).toBe('设置')
  })

  it('restores a saved preference on a fresh module load', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN')
    vi.resetModules()
    const fresh = await import('..')
    expect(fresh.locale.value).toBe('zh-CN')
    fresh.setLocale('en')
  })
})
