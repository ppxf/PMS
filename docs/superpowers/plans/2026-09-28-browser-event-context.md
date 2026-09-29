# 浏览器错误事件上下文实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** Vue SDK 自动采集安全的浏览器错误上下文并在错误详情展示，同时从整个系统移除业务 `release` 字段。

**架构：** monitoring-core 在创建事件时调用纯浏览器上下文采集器，先限制数据并脱敏，再通过现有 envelope 发送。Nest DTO 负责协议边界校验，TypeORM 以 JSONB 保存上下文，管理端只在详情页展开高维数据。Vue 浏览器事件不创建 Runtime 数据。

**技术栈：** TypeScript、Vue 3、Vitest、NestJS、class-validator、TypeORM、PostgreSQL、Jest

**规格：** `docs/superpowers/specs/2026-09-28-browser-event-context-design.md`

## 全局约束

- 浏览器 JavaScript 无法采集 `HttpOnly` Cookie 或页面加载时的完整原始请求头。
- Header 和 Cookie 各最多 50 项；键名最多 128 字符，单值最多 2048 字符。
- User-Agent 最多 1024 字符；语言列表最多 10 项，单项最多 64 字符。
- 敏感 Header/Cookie 值必须在离开浏览器前替换为 `[Filtered]`。
- `url` 只能自动读取，不能通过 `captureException` 手动覆盖。
- Vue 浏览器事件不得展示 Runtime；内存 API 不可用时显示 `-`。
- `sdk.version` 保留；业务 `release` 从 SDK、协议、实体、API 和 UI 中彻底移除。
- 新增上下文字段必须可选，旧事件缺少上下文时仍可读取和展示。

## 文件结构

- 创建 `packages/monitoring-core/src/browser-context.ts`：安全读取、规范化和脱敏浏览器上下文。
- 创建 `packages/monitoring-core/src/browser-context.spec.ts`：采集器边界与安全测试。
- 修改 `packages/monitoring-core/src/types.ts`：新增上下文类型，删除业务 `release` 与手动 URL。
- 修改 `packages/monitoring-core/src/event.ts`：创建事件时自动合并浏览器快照。
- 修改 `packages/monitoring-core/src/client.ts`、`client.spec.ts`：删除 release 状态与协议字段，验证自动上下文。
- 修改 `packages/monitoring-vue/src/vue-client.spec.ts`：验证各 Vue 捕获入口沿用自动上下文。
- 修改 `apps/vue3/src/features/monitoring/utils/sdk-setup.ts` 及测试：生成代码不再出现 release。
- 修改 `apps/nest/src/monitoring-events/dto/ingest-envelope.dto.ts` 及测试：新增严格嵌套上下文 DTO，删除 release。
- 修改 `apps/nest/src/monitoring-events/ingest-envelope.pipe.ts` 及 HTTP 测试：更新协议白名单。
- 修改 `apps/nest/src/monitoring-events/entities/monitoring-event.entity.ts`：以 JSONB 保存上下文并删除 release。
- 修改 `apps/nest/src/monitoring-events/monitoring-events.service.ts` 及测试：持久化和返回上下文。
- 修改 `apps/nest/test/app.e2e-spec.ts`：更新完整链路 fixture 与响应断言。
- 修改 `apps/vue3/src/features/monitoring/model/types.ts`：同步 API 类型。
- 修改 `apps/vue3/src/features/monitoring/views/ProjectIssuesView.vue`：删除版本列。
- 修改 `apps/vue3/src/features/monitoring/views/ProjectIssueDetailView.vue`：展示请求、浏览器、设备、文化与内存上下文。
- 修改 `apps/vue3/src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts`：覆盖详情展示、脱敏值和空状态。

---

### 任务 1：浏览器上下文采集器与核心事件协议

