# PMS 错误采集、归组与展示实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 打通 Vue SDK 网络验证与错误采集链路，将错误同步保存到事件表和错误归组表，并在 PMS 管理端提供错误列表与详情。

**架构：** `@pms/monitoring-core` 负责事件规范化、PMS Envelope 和 HTTP Transport；`@pms/monitoring-vue` 负责 Vue 与浏览器错误源。Nest 公开采集端点同步校验并在 PostgreSQL 事务中写入事件和归组，受保护的管理 API 提供分页列表与详情，Vue 管理端负责展示。

**技术栈：** TypeScript 5、Vue 3、Vite 8、Vitest 4、NestJS 11、TypeORM、PostgreSQL、Jest、class-validator、pnpm workspace。

**规格：** `docs/superpowers/specs/2026-09-23-monitoring-error-ingestion-design.md`

## 全局约束

- 采集协议为 PMS 自有的 `version: 1` JSON Envelope，不兼容 Sentry Envelope。
- 默认 Transport 使用 HTTP；SDK 网络错误不得抛回宿主应用。
- 自动捕获来源仅为 `vue`、`window` 和 `unhandledrejection`，另提供手动 `captureException`。
- 首版同步写 PostgreSQL，不引入队列、重试、批量、离线缓存或 Source Map。
- 每个错误事件必须写入 `monitoring_events`，同时按服务端 fingerprint 更新 `monitoring_error_issues`。
- public key 只有采集写权限；管理查询必须通过 JWT 与现有组所有权校验。
- 重复 `eventId` 幂等，不得重复增加 Issue 计数。
- 生产环境禁止 CORS 通配符，数据库结构通过 migration 创建。

## 文件结构

### SDK

- 修改 `packages/monitoring-core/src/types.ts`：事件来源、Envelope、Transport 与捕获上下文契约。
- 创建 `packages/monitoring-core/src/event.ts`：异常规范化、ID 和字段截断。
- 创建 `packages/monitoring-core/src/http-transport.ts`：连接报告和错误 Envelope 的 HTTP 发送。
- 修改 `packages/monitoring-core/src/client.ts`：默认 Transport、连接报告和 capture API。
- 修改 `packages/monitoring-core/src/index.ts`：公开 capture API 与新类型。
- 修改 `packages/monitoring-core/src/client.spec.ts`：core 红—绿测试。
- 修改 `packages/monitoring-vue/src/vue-client.ts`：Vue 与浏览器错误监听。
- 修改 `packages/monitoring-vue/src/index.ts`、`types.ts`：公开 capture API 和类型。
- 修改 `packages/monitoring-vue/src/vue-client.spec.ts`：Vue 捕获红—绿测试。

### Nest

- 创建 `apps/nest/src/monitoring-events/entities/monitoring-event.entity.ts`：不可变事件实体。
- 创建 `apps/nest/src/monitoring-events/entities/monitoring-error-issue.entity.ts`：错误归组实体。
- 创建 `apps/nest/src/monitoring-events/dto/ingest-envelope.dto.ts`：采集 DTO 与字段限制。
- 创建 `apps/nest/src/monitoring-events/dto/list-issues-query.dto.ts`：分页 DTO。
- 创建 `apps/nest/src/monitoring-events/fingerprint.ts`：服务端归组算法。
- 创建 `apps/nest/src/monitoring-events/monitoring-events.service.ts`：同步事务写入与管理查询。
- 创建 `apps/nest/src/monitoring-events/sdk-envelope.controller.ts`：公开采集接口。
- 创建 `apps/nest/src/monitoring-events/monitoring-issues.controller.ts`：受保护列表与详情接口。
- 创建 `apps/nest/src/monitoring-events/monitoring-events.module.ts`：模块装配。
- 创建对应 `*.spec.ts`：fingerprint、service 和 controller 测试。
- 修改 `apps/nest/src/app.module.ts`、`monitoring-projects.module.ts` 和 service：注册模块并复用项目校验。
- 创建 `apps/nest/src/database/migrations/1790125200000-CreateMonitoringEvents.ts`：两张表、约束和索引。
- 创建 `apps/nest/src/database/typeorm-data-source.ts`：TypeORM CLI 数据源。
- 修改 `apps/nest/package.json`：migration build/run/revert 脚本。
- 修改 `apps/nest/src/config/configuration.ts`、`env.validation.ts`、`.env.example` 和测试：监控来源 CORS。
- 修改 `apps/nest/src/main.ts`：管理端与采集端来源并集。
- 修改 `apps/nest/test/app.e2e-spec.ts`：采集、归组和权限 E2E。

