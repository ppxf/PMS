# 浏览器错误事件上下文设计

## 目标

扩展现有 Vue 浏览器监控事件，使业务方无需手动传入页面信息即可在错误详情中查看 URL、请求上下文、Cookie、浏览器、操作系统、设备、文化设置和内存信息。同时从 SDK、协议、后端存储和管理界面中彻底移除版本（`release`）概念。

本次只处理 Vue 浏览器 SDK。浏览器环境没有 Node 运行时，因此不采集、不展示 `runtime`。未来接入 Nuxt、Next 等 SSR SDK 时，再由服务端 SDK 提供 Node 运行时上下文。

## 范围

### 包含

- 自动读取错误发生时的页面 URL。
- 自动采集浏览器可访问的请求上下文与 Cookie。
- 自动采集浏览器、操作系统、设备、文化设置和内存上下文。
- 对敏感 Header 和 Cookie 值进行不可逆脱敏。
- 对新增上下文做长度、数量和总载荷约束。
- 持久化新增上下文，并在错误详情页面展示。
- 从错误列表、错误详情、SDK 初始化选项、事件协议、DTO、实体和查询映射中移除 `release`。

### 不包含

- 读取 `HttpOnly` Cookie；浏览器 JavaScript 无权访问。
- 读取浏览器加载当前页面时的完整原始 HTTP 请求头；浏览器不暴露该信息。
- 拦截或追踪业务 `fetch` / XHR 请求。
- 在 Vue 浏览器事件中展示 Node 运行时。
- 精确获取浏览器进程或系统物理内存。

## 方案

采用“捕获时浏览器上下文快照”。错误事件创建时，SDK 从当前浏览器全局对象读取可用信息，规范化、限制大小并附加到事件。业务方不需要也不能通过 `captureException` 手动覆盖 URL 或浏览器上下文。

不采用全局 `fetch` / XHR 拦截，因为它无法为普通渲染错误稳定提供页面请求信息，并会改变应用全局请求行为。不采用 PMS 接收端请求头作为页面上下文，因为那是 SDK 上报请求而不是用户访问业务页面的请求。

## 事件模型

`MonitoringEvent` 删除 `release`，新增可选 `contexts`：

```ts
interface BrowserEventContexts {
  request?: {
    headers: Record<string, string>
    cookies: Record<string, string>
  }
  browser?: {
    name?: string
    version?: string
    userAgent?: string
  }
  os?: {
    name?: string
  }
  device?: {
    platform?: string
    screenWidth?: number
    screenHeight?: number
    viewportWidth?: number
    viewportHeight?: number
    pixelRatio?: number
  }
  culture?: {
    locale?: string
    languages?: string[]
    timezone?: string
  }
  memory?: {
    usedJSHeapSize?: number
    totalJSHeapSize?: number
    jsHeapSizeLimit?: number
    deviceMemoryGiB?: number
  }
}
```

`request.url` 与事件顶层 `url` 不重复保存。现有顶层 `url` 保留作为标准页面 URL，详情中的“请求信息”直接使用该字段。`request` 只保存 Header 和 Cookie，避免两个 URL 来源发生分歧。

`CaptureExceptionContext` 删除 `url`。`MonitoringInitOptions`、`ClientState` 和客户端报告删除 `release`。

## 自动采集

采集器是 monitoring-core 中独立、无副作用的浏览器适配单元。每次创建错误事件时执行一次，并在缺少浏览器 API、属性读取抛错或返回非法值时跳过对应字段，不影响错误上报。

### URL

- 从 `globalThis.location.href` 读取。
- 限制为 2048 个字符。
- 非浏览器环境或读取失败时省略。

### 请求 Header

浏览器不提供原始页面请求头，因此只生成有明确浏览器来源的等价上下文：

- `User-Agent`：`navigator.userAgent`。
- `Accept-Language`：`navigator.languages`，缺失时回退 `navigator.language`。
- `Referer`：`document.referrer`。

不伪造 `Accept`、`Host`、`Connection` 等无法可靠读取的 Header。

### Cookie

- 从 `document.cookie` 解析非 `HttpOnly` Cookie。
- Cookie 名称进行 URL 解码，解码失败时保留原字符串。
- 值不做业务解析。
- 名称匹配敏感规则时将值替换为 `[Filtered]`。
- `HttpOnly` Cookie 无法读取，因此不会出现在事件中。

### 浏览器、操作系统与设备

- 浏览器名称和版本优先由 User-Agent Client Hints 获取；不可用时通过有限的 User-Agent 规则识别 Chrome、Edge、Firefox、Safari，无法识别则只保留原始 User-Agent。
- 操作系统只识别 Windows、macOS、Linux、Android、iOS；无法识别时省略名称。
- 设备采集 `navigator.platform`、屏幕尺寸、视口尺寸和设备像素比。
- 不生成设备唯一标识，不进行指纹识别。

### 文化设置

- 语言：`navigator.language`。
- 语言列表：`navigator.languages`。
- 时区：`Intl.DateTimeFormat().resolvedOptions().timeZone`。

### 内存