**文件：**
- 创建：`packages/monitoring-core/src/browser-context.ts`
- 创建：`packages/monitoring-core/src/browser-context.spec.ts`
- 修改：`packages/monitoring-core/src/types.ts`
- 修改：`packages/monitoring-core/src/event.ts`
- 修改：`packages/monitoring-core/src/client.ts`
- 测试：`packages/monitoring-core/src/client.spec.ts`

- [ ] **步骤 1：编写采集、脱敏、缺失 API 和自动 URL 的失败测试**

在 `browser-context.spec.ts` 中用 `vi.stubGlobal` 提供 `location`、`navigator`、`document`、`screen` 和 `performance`，断言：

```ts
expect(captureBrowserContext()).toEqual({
  url: 'https://app.example.com/checkout?step=2',
  contexts: {
    request: {
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/152.0.0.0',
        'Accept-Language': 'zh-CN,en-US',
        Referer: 'https://app.example.com/cart',
      },
      cookies: { theme: 'dark', session_id: '[Filtered]' },
    },
    browser: expect.objectContaining({ name: 'Chrome', version: '152.0.0.0' }),
    os: { name: 'Windows' },
    device: expect.objectContaining({ screenWidth: 1920, viewportWidth: 1280 }),
    culture: { locale: 'zh-CN', languages: ['zh-CN', 'en-US'], timezone: 'Asia/Shanghai' },
    memory: expect.objectContaining({ usedJSHeapSize: 1048576, deviceMemoryGiB: 16 }),
  },
})
```

再覆盖 getter 抛错时返回空快照、Cookie 非法编码继续解析、超过 50 项截断、敏感关键词大小写不敏感、负数和无限内存值被丢弃。

在 `client.spec.ts` 修改捕获测试：不再给 `captureException` 传 `url`，而是 stub `location.href`；断言事件包含自动 URL 和 contexts，且没有 `release`。

- [ ] **步骤 2：运行测试验证失败**

运行：

```powershell
& 'packages/monitoring-core/node_modules/.bin/vitest.CMD' run src/browser-context.spec.ts src/client.spec.ts
```

预期：FAIL，原因是 `captureBrowserContext`、`BrowserEventContexts` 尚不存在，且旧协议仍包含 `release`。

- [ ] **步骤 3：定义类型并实现最小安全采集器**

在 `types.ts` 定义 `RequestContext`、`BrowserContext`、`OperatingSystemContext`、`DeviceContext`、`CultureContext`、`MemoryContext`、`BrowserEventContexts`；`MonitoringEvent` 增加 `contexts?: BrowserEventContexts`。删除：

```ts
CaptureExceptionContext.url
MonitoringEvent.release
ClientReportEnvelope.release
MonitoringInitOptions.release
ClientState.release
```

在 `browser-context.ts` 导出：

```ts
export interface BrowserContextSnapshot {
  url?: string
  contexts?: BrowserEventContexts
}

export function captureBrowserContext(): BrowserContextSnapshot
```

实现独立的安全读取函数；任何 getter 异常只跳过该字段。使用固定敏感片段数组和 `isSensitiveName(name)`，在构造结果时完成 `[Filtered]` 替换。只有对象至少有一个有效字段时才加入结果。

在 `event.ts` 中调用 `captureBrowserContext()`，事件 URL 和 contexts 只来自采集器；`createEvent` 的 options 仅保留 `environment`。在 `client.ts` 删除所有 release 状态和客户端报告字段。

- [ ] **步骤 4：运行测试验证通过**

运行：

```powershell
& 'packages/monitoring-core/node_modules/.bin/vitest.CMD' run src/browser-context.spec.ts src/client.spec.ts
```

预期：两个测试文件全部 PASS，事件进入 RecordingTransport 前敏感值已经是 `[Filtered]`。

- [ ] **步骤 5：运行核心包类型检查并提交**

运行：

```powershell
& 'packages/monitoring-core/node_modules/.bin/tsc.CMD' --build packages/monitoring-core/tsconfig.json
```

提交：