### Vue 管理端

- 修改 `apps/vue3/src/features/monitoring/model/types.ts`：Issue、事件和分页响应类型。
- 修改 `apps/vue3/src/features/monitoring/api/monitoring.api.ts`：列表和详情 API。
- 修改相应 API 测试。
- 创建 `apps/vue3/src/features/monitoring/views/ProjectIssuesView.vue`：错误列表。
- 创建 `apps/vue3/src/features/monitoring/views/ProjectIssueDetailView.vue`：错误详情。
- 创建对应视图测试。
- 修改 `apps/vue3/src/features/monitoring/views/ProjectDetailView.vue` 和测试：错误入口与能力文案。
- 修改 `apps/vue3/src/router/routes.ts`：列表和详情路由。
- 修改 `apps/vue3/src/features/monitoring/utils/sdk-setup.ts` 和测试：更新初始化说明。

### 文档

- 修改 `apps/nest/README.md`、`apps/vue3/README.md`：采集协议、CORS、migration、接入和当前能力。

---

### 任务 1：Core SDK 事件协议、加工与 HTTP Transport

**文件：**
- 修改：`packages/monitoring-core/src/types.ts`
- 创建：`packages/monitoring-core/src/event.ts`
- 创建：`packages/monitoring-core/src/http-transport.ts`
- 修改：`packages/monitoring-core/src/client.ts`
- 修改：`packages/monitoring-core/src/index.ts`
- 修改：`packages/monitoring-core/src/client.spec.ts`

- [ ] **步骤 1：编写失败的协议和 Transport 测试**

测试必须先断言以下真实行为：

```ts
it('sends one client report to the DSN envelope endpoint on init', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
  init({ dsn, fetch: fetcher })
  await flushPromises()

  expect(fetcher).toHaveBeenCalledWith(
    'https://monitor.example.com/api/sdk/project-id/envelope',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-PMS-Key': 'public-key' }),
    }),
  )
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
    version: 1,
    type: 'client_report',
  })
})

it('normalizes and sends an exception event', async () => {
  const transport = new RecordingTransport()
  init({ dsn, transport })
  captureException(new TypeError('boom'), { source: 'manual' })
  await flushPromises()

  expect(transport.events[0]).toMatchObject({
    type: 'error',
    level: 'error',
    source: 'manual',
    message: 'boom',
    exception: { type: 'TypeError', value: 'boom' },
  })
})

it('does not reject when the network request fails', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
  init({ dsn, fetch: fetcher })
  await expect(captureException(new Error('boom'))).resolves.toBeUndefined()
})
```

- [ ] **步骤 2：运行 Core 测试验证红灯**

运行：

```bash
pnpm --filter @pms/monitoring-core test
```

预期：FAIL，原因是 `captureException`、Envelope 类型和 HTTP Transport 尚不存在，而不是测试语法或环境错误。

- [ ] **步骤 3：实现最小事件和 Envelope 契约**

在 `types.ts` 定义稳定接口：

```ts
export type MonitoringEventSource = 'vue' | 'window' | 'unhandledrejection' | 'manual'

export interface MonitoringEvent {
  eventId: string
  timestamp: string
  type: 'error'
  level: 'error'
  source: MonitoringEventSource
  message: string
  exception: MonitoringException
  url?: string
  environment?: string
  release?: string
  tags?: Record<string, string>
}

export type MonitoringEnvelope = ClientReportEnvelope | EventEnvelope
```

