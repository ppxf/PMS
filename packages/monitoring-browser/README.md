# PMS Vue Traces 接入指引

monitoring-vue 提供统一初始化和错误监控；monitoring-browser 提供可选 browserTracingIntegration()。两个包不互相依赖或引用，通过 core 的通用插件协议组合。只调用一次 Vue init，无需调用 browser init 或 initTraces。

## 1. 准备项目

执行数据库迁移，从 PMS 项目 SDK 接入页复制自动生成的初始化配置；使用 Traces 时在项目功能配置中启用 Traces。SDK 需先发布到项目使用的私有 npm；本仓库可使用工作区包。

```sh
pnpm add @pms/monitoring-vue @pms/monitoring-browser
```

业务应用 .env.local：

```dotenv
VITE_PMS_DSN=http://public-key@localhost:3001/api/sdk/project-id
```

按普通 SDK 接入方式调用 `init` 即开始采集和上报，无需授权码或域名绑定。默认项目允许任意来源上报；需要限制来源时，在 PMS 接入页填写项目的允许来源列表。

## 2. 在应用启动时初始化

Vue + Vite 示例；没有 Router 时删除 router 的导入、app.use 和 init 中的 router。

```ts
import { createApp } from 'vue'
import { init, startSpan } from '@pms/monitoring-vue'
import { browserTracingIntegration } from '@pms/monitoring-browser'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)

init({
  app,
  router,
  dsn: import.meta.env.VITE_PMS_DSN,
  environment: import.meta.env.MODE,
  integrations: [browserTracingIntegration()],
  tracesSampleRate: import.meta.env.DEV ? 1 : 0.1,
})

app.mount('#app')

// 可选业务操作；并发子操作显式关联 parent。
await startSpan({ name: 'load-orders', op: 'task' }, async (parent) => {
  return startSpan({ name: 'parse-orders', op: 'task', parent }, () => 42)
})
```

不填写 integrations 或填写空数组，Vue/window.error/unhandledrejection 错误监控继续工作，不收集 Traces。插件存在但 tracesSampleRate 缺省或为 0 时也不收集。配置应固定，不重复 init 切换插件。开发建议采样 1，生产可从 0.1 开始，列表数量表示采样记录数。

## 3. 浏览器上报与跨域测量

当前仅采集浏览器 spans，不支持 tracePropagationTargets，不注入 traceparent/tracestate/baggage，不实现服务端 Span 或分布式追踪。

PMS 仅对 SDK 上报及连接检查接口开放 CORS，允许任意来源的 POST/OPTIONS 请求；管理接口仍按 Nest CORS_ORIGINS 配置来源。接收数据时另行校验项目 key 和允许来源：`["*"]` 表示任意来源，精确 HTTP(S) Origin 列表表示限制来源，空列表禁止携带 Origin 的浏览器上报。已有非空白名单在迁移后保留，默认开放仅适用于新项目及旧空配置。

Origin 包括协议、域名和端口，不包含路径。支持如 `https://app.example.com` 或 `http://localhost:5173`，暂不支持 `*.example.com` 等域名通配。没有 Origin 的服务端/CLI 上报保持兼容，仍校验项目 key。来源过滤是浏览器数据接收规则，不能证明请求者身份或域名归属。

PMS 上报保留现有协议：Content-Type: application/json 与 X-PMS-Key，因此浏览器通常会先发 OPTIONS 预检。代理需放行上报接口的 OPTIONS 和 POST，并保留 Nest 的 CORS 响应头；SDK 不发送 Cookie。HTTPS 应用使用 HTTPS PMS DSN。业务 CSP 使用 connect-src 时，还需允许 DSN 的服务器地址。此处不需要业务 API 的追踪请求头。

DSN/key 用于向项目写入监控数据，不提供管理权限。项目来源过滤、数据格式与大小校验仍生效；上报接口有单实例 IP 基础限流，默认每 IP 每分钟 120 次、最多记录 10,000 个 IP，超额返回 429 与 Retry-After。多实例部署或代理汇聚来源时，需要网关限流和可信代理策略配合。当前版本没有实现 Sentry 的查询参数认证或免预检协议，开放跨域不依赖这些优化。

跨域 TTFB/大小测量需要目标业务 API 返回 Timing-Allow-Origin: https://app.example.com。没有该响应头时，部分 Resource Timing 测量保持未知，仍可记录浏览器观测的 HTTP span 耗时。该配置不涉及服务端 Span。

## 4. 验证与排障

1. 开发 tracesSampleRate 设为 1，刷新页面并发起请求。
2. 检查 PMS 上报的跨域预检与 transaction 请求成功，业务 API 不应因 SDK 新增追踪头。
3. 检查 PMS /sdk/{projectId}/envelope transaction 上报，Traces 页面选择同环境和时间。
4. 移除 integrations 后重新启动应用，错误监控仍正常且不再发送 transaction。

404 检查 DSN 中的项目 ID 与 key，403 检查项目允许来源与功能开关，429 表示限流。CORS 错误检查网关是否保留响应头及放行预检，业务 CSP 阻止请求时检查 connect-src。跨域测量缺失检查业务 API 的 Timing-Allow-Origin，缺失值保持未知。

## 5. Application Metrics 与 Trace 关联

在项目中开启 Application Metrics，并在 SDK 初始化时设置 `enableMetrics: true`。指标本身独立于 Trace 采样上报，支持 `metrics.count`、`metrics.gauge` 和 `metrics.distribution`。