```powershell
git add packages/monitoring-core/src
git commit -m "feat: collect browser error context"
```

---

### 任务 2：Vue SDK 捕获入口与接入代码

**文件：**
- 修改：`packages/monitoring-vue/src/vue-client.spec.ts`
- 修改：`apps/vue3/src/features/monitoring/utils/sdk-setup.ts`
- 测试：`apps/vue3/src/features/monitoring/utils/__tests__/sdk-setup.spec.ts`
- 测试：`apps/vue3/src/features/monitoring/views/__tests__/ProjectViews.spec.ts`

- [ ] **步骤 1：编写 Vue 捕获和接入代码失败测试**

在 Vue SDK 测试中为 `location.href` 提供固定值，分别触发 Vue error handler、`window.error` 和 `unhandledrejection`，断言每个事件 URL 都是该值且 contexts 存在。在 SDK 代码生成测试中加入：

```ts
expect(buildInitSnippet()).not.toContain('release')
expect(buildInitSnippet()).toContain('environment: import.meta.env.MODE')
```

项目接入页测试同样断言渲染文本不包含 `release:` 或 `VITE_RELEASE`。

- [ ] **步骤 2：运行测试验证失败**

运行：

```powershell
& 'packages/monitoring-vue/node_modules/.bin/vitest.CMD' run src/vue-client.spec.ts
& 'apps/vue3/node_modules/.bin/vitest.CMD' run src/features/monitoring/utils/__tests__/sdk-setup.spec.ts src/features/monitoring/views/__tests__/ProjectViews.spec.ts
```

预期：至少旧 release 断言或 fixture 失败；新增自动上下文断言在核心改造传播前失败。

- [ ] **步骤 3：更新 Vue 测试 fixture 与生成代码**

保持 `vue-client.ts` 捕获 API 不增加上下文参数，让它继续只传 `source`；核心层负责自动采集。删除所有传给 `initPmsMonitoring` 的 `release` 示例配置和相关文案。

- [ ] **步骤 4：运行 Vue SDK 与接入页测试验证通过**

重复步骤 2 命令。预期：全部 PASS，四类捕获入口都不要求业务方传 URL。

- [ ] **步骤 5：提交**

```powershell
git add packages/monitoring-vue apps/vue3/src/features/monitoring/utils apps/vue3/src/features/monitoring/views/__tests__/ProjectViews.spec.ts
git commit -m "feat: propagate automatic browser context"
```

---

### 任务 3：Nest 事件协议校验与持久化

**文件：**
- 修改：`apps/nest/src/monitoring-events/dto/ingest-envelope.dto.ts`
- 修改：`apps/nest/src/monitoring-events/dto/ingest-envelope.dto.spec.ts`
- 修改：`apps/nest/src/monitoring-events/ingest-envelope.pipe.ts`
- 修改：`apps/nest/src/monitoring-events/sdk-envelope.http.spec.ts`
- 修改：`apps/nest/src/monitoring-events/entities/monitoring-event.entity.ts`
- 修改：`apps/nest/src/monitoring-events/monitoring-events.service.ts`
- 测试：`apps/nest/src/monitoring-events/monitoring-events.service.spec.ts`

- [ ] **步骤 1：编写 DTO 与服务失败测试**

扩展合法 envelope fixture：

```ts
contexts: {
  request: {
    headers: { 'User-Agent': 'Mozilla/5.0', Authorization: '[Filtered]' },
    cookies: { theme: 'dark', session_id: '[Filtered]' },
  },
  browser: { name: 'Chrome', version: '152.0.0.0', userAgent: 'Mozilla/5.0' },
  os: { name: 'Windows' },
  device: { platform: 'Win32', screenWidth: 1920, viewportWidth: 1280, pixelRatio: 1 },
  culture: { locale: 'zh-CN', languages: ['zh-CN'], timezone: 'Asia/Shanghai' },
  memory: { usedJSHeapSize: 1048576, deviceMemoryGiB: 16 },
}
```