`MonitoringInitOptions` 增加可测试的 `fetch?: typeof globalThis.fetch`；`Transport` 改为 `send(envelope: MonitoringEnvelope)`，自定义 Transport 与默认 Transport 使用同一边界。

- [ ] **步骤 4：实现异常规范化和 HTTP Transport**

`event.ts` 对 `Error`、字符串和未知对象生成 UUID、ISO 时间、错误类型、消息与堆栈，并应用规格中的长度限制。`http-transport.ts` 将 Envelope POST 到 `${endpoint}/envelope`，设置 `Content-Type` 和 `X-PMS-Key`，捕获所有网络错误。

`client.ts` 初始化默认 HTTP Transport、只发送一次 `client_report`，并提供：

```ts
export function captureException(
  error: unknown,
  context: CaptureExceptionContext = {},
): Promise<void>
```

- [ ] **步骤 5：运行 Core 测试和静态检查验证绿灯**

运行：

```bash
pnpm --filter @pms/monitoring-core test
pnpm --filter @pms/monitoring-core typecheck
pnpm --filter @pms/monitoring-core lint
pnpm --filter @pms/monitoring-core build
```

预期：全部退出码为 0。

- [ ] **步骤 6：提交 Core SDK 交付物**

```bash
git add packages/monitoring-core
git commit -m "feat: 增加监控事件上报传输"
```

### 任务 2：Vue SDK 自动错误捕获

**文件：**
- 修改：`packages/monitoring-vue/src/vue-client.ts`
- 修改：`packages/monitoring-vue/src/index.ts`
- 修改：`packages/monitoring-vue/src/types.ts`
- 修改：`packages/monitoring-vue/src/vue-client.spec.ts`

- [ ] **步骤 1：编写失败的 Vue 和浏览器监听测试**

使用真实 Vue App 形态和可控的 browser target，断言：

```ts
it('captures Vue errors and preserves the existing handler', async () => {
  const original = vi.fn()
  app.config.errorHandler = original
  init({ app, dsn, transport })

  app.config.errorHandler?.(new Error('render failed'), null, 'render')
  await flushPromises()

  expect(transport.eventEnvelopes[0].event.source).toBe('vue')
  expect(original).toHaveBeenCalledOnce()
})

it.each([
  ['error', new ErrorEvent('error', { error: new Error('window failed') }), 'window'],
  ['unhandledrejection', new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new Error('promise failed') }), 'unhandledrejection'],
])('captures %s once', async (name, event, source) => {
  init({ app, dsn, transport })
  window.dispatchEvent(event)
  await flushPromises()
  expect(transport.eventEnvelopes.at(-1)?.event.source).toBe(source)
})
```

另加测试断言同一 App 重复初始化不重复监听，公开的 `captureException` 使用 `manual` 来源。

- [ ] **步骤 2：运行 Vue SDK 测试验证红灯**

运行：

```bash
pnpm --filter @pms/monitoring-vue test
```

预期：FAIL，原因是监听器和公开 capture API 尚不存在。

- [ ] **步骤 3：实现 Vue 捕获适配层**

在 `vue-client.ts` 保存每个 App 的安装状态，包装原 `errorHandler`，并仅在 `window` 存在时注册 `error` 与 `unhandledrejection`。所有捕获调用使用 `void captureException(...).catch(() => undefined)`，原 Vue handler 使用原参数继续调用。

公开：

```ts
export const captureException = (error: unknown) =>
  captureCoreException(error, { source: 'manual' })
```

- [ ] **步骤 4：运行 Vue SDK 质量门禁验证绿灯**

运行：

```bash
pnpm --filter @pms/monitoring-vue test
pnpm --filter @pms/monitoring-vue typecheck
pnpm --filter @pms/monitoring-vue lint
pnpm --filter @pms/monitoring-vue build
```

预期：全部退出码为 0，构建产物仍为单包 ESM 和类型声明。

- [ ] **步骤 5：提交 Vue SDK 交付物**

```bash
git add packages/monitoring-vue
git commit -m "feat: 捕获 Vue 与浏览器错误"
```

### 任务 3：Nest 数据模型、migration 与 fingerprint

