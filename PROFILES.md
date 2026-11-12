# Profiles

Profiles 用浏览器的真实 JavaScript 调用栈样本分析函数耗时，可用于排查页面卡顿和长任务。实现参考 [Sentry Vue Profiling](https://docs.sentry.io/platforms/javascript/guides/vue/profiling/)，数据发送到 PMS。

## 开始采集

1. 在 PMS 打开项目的 **Profiles** 页面并启用采集。
2. 为被监控站点的 **HTML 文档响应**添加 `Document-Policy: js-profiling`，刷新页面后生效。
3. 在 Vue 应用入口配置 SDK，DSN 使用当前项目的连接配置。

```ts
import { createApp } from 'vue'
import * as PMS from '@pms/monitoring-vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
PMS.init({
  app,
  router,
  dsn: 'http://<public-key>@localhost:3000/api/sdk/<project-id>',
  environment: 'development',
  release: 'web@1.0.0',
  integrations: [
    PMS.browserTracingIntegration(),
    PMS.browserProfilingIntegration(),
  ],
  tracesSampleRate: 1,
  profileSessionSampleRate: 1,
  profileLifecycle: 'trace',
})
app.use(router).mount('#app')
```

示例使用 100% 采样方便验证；生产环境请按流量降低采样率。`profileSessionSampleRate` 在 SDK 初始化时决定本次页面会话是否采集。`trace` 模式仅在已采样的根 Span 存活期间采集，并关联首个根 Span；并发根 Span 共用采集器。

手动模式默认启用，适合特定交互流程，也可以独立于自动浏览器 Tracing 使用：

```ts
PMS.init({
  app,
  dsn: '<当前项目 DSN>',
  integrations: [PMS.browserProfilingIntegration()],
  profileSessionSampleRate: 1,
  profileLifecycle: 'manual',
})

async function runInteraction() {
  PMS.uiProfiler.startProfiler()
  try {
    await performInteraction()
  } finally {
    await PMS.uiProfiler.stopProfiler()
    await PMS.flush()
  }
}
```

在应用中选择其中一种初始化方式，并将 `performInteraction` 替换为真实业务操作。SDK 请求 10ms 采样间隔，实际间隔由浏览器决定（如 16ms），详情页显示实际值。单次最多 30 秒；到达时间或原生样本缓冲上限时停止。调用帧和栈表在停止时裁剪至资源上限，超过 256KiB 的记录丢弃。`flush()` 等待已停止的采集记录发送，不会结束仍在运行的采集或业务 Span。

## 响应头

开发环境的 Vite 服务和 preview 服务已配置响应头。部署其他被监控应用时也需要在其 HTML 文档服务器配置。例如 Nginx：

```nginx
location / {
    add_header Document-Policy "js-profiling" always;
    try_files $uri $uri/ /index.html;
}
```

Express：

```ts
app.use((_req, res, next) => {
  res.setHeader('Document-Policy', 'js-profiling')
  next()
})
```

必须作用于页面文档响应；仅在 PMS 接收数据的 API 响应上添加此头无法启用采集。外部脚本能否提供完整栈还受浏览器跨域资源策略影响。

## 分析采样结果

在 Profiles 列表按时间、环境和名称筛选，打开记录查看调用栈时间线。点击火焰图中的函数可以聚焦其时间区间，使用还原操作返回完整记录。每个样本的权重来自其时间戳到下一个样本的时间差，最后一个样本到记录结束时间。

- **Total**：该函数出现在调用栈中的采样估计时长，包含子调用；递归函数每个样本只计一次。
- **Self**：该函数位于栈顶的采样估计时长。
- **未采样**：采样点没有调用栈，不能据此推断具体函数。

采样估计时长受采样频率、浏览器调度等因素影响，并非精确 CPU 时间。详情中的 Trace 链接用于查看同一流程的请求和 Span。

## 可用性与部署

JS Self-Profiling API 目前由 Chromium 浏览器提供，需使用满足浏览器要求的安全上下文（部署使用 HTTPS，本地可用 localhost）。缺少能力或响应头时 SDK 安全跳过采集，应用继续运行。请在 Chrome/Edge 中确认文档响应头后触发操作，等待 Span 结束或手动停止，再刷新列表。

数据库使用 PostgreSQL。开发和生产均保持 `DB_SYNCHRONIZE=false`，部署前从仓库根目录执行统一迁移：

```sh
pnpm migration:show
pnpm migration:run
```

迁移使用 API 环境文件中的目标数据库配置，覆盖 Profiles 及其他模块；旧的 `traces:migrate` 现在也是完整迁移的别名。不要再单独执行历史 Profiles SQL。已通过自动同步或旧 SQL 建表的数据库应先备份、核对结构并制定接管方案，不能直接套用空库基线。容器与生产命令见 [API 数据库结构管理](apps/nest/README.md#数据库结构管理)。启用开关默认为关闭，旧项目不会自动开始采集。

首版保留浏览器提供的函数名、脚本资源和行列信息，尚未实现 Source Map 反混淆。压缩后的函数名可能仍是短名称。
