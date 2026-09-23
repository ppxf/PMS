import { createApp } from 'vue'
import { describe, expect, it } from 'vitest'
import { getVueClientState, init } from './vue-client.js'

describe('Vue monitoring initialization', () => {
  it('associates the Vue app with core state without replacing errorHandler', () => {
    const app = createApp({ template: '<div />' })
    const existingHandler = () => undefined
    app.config.errorHandler = existingHandler

    const state = init({
      app,
      dsn: 'http://vue-key@localhost:3001/api/sdk/vue-project',
      environment: 'test',
    })

    expect(state.projectId).toBe('vue-project')
    expect(getVueClientState(app)).toBe(state)
    expect(app.config.errorHandler).toBe(existingHandler)
  })

  it('rejects a value that is not a Vue application', () => {
    expect(() =>
      init({
        app: {} as never,
        dsn: 'http://vue-key@localhost:3001/api/sdk/vue-project',
      }),
    ).toThrow('Vue app')
  })
})