**文件：**
- 创建：`apps/nest/src/monitoring-events/entities/monitoring-event.entity.ts`
- 创建：`apps/nest/src/monitoring-events/entities/monitoring-error-issue.entity.ts`
- 创建：`apps/nest/src/monitoring-events/fingerprint.ts`
- 创建：`apps/nest/src/monitoring-events/fingerprint.spec.ts`
- 创建：`apps/nest/src/database/migrations/1790125200000-CreateMonitoringEvents.ts`
- 创建：`apps/nest/src/database/typeorm-data-source.ts`
- 修改：`apps/nest/package.json`

- [ ] **步骤 1：编写失败的 fingerprint 测试**

```ts
it('groups equivalent whitespace and the same first stack frame', () => {
  const first = createErrorFingerprint({
    exceptionType: 'TypeError',
    message: 'payment   failed',
    stacktrace: 'TypeError: payment failed\n  at submitOrder (checkout.ts:10:3)\n  at click (...)',
    url: 'https://app.test/a',
  });
  const second = createErrorFingerprint({
    exceptionType: 'TypeError',
    message: ' payment failed ',
    stacktrace: 'TypeError: payment failed\n  at submitOrder (checkout.ts:10:3)\n  at another (...)',
    url: 'https://app.test/b',
  });
  expect(second).toEqual(first);
});
```

同时断言异常类型、消息或首业务堆栈不同会产生不同 fingerprint，无堆栈时回退 URL。

- [ ] **步骤 2：运行目标测试验证红灯**

运行：

```bash
pnpm --filter @pms/nest test -- fingerprint.spec.ts --runInBand
```

预期：FAIL，原因是 fingerprint 模块尚不存在。

- [ ] **步骤 3：实现实体和 fingerprint**

实体字段、外键、唯一约束和索引严格按规格实现。`createErrorFingerprint` 使用 Node `createHash('sha256')`；另导出 `findCulprit` 供服务写入 Issue。

- [ ] **步骤 4：实现 migration 与 CLI 数据源**

migration 创建 `monitoring_error_issues` 后创建 `monitoring_events`，再增加 Issue 的 `latest_event_id` 字段；回滚按反序删除。CLI 数据源读取现有 DB 环境变量并注册实体和 migrations。

`package.json` 增加：

```json
{
  "migration:run": "typeorm-ts-node-commonjs -d src/database/typeorm-data-source.ts migration:run",
  "migration:revert": "typeorm-ts-node-commonjs -d src/database/typeorm-data-source.ts migration:revert"
}
```

- [ ] **步骤 5：运行测试和 TypeScript 检查验证绿灯**

运行：

```bash
pnpm --filter @pms/nest test -- fingerprint.spec.ts --runInBand
pnpm --filter @pms/nest typecheck
```

预期：全部退出码为 0。

- [ ] **步骤 6：提交数据模型交付物**

```bash
git add apps/nest/src/monitoring-events apps/nest/src/database apps/nest/package.json
git commit -m "feat: 建立监控事件与错误归组模型"
```

### 任务 4：Nest 采集接口与同步事务处理

**文件：**
- 创建：`apps/nest/src/monitoring-events/dto/ingest-envelope.dto.ts`
- 创建：`apps/nest/src/monitoring-events/sdk-envelope.controller.ts`
- 创建：`apps/nest/src/monitoring-events/monitoring-events.service.ts`
- 创建：`apps/nest/src/monitoring-events/monitoring-events.module.ts`
- 创建：`apps/nest/src/monitoring-events/sdk-envelope.controller.spec.ts`
- 创建：`apps/nest/src/monitoring-events/monitoring-events.service.spec.ts`
- 修改：`apps/nest/src/monitoring-projects/monitoring-projects.service.ts`
- 修改：`apps/nest/src/monitoring-projects/monitoring-projects.module.ts`
- 修改：`apps/nest/src/app.module.ts`

- [ ] **步骤 1：编写失败的公开采集接口测试**

Controller 测试断言从 `X-PMS-Key` 和 `projectId` 调用服务，返回 202。Service 测试使用真实的事务回调假仓储，断言：

