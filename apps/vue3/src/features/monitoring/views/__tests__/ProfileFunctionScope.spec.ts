import { describe, expect, it } from 'vitest'
import { profileFunctionKind } from '../../model/profile-function-scope'
describe('profile function source classification', () => {
  it.each([
    ['http://localhost:3002/node_modules/.vite/deps/@pms_monitoring-vue.js?v=abc', 'sdk'],
    ['https://host/node_modules/@pms/monitoring-core/dist/index.js', 'sdk'],
    ['https://host/node_modules/.pnpm/pkg/node_modules/@pms/monitoring-vue/dist/index.js', 'sdk'],
    ['http://host/packages/monitoring-core/src/profiling.ts', 'sdk'],
    ['http://host/node_modules/.vite/deps/vue.js', 'dependency'],
    ['http://host/src/read.ts', 'application'],
    ['http://host/src/startProfiler.ts', 'application'],
    ['http://host/src/app.js?name=@pms_monitoring-vue.js', 'application'],
    ['http://host/src/@pms_monitoring-vue-business.js', 'application'],
    [undefined, 'unknown'],
  ] as const)('classifies %s as %s', (resource, expected) => {
    expect(profileFunctionKind(resource)).toBe(expected)
  })
})