断言合法值通过；第 51 个 Header、128 字符以上键名、2048 字符以上值、未知字段、负数/Infinity、11 个语言均拒绝。断言任何 event 或 client_report 上的业务 `release` 都被白名单拒绝。

服务测试断言 `manager.insert(MonitoringEvent, ...)` 收到 `contexts`，详情读取返回相同对象，摘要不含 `release`。

- [ ] **步骤 2：运行测试验证失败**

运行：

```powershell
& 'apps/nest/node_modules/.bin/jest.CMD' --runInBand src/monitoring-events/dto/ingest-envelope.dto.spec.ts src/monitoring-events/monitoring-events.service.spec.ts src/monitoring-events/sdk-envelope.http.spec.ts
```

预期：FAIL，原因是 DTO 拒绝 contexts、实体没有 contexts、服务仍映射 release。

- [ ] **步骤 3：实现严格 DTO、实体和服务映射**

在 DTO 文件定义嵌套类，并对 Map 使用自定义约束验证项目数、键和值长度。对数值字段组合使用 `@IsNumber({ allowInfinity: false, allowNaN: false })` 与 `@Min(0)`。在 `MonitoringErrorEventDto` 加：

```ts
@ValidateIf((_object, value: unknown) => value !== undefined)
@IsObject()
@ValidateNested()
@Type(() => BrowserEventContextsDto)
contexts?: BrowserEventContextsDto;
```

更新 `ingest-envelope.pipe.ts` 的事件字段白名单，加入 `contexts` 并删除 `release`；客户端报告白名单删除 `release`。

实体使用：

```ts
@Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
contexts!: Record<string, unknown>;
```

删除 release 列。服务写入 `contexts: event.contexts ?? {}`，selection 和 `toEvent` 返回 contexts，摘要不再选择或返回 release。

- [ ] **步骤 4：运行 Nest 定向测试验证通过**

重复步骤 2 命令。预期：全部 PASS。

- [ ] **步骤 5：提交**

```powershell
git add apps/nest/src/monitoring-events
git commit -m "feat: persist validated browser contexts"
```

---

### 任务 4：管理端错误列表与详情展示

**文件：**
- 修改：`apps/vue3/src/features/monitoring/model/types.ts`
- 修改：`apps/vue3/src/features/monitoring/views/ProjectIssuesView.vue`
- 修改：`apps/vue3/src/features/monitoring/views/ProjectIssueDetailView.vue`
- 测试：`apps/vue3/src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts`

- [ ] **步骤 1：编写 UI 失败测试**

fixture 删除 release，加入完整 contexts。详情测试断言：

```ts
expect(wrapper.text()).toContain('请求信息')
expect(wrapper.text()).toContain('User-Agent')
expect(wrapper.text()).toContain('session_id')
expect(wrapper.text()).toContain('[Filtered]')
expect(wrapper.text()).toContain('浏览器上下文')
expect(wrapper.text()).toContain('Chrome 152.0.0.0')
expect(wrapper.text()).toContain('Asia/Shanghai')
expect(wrapper.text()).toContain('1 MiB')
expect(wrapper.text()).not.toContain('版本')
expect(wrapper.text()).not.toContain('Runtime')
```

缺失上下文 fixture 断言页面仍渲染且请求、浏览器和内存区域显示 `-`。错误列表测试断言表头不含“版本”。

- [ ] **步骤 2：运行测试验证失败**

运行：

```powershell
& 'apps/vue3/node_modules/.bin/vitest.CMD' run src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts
```

预期：FAIL，页面仍显示版本且没有上下文卡片。

- [ ] **步骤 3：更新类型与列表**

在 `types.ts` 添加与核心协议一致的可选 contexts 类型，删除 summary/detail 的 release。`ProjectIssuesView.vue` 删除 release accessor 列。

- [ ] **步骤 4：实现详情卡片和格式化辅助函数**