```ts
it('stores two events in one issue and increments the count', async () => {
  await service.ingest(projectId, publicKey, errorEnvelope('event-1'));
  await service.ingest(projectId, publicKey, errorEnvelope('event-2'));

  expect(events).toHaveLength(2);
  expect(issues).toHaveLength(1);
  expect(issues[0].eventCount).toBe(2);
});

it('accepts a duplicate event id without incrementing the issue', async () => {
  const envelope = errorEnvelope('event-1');
  await service.ingest(projectId, publicKey, envelope);
  await service.ingest(projectId, publicKey, envelope);
  expect(events).toHaveLength(1);
  expect(issues[0].eventCount).toBe(1);
});
```

另测 client report、错误 key、错误监控关闭、不同项目隔离和事务异常。

- [ ] **步骤 2：运行目标测试验证红灯**

运行：

```bash
pnpm --filter @pms/nest test -- monitoring-events --runInBand
```

预期：FAIL，原因是采集模块尚不存在。

- [ ] **步骤 3：实现 DTO 和公开 Controller**

使用 `class-validator` 和 `class-transformer` 的嵌套验证实现两种 Envelope。Controller：

```ts
@Post(':projectId/envelope')
@Public()
@HttpCode(HttpStatus.ACCEPTED)
@SkipResponseWrap()
ingest(
  @Param('projectId', new ParseUUIDPipe()) projectId: string,
  @Headers('x-pms-key') publicKey: string | undefined,
  @Body() envelope: IngestEnvelopeDto,
) {
  return this.events.ingest(projectId, publicKey, envelope);
}
```

- [ ] **步骤 4：实现同步事务服务**

`client_report` 更新连接时间。事件分支先检查重复 ID，再计算 fingerprint；事务中使用 PostgreSQL upsert 创建或递增 Issue，插入事件，更新 `latestEventId`，最后更新项目 `lastSeenAt`。发生唯一键竞态时整个事务回滚，重复事件按幂等成功处理。

扩展 `MonitoringProjectsService`，提供仅供采集模块使用的 `findSdkProject(projectId, publicKey)`，不暴露管理凭证。

- [ ] **步骤 5：运行采集测试和 Nest 质量检查验证绿灯**

运行：

```bash
pnpm --filter @pms/nest test -- monitoring-events --runInBand
pnpm --filter @pms/nest typecheck
pnpm --filter @pms/nest lint
```

预期：全部退出码为 0。

- [ ] **步骤 6：提交采集端交付物**

```bash
git add apps/nest/src/monitoring-events apps/nest/src/monitoring-projects apps/nest/src/app.module.ts
git commit -m "feat: 接收并同步归组监控错误"
```

### 任务 5：Nest 管理查询、CORS 与 E2E

**文件：**
- 创建：`apps/nest/src/monitoring-events/dto/list-issues-query.dto.ts`
- 创建：`apps/nest/src/monitoring-events/monitoring-issues.controller.ts`
- 创建：`apps/nest/src/monitoring-events/monitoring-issues.controller.spec.ts`
- 修改：`apps/nest/src/monitoring-events/monitoring-events.service.ts`
- 修改：`apps/nest/src/monitoring-events/monitoring-events.module.ts`
- 修改：`apps/nest/src/config/configuration.ts`
- 修改：`apps/nest/src/config/configuration.spec.ts`
- 修改：`apps/nest/src/config/env.validation.ts`
- 修改：`apps/nest/src/config/env.validation.spec.ts`
- 修改：`apps/nest/src/main.ts`
- 修改：`apps/nest/.env.example`
- 修改：`apps/nest/test/app.e2e-spec.ts`

- [ ] **步骤 1：编写失败的查询、权限、CORS 和 E2E 测试**

测试列表默认 `page=1&pageSize=20`、最近发生倒序、详情最近 20 条事件、资源所有权过滤以及不属于用户的 issue 返回 404。配置测试断言统一的来源列表同时覆盖管理端和监控客户端，并在生产环境拒绝 `CORS_ORIGINS=*`。