指标上下文的优先级为：显式 `traceContext`、当前 `startSpan` 同步回调、尚未结束的页面加载或导航 Span。嵌套 `startSpan` 默认继承当前父 Span；回调返回或抛错后恢复原作用域。`startInactiveSpan` 不会自动成为当前作用域。

```ts
import { metrics, startSpan } from '@pms/monitoring-vue'

startSpan({ name: 'checkout', op: 'task' }, () => {
  metrics.count('button_click', 1) // 自动关联 checkout
})

await startSpan({ name: 'load-orders', op: 'task' }, async (span) => {
  const started = performance.now()
  await loadOrders()
  metrics.distribution('response_time', performance.now() - started, {
    unit: 'millisecond',
    traceContext: span.context,
  })
})
```

启用浏览器 Traces 后，普通 `metrics.*` 调用自动关联当前已采样的页面 Trace，无需手动调用 `startSpan`。页面 Trace 在加载/请求完成且空闲一秒后结束计时，但 SDK 保留页面上下文，因此稍后点击及 `await` 后的指标仍会关联该页面 Trace。导航切换时改用新页面上下文，页面隐藏、显式结束或超时后清除关联；Vue Router 应通过初始化的 `router` 选项接入，才能在路由切换时更新上下文。

浏览器没有可靠的原生异步局部上下文。若需要关联到特定业务子 Span（而非页面 Trace），`await` 之后仍应显式传入 `span.context`，避免并发任务串链。没有有效采样上下文时，指标仍会上报，但自动关联不填入 Trace ID。显式传入的上下文继续按原协议保存。

指标 Samples 的 Trace ID 链接携带 Span ID，打开瀑布图后定位对应 Span。Trace 详情的 Application Metrics 标签页展示同项目、同 Trace 的指标，支持名称搜索、分页及仅当前 Span 筛选；点击指标的 Span 可返回瀑布图。

后端提供 `GET /groups/:groupSlug/projects/:projectSlug/metrics/traces/:traceId`，支持 `page`、`pageSize`（最大 100）、`search` 和 `spanId`。原 `POST .../metrics/query` 也支持 `traceId` 和 `spanId` 筛选，`spanId` 必须与 `traceId` 一起传入。两种查询均校验项目所有者权限。

指标菜单按项目最近 7 天实际保留的数据生成，名称、类型和单位不会预设。`count` 在菜单中标记为 `counter`，默认 `sum`（上报增量的累计事件数），也支持 `count`（样本条数）；`gauge` 默认 `last`，支持 `avg/min/max/count`；`distribution` 默认 `p95`，支持 `p50/p99/avg/min/max/sum/count`。例如两次 `metrics.count('orders', 3)` 与 `metrics.count('orders', 2)` 的 `sum` 是 5、样本 `count` 是 2。数值样本的 `count` 没有毫秒等数值单位。

Group by 支持最多 5 个字段组合，包括 `client.address`、`project`、`sdk.name`、`sdk.version`、`user_agent.original`、`value`、`browser.name`、`browser.version`，以及实际上报的自定义属性。字段标注 string/number/boolean/mixed，组合结果保留数值和布尔类型；缺失维度显示“无属性”。`project` 在当前单项目查询中为项目 slug；`value` 按实际样本数值分组，自定义同名属性可使用 `attributes.value`。

SDK 自动采集 SDK/浏览器维度，浏览器身份优先使用 Client Hints，再解析 User-Agent。原始 User-Agent 按属性协议截取最多 256 个字符，不采集 Cookie 或请求头；客户端地址由接收端的请求 IP 提供，覆盖客户端同名属性，代理部署下按服务器可信代理设置解释。旧数据缺失的维度不会补造。本次新增维度复用已有 attributes 字段，无需新增数据库列。

Metrics 条件筛选采用与 Traces 相同的字段、运算符、值和可删除条件标签，字段来自 Metrics 本身：指标名称/类型/单位、value、environment、release、traceId/spanId、项目、SDK/浏览器维度及 `attributes.*`。环境已并入统一条件，原独立环境参数与 `{ key, value }` 属性等值条件已移除。查询条件格式为 `{ field, operator, value }`，支持 `eq/in/not_in/contains/exists/gt/gte/lt/lte`，运算符按字段类型提供，最多 10 条 AND 条件、每个多值条件最多 50 个值。`exists` 默认匹配存在的字段，传 `value: false` 匹配缺失字段；`not_in` 包含缺失字段，文本包含按字面量匹配，数值比较不会把文本属性强转成数值。条件同时约束样本、聚合与时间序列。

部署时可重新执行幂等的 `apps/nest/src/database/metrics-schema.sql`，为已有指标表补充 `monitoring_metrics_trace` 索引；开启 TypeORM synchronize 的开发环境会通过实体声明创建索引。本次不执行线上数据库变更。Trace 和指标独立上报及保留；未采样、尚未送达、截断或已清理的 Trace/Span 可能无法定位，详情页会提示并保留关联指标查询入口。

## 当前边界

本期仅浏览器侧 Traces，服务端 Span 与分布式追踪暂不实现。

自动采集页面加载、可选 Router 导航及 fetch/XHR。startSpan 保留业务返回/Promise/异常语义；startInactiveSpan 需 end()。队列为内存队列，页面关闭不保证送达。Web Vitals、self time 和完整后端自动埋点后续扩展。

原 standalone browser init/initTraces 保留兼容；Vue 接入不要调用它们。

参考：[Nest CORS](https://docs.nestjs.com/security/cors)、[W3C Trace Context](https://www.w3.org/TR/trace-context/)。