在详情组件添加：

```ts
function formatBytes(value: number | undefined): string {
  if (value === undefined) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 ** 2).toFixed(1)} MiB`
}

function sortedEntries(value: Record<string, string> | undefined) {
  return Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right))
}
```

新增请求信息、浏览器上下文和内存内容；对象键值使用 `dl`，长值使用 `break-all`。删除最新事件版本字段和最近事件版本列，将空表格 `colspan` 从 5 调整为 4。不要添加 Runtime 标题或空占位。

- [ ] **步骤 5：运行 UI 测试验证通过**

重复步骤 2 命令。预期：全部 PASS。

- [ ] **步骤 6：提交**

```powershell
git add apps/vue3/src/features/monitoring/model apps/vue3/src/features/monitoring/views
git commit -m "feat: display browser error context"
```

---

### 任务 5：完整 HTTP 链路、数据库说明与最终验证

**文件：**
- 修改：`apps/nest/test/app.e2e-spec.ts`
- 修改：`apps/nest/.env.example`
- 修改：`apps/nest/README.md`

- [ ] **步骤 1：更新 E2E fixture 并编写上下文链路断言**

事件上报 fixture 删除 release 并加入 contexts。上报两个同指纹事件后，断言列表没有 release，详情的 latestEvent 与 recentEvents 返回 contexts；再上报不含 contexts 的旧格式事件并断言返回 `{}` 或前端可接受的空对象。

- [ ] **步骤 2：运行 E2E 测试验证失败**

运行：

```powershell
& 'apps/nest/node_modules/.bin/jest.CMD' --config test/jest-e2e.json --runInBand test/app.e2e-spec.ts
```

预期：如果本地测试数据库可用，新增断言在服务映射或 schema 未更新时 FAIL；若数据库未启用，记录环境限制并继续执行所有不依赖数据库的验证。

- [ ] **步骤 3：完成 E2E 映射和数据库升级说明**

更新测试数据库 schema fixture：删除 `release`，新增：

```sql
contexts jsonb NOT NULL DEFAULT '{}'::jsonb
```

在 README 的数据库配置部分记录关闭 `DB_SYNCHRONIZE` 时需要执行：

```sql
ALTER TABLE monitoring_events DROP COLUMN IF EXISTS release;
ALTER TABLE monitoring_events
  ADD COLUMN IF NOT EXISTS contexts jsonb NOT NULL DEFAULT '{}'::jsonb;
```

`.env.example` 保持现有同步开关，只补充注释说明生产环境应关闭自动同步并手动执行结构变更。

- [ ] **步骤 4：运行各工作区完整验证**

运行：

```powershell
& 'packages/monitoring-core/node_modules/.bin/vitest.CMD' run
& 'packages/monitoring-vue/node_modules/.bin/vitest.CMD' run
& 'apps/nest/node_modules/.bin/jest.CMD' --runInBand
& 'apps/vue3/node_modules/.bin/vitest.CMD' run
& 'node_modules/.bin/turbo.CMD' run typecheck lint build
```

预期：所有命令 exit code 0，无失败测试、类型错误或 lint 错误。

- [ ] **步骤 5：扫描遗留业务 release 引用**

运行：

```powershell
rg -n "\brelease\b|版本" packages/monitoring-core packages/monitoring-vue apps/nest/src/monitoring-events apps/vue3/src/features/monitoring
```

预期：只允许设计/迁移说明、SDK 自身 `sdk.version` 或与本功能无关的合法文本；不得出现 `MonitoringInitOptions.release`、事件 release、实体 release、API release 或错误 UI“版本”。

- [ ] **步骤 6：对照验收标准并提交**

逐项核对规格的 8 条验收标准，确认每条都有对应测试输出。提交：

```powershell
git add apps/nest/test apps/nest/.env.example apps/nest/README.md docs/superpowers
git commit -m "test: verify browser event context end to end"
```
