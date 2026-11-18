import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setLocale } from '@/i18n'

import App from '@/App.vue'

describe('App', () => {
  afterEach(() => {
    setLocale('en')
    localStorage.removeItem('pms.locale')
  })

  it('renders the router outlet and exposes language selection on blank pages', async () => {
    setLocale('en')
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          component: defineComponent({ template: '<div data-test="router-view" />' }),
          meta: { title: 'Sign in', layout: 'blank' },
        },
      ],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.find('[data-test="router-view"]').exists()).toBe(true)
    expect(document.title).toBe('Sign in · PMS')
    await wrapper.get('[data-testid="language-switcher"]').setValue('zh-CN')
    await nextTick()
    expect(document.title).toBe('登录 · PMS')
    expect(document.documentElement.lang).toBe('zh-CN')
    wrapper.unmount()
  })
})