E2E 至少验证：合法 client report 更新连接状态；两个相同错误产生两条事件和一个 `eventCount=2` 的 Issue；另一个用户无法查询该 Issue。

- [ ] **步骤 2：运行目标测试验证红灯**

运行：

```bash
pnpm --filter @pms/nest test -- monitoring-issues configuration env.validation --runInBand
pnpm --filter @pms/nest test:e2e -- --runInBand
```

预期：新增断言因查询 API 和监控来源配置缺失而失败。

- [ ] **步骤 3：实现管理查询**

Controller 路径：

```ts
@Controller('groups/:groupSlug/projects/:projectSlug/issues')
```

Service 先通过 `findOwnedBySlug` 得到项目，再以 `project.id` 查询 Issue；列表返回 `{ items, total, page, pageSize }`，详情返回 Issue、最新事件和最近 20 条事件。

- [ ] **步骤 4：实现 CORS 和 E2E 所需装配**

`main.ts` 统一使用 `app.corsOrigins`。生产校验要求 `CORS_ORIGINS` 存在且不包含 `*`，本地默认同时包含管理端和 `http://localhost:3002`。

- [ ] **步骤 5：运行 Nest 完整验证**

运行：

```bash
pnpm --filter @pms/nest test -- --runInBand
pnpm --filter @pms/nest test:e2e -- --runInBand
pnpm --filter @pms/nest typecheck
pnpm --filter @pms/nest lint
pnpm --filter @pms/nest build
```

预期：全部退出码为 0；如果 E2E 需要数据库，使用项目既有测试数据库配置，不使用生产数据库。

- [ ] **步骤 6：提交管理 API 和配置交付物**

```bash
git add apps/nest
git commit -m "feat: 查询监控错误与连接状态"
```

### 任务 6：Vue 管理端错误列表与详情

**文件：**
- 修改：`apps/vue3/src/features/monitoring/model/types.ts`
- 修改：`apps/vue3/src/features/monitoring/api/monitoring.api.ts`
- 修改：`apps/vue3/src/features/monitoring/api/__tests__/monitoring.api.spec.ts`
- 创建：`apps/vue3/src/features/monitoring/views/ProjectIssuesView.vue`
- 创建：`apps/vue3/src/features/monitoring/views/ProjectIssueDetailView.vue`
- 创建：`apps/vue3/src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts`
- 修改：`apps/vue3/src/features/monitoring/views/ProjectDetailView.vue`
- 修改：`apps/vue3/src/features/monitoring/views/__tests__/ProjectViews.spec.ts`
- 修改：`apps/vue3/src/router/routes.ts`

- [ ] **步骤 1：编写失败的 API 和页面测试**

API 测试断言：

```ts
expect(axiosInstance.get).toHaveBeenCalledWith(
  '/groups/team/projects/web/issues',
  { params: { page: 2, pageSize: 20 } },
)
expect(axiosInstance.get).toHaveBeenCalledWith(
  '/groups/team/projects/web/issues/issue-id',
  undefined,
)
```

页面测试断言列表显示标题、`2 次`、环境、版本和时间；点击标题进入详情；详情保留堆栈换行并展示 tags 与最近事件；加载失败显示重试；项目详情显示“查看错误”。

- [ ] **步骤 2：运行 Vue 目标测试验证红灯**

运行：

```bash
pnpm --filter @pms/vue3 test -- monitoring.api.spec.ts ProjectIssueViews.spec.ts ProjectViews.spec.ts --maxWorkers=1
```

预期：FAIL，原因是类型、API、页面和路由尚不存在。

- [ ] **步骤 3：实现类型和 API**

定义 `MonitoringIssueSummary`、`MonitoringEventDetail`、`MonitoringIssueDetail`，API 使用现有 `PageResult<T>`：

```ts
export const listProjectIssues = (groupSlug, projectSlug, query) =>
  http.get<PageResult<MonitoringIssueSummary>>(
    `/groups/${groupSlug}/projects/${projectSlug}/issues`,
    { params: query },
  )
```

