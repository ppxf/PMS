import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setLocale } from '@/i18n'
import { selectValue } from '@/test/select'

import App from '@/App.vue'
import { useBodyScrollLock } from 'reka-ui'

describe('App', () => {
  it.each([true, false])(
    'avoids double scrollbar compensation with native gutter support=%s and preserves nested locking',
    async (supported) => {
      vi.stubGlobal('CSS', { supports: () => supported })
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(
        window.innerWidth - 15,
      )
      const component = defineComponent({
        setup() {
          const first = useBodyScrollLock(false),
            second = useBodyScrollLock(false)
          return () =>
            h('div', [
              h(
                'button',
                {
                  id: 'first',
                  onClick: () => {
                    first.value = !first.value
                  },
                },
                'first',
              ),
              h(
                'button',
                {
                  id: 'second',
                  onClick: () => {
                    second.value = !second.value
                  },
                },
                'second',
              ),
            ])
        },
      })
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component }],
      })
      await router.push('/')
      await router.isReady()
      const view = mount(App, { global: { plugins: [router] }, attachTo: document.body })
      try {
        await view.get('#first').trigger('click')
        await nextTick()
        expect(document.body.style.overflow).toBe('hidden')
        expect(document.body.style.paddingRight).toBe(supported ? '0px' : '15px')
        await view.get('#second').trigger('click')
        await view.get('#first').trigger('click')
        await nextTick()
        expect(document.body.style.overflow).toBe('hidden')
        await view.get('#second').trigger('click')
        await nextTick()
        expect(document.body.style.overflow).toBe('')
        expect(document.body.style.paddingRight).toBe('')
      } finally {
        view.unmount()
      }
    },
  )

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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
    await selectValue(wrapper, 'Language', 'zh-CN')
    await nextTick()
    expect(document.title).toBe('登录 · PMS')
    expect(document.documentElement.lang).toBe('zh-CN')
    wrapper.unmount()
  })
})
