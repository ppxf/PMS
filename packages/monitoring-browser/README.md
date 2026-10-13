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

## 当前边界

本期仅浏览器侧 Traces，服务端 Span 与分布式追踪暂不实现。

自动采集页面加载、可选 Router 导航及 fetch/XHR。startSpan 保留业务返回/Promise/异常语义；startInactiveSpan 需 end()。队列为内存队列，页面关闭不保证送达。Web Vitals、self time 和完整后端自动埋点后续扩展。

原 standalone browser init/initTraces 保留兼容；Vue 接入不要调用它们。

参考：[Nest CORS](https://docs.nestjs.com/security/cors)、[W3C Trace Context](https://www.w3.org/TR/trace-context/)。