- [ ] **步骤 4：实现列表、详情和路由**

列表复用 `DataTable` 的服务端分页；详情使用现有 Card、Badge 和 Table，堆栈使用 `whitespace-pre-wrap break-words`。所有日期使用用户本地时间格式化，缺失 environment/release 显示 `-`。

路由名为 `project-issues` 和 `project-issue-detail`，项目详情添加入口。

- [ ] **步骤 5：运行 Vue 完整验证**

运行：

```bash
pnpm --filter @pms/vue3 test -- --maxWorkers=1
pnpm --filter @pms/vue3 typecheck
pnpm --filter @pms/vue3 lint
pnpm --filter @pms/vue3 build
```

预期：全部退出码为 0。

- [ ] **步骤 6：提交管理端交付物**

```bash
git add apps/vue3
git commit -m "feat: 展示错误列表与错误详情"
```

### 任务 7：接入指引、文档和全链路质量门禁

**文件：**
- 修改：`apps/vue3/src/features/monitoring/utils/sdk-setup.ts`
- 修改：`apps/vue3/src/features/monitoring/utils/__tests__/sdk-setup.spec.ts`
- 修改：`apps/vue3/src/features/monitoring/views/ProjectSetupView.vue`
- 修改：`apps/vue3/src/features/monitoring/views/__tests__/ProjectViews.spec.ts`
- 修改：`apps/nest/README.md`
- 修改：`apps/vue3/README.md`
- 修改：`pnpm-lock.yaml`（仅在依赖或脚本变更使其需要更新时）

- [ ] **步骤 1：编写失败的接入说明测试**

断言初始化示例描述 SDK 会发送连接报告并自动捕获错误，同时展示：

```ts
import { captureException, init as initPmsMonitoring } from '@pms/monitoring-vue'

initPmsMonitoring({ app, dsn: import.meta.env.VITE_PMS_DSN })
captureException(new Error('PMS SDK test error'))
```

页面不得重新出现原始 `/api/sdk/check` fetch 示例。

- [ ] **步骤 2：运行目标测试验证红灯**

运行：

```bash
pnpm --filter @pms/vue3 test -- sdk-setup.spec.ts ProjectViews.spec.ts --maxWorkers=1
```

预期：新增 capture 示例断言失败。

- [ ] **步骤 3：更新接入页面和文档**

接入页增加“发送测试错误”代码块；README 记录 Envelope 路径、`X-PMS-Key`、CORS、migration 命令、数据归组规则和当前不支持的能力。

- [ ] **步骤 4：打包并检查唯一对外 SDK**

运行：

```bash
pnpm --filter @pms/monitoring-vue pack --pack-destination ./artifacts
```

检查 tarball 只要求外部项目安装 `@pms/monitoring-vue`，构建产物包含 HTTP Transport 与自动捕获代码，不要求外部安装 workspace core 包。

- [ ] **步骤 5：运行全仓质量门禁**

运行：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

预期：所有命令退出码为 0，无新增 warning；若存在明确的既有失败，记录原始证据并单独运行所有受影响包的完整命令。

- [ ] **步骤 6：逐项核对验收场景**

确认：

- 初始化连接报告更新 `last_seen_at`。
- 同一错误两次上报产生两条事件、一个 Issue、计数 2。
- 重复 eventId 不重复计数。
- 禁用错误监控时 client report 成功、错误事件被拒绝。
- 列表和详情只能由资源所有者读取。
- SDK 网络失败不影响宿主应用。
- 管理端列表、详情、空态、错误态和分页均有测试。

- [ ] **步骤 7：请求独立代码审查并修复问题**

审查范围为规格提交之后的全部实现，重点检查采集端权限边界、事务原子性、幂等、Vue handler 链接、CORS 和 DTO 限制。Critical 与 Important 问题必须修复并重新验证。

- [ ] **步骤 8：提交文档与最终调整**

```bash
git add apps/nest/README.md apps/vue3/README.md apps/vue3/src/features/monitoring pnpm-lock.yaml
git commit -m "docs: 更新错误监控 SDK 接入说明"
```