- Chromium 支持时从非标准 `performance.memory` 读取 JS 堆已用、总量和上限。
- 支持时从 `navigator.deviceMemory` 读取设备内存估算值。
- Firefox、Safari 等不支持时省略字段；前端显示 `-`，不伪造数值。

## 安全与限制

### 脱敏

Header 或 Cookie 名称转为小写后，包含以下任一片段即视为敏感：

- `authorization`
- `cookie`
- `set-cookie`
- `token`
- `session`
- `password`
- `passwd`
- `secret`
- `credential`
- `jwt`
- `auth`

敏感值在 SDK 发送前替换为 `[Filtered]`，后端不接收原始值。键名保留以便排查“是否存在该 Header/Cookie”。

### 大小约束

- Header 和 Cookie 各最多 50 项。
- 键名最多 128 字符，单值最多 2048 字符。
- User-Agent 最多 1024 字符。
- 语言列表最多 10 项，单项最多 64 字符。
- 数值必须有限且非负。
- 整个 SDK HTTP 请求仍受现有 512 KiB 上限保护。
- DTO 使用白名单嵌套校验，拒绝未知上下文字段和超限数据。

## 后端持久化

`monitoring_events`：

- 删除 `release` 列映射。
- 新增非空 `contexts` JSONB 列，默认空对象。

服务层写入经过 DTO 校验的上下文，读取时通过现有事件详情 API 返回。错误列表不返回高维上下文；只保留环境等摘要字段。

项目目前没有数据库迁移体系。开发环境使用 `DB_SYNCHRONIZE=true` 时由 TypeORM 同步。关闭同步的环境需要执行等价数据库变更：删除 `release` 列并新增 `contexts jsonb NOT NULL DEFAULT '{}'::jsonb`。

## 管理界面

### 错误列表

- 删除“版本”列。
- `MonitoringIssueSummary` 删除 `release`。

### 错误详情

- 最新事件基础信息删除“版本”。
- 最近事件表删除“版本”列并调整空状态跨列数。
- 新增“请求信息”卡片：URL、Headers、Cookies。
- 新增“浏览器上下文”卡片：浏览器、操作系统、设备、文化设置。
- 新增“内存”区域：格式化显示 JS 堆和设备内存；缺失值显示 `-`。
- Vue 浏览器事件不展示 Runtime 卡片或空 Runtime 占位。
- 对象列表使用稳定排序，空对象显示 `-`，长值允许换行且不撑破布局。

## 兼容性

- 新增 `contexts` 为可选字段，后端仍接受没有上下文的旧 SDK 事件。
- 管理界面对旧事件的缺失上下文显示空状态。
- 移除 `release` 是有意的协议收缩；升级后的后端 DTO 将拒绝仍发送 `release` 的事件，因此 SDK 和后端应同时发布部署。
- 客户端报告仍保留 SDK 自身的 `sdk.version`，它表示 PMS SDK 版本，不属于被删除的业务发布版本。

## 错误处理

- 任意浏览器属性读取失败只丢弃该字段，不阻断 `captureException`。
- Cookie 解析遇到单个非法编码时保留原字符串并继续解析其他项。
- User-Agent 无法识别时保留原始字符串，名称和版本为空。
- 后端发现越界或未知字段时返回 400，不写入事件。
- 上下文缺失不影响指纹、聚合、错误列表和详情主信息。

## 测试策略

### monitoring-core

- 自动使用 `location.href`，且调用方不再有 `url` 参数。
- 采集 Header、Cookie、浏览器、操作系统、设备、文化设置和内存。
- 敏感 Cookie/Header 值在进入 Transport 前已变为 `[Filtered]`。
- 浏览器 API 缺失或 getter 抛错时仍能发送错误。
- 验证数量、字符串和数值限制。
- 验证所有 `release` API 与事件字段已移除。

### monitoring-vue

- Vue、`window.error`、`unhandledrejection` 和手动捕获均使用核心自动上下文。
- 初始化示例与生成代码不再包含 `release`。

### Nest API

- DTO 接受合法上下文、拒绝未知和超限字段。
- 服务保存并返回上下文。
- 旧事件不含上下文时仍可读取。
- 摘要与详情响应不再返回 `release`。
- HTTP 管道继续满足载荷上限。

### Vue 管理界面

- 错误列表和详情不再出现“版本”。
- 请求、Cookie、浏览器、设备、文化设置和内存正确显示。
- `[Filtered]` 原样展示。
- 缺失上下文和缺失内存 API 时显示稳定空状态。
- 最近事件表列数与空状态保持一致。

## 验收标准

1. 业务代码只调用 `captureException(error)` 时，事件 URL 自动等于错误发生时的页面地址。
2. 错误详情能显示浏览器可访问的 Header、非 `HttpOnly` Cookie 和客户端环境信息。
3. 敏感字段在离开浏览器之前已经脱敏。
4. Chromium 可展示可用的 JS 堆内存；不支持的浏览器展示 `-`。
5. Vue 浏览器事件不展示 Runtime。
6. SDK、协议、数据库映射、API 和 UI 中不再存在业务 `release` 字段或“版本”列。
7. 旧的无上下文事件仍可正常展示。
8. 所有相关单元测试、集成测试、类型检查、lint 和构建通过。
