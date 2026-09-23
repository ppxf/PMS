# PMS 监控 SDK 外壳设计

## 目标

在不采集、不持久化、不上报真实错误的前提下，建立可复用的 PMS 浏览器监控 SDK 包边界，并以 npm tarball 形式供独立 Vue 项目安装和构建。

## 范围

本阶段包含：

- `@pms/monitoring-core`：内部私有包，定义稳定的初始化配置、事件协议、SDK 状态和可替换 Transport 接口。
- `@pms/monitoring-vue`：唯一对外发布的包，提供面向 Vue 3 的 `init` 入口，并在构建时内联 core 运行时代码。
- PMS 管理端展示 SDK 安装、DSN 环境变量和初始化代码，本身不依赖或初始化 SDK。
- 使用 `pnpm pack` 生成供外部 Vue 项目安装的单包 tarball。

本阶段明确不包含：

- `window.onerror`、`unhandledrejection` 或 Vue `errorHandler` 注册。
- `captureException`、`captureMessage` 等事件采集 API。
- HTTP 请求、批量发送、重试、离线队列或事件持久化。
- Nest 采集端点、错误列表和错误详情。
- Source Map、Tracing、Logging、Metrics 或 Session Replay。

## 包边界

### `@pms/monitoring-core`

公开以下契约：

- `MonitoringEvent`：为下一阶段预留的版本化事件结构，包含事件 ID、时间、类型、级别、消息、异常、页面地址、environment、release 和 tags 等可选字段。
- `Transport`：只定义 `send(event)` 边界；本阶段默认 `NoopTransport` 不产生网络请求。
- `init(options)`：校验并规范化 DSN，保存只读初始化状态，重复使用相同配置初始化时保持幂等；使用不同配置重复初始化时抛出明确错误。
- `getClientState()`：供宿主确认 SDK 已初始化及读取规范化后的公开配置。

DSN 仅允许 `http:` 和 `https:`，必须同时包含 username 位置的 public key，以及 `/api/sdk/<projectId>` 路径。SDK 不把 public key 当作秘密。

### `@pms/monitoring-vue`

公开 `init({ app, ...coreOptions })`。它验证传入对象具备 Vue 应用的最小形态，把应用与 core 客户端建立关联，但不修改 `app.config.errorHandler`，也不注册任何浏览器全局监听器。

## 管理端边界

`apps/vue3` 只展示 `@pms/monitoring-vue` 的安装、环境变量和初始化指引，不直接依赖或初始化 SDK。

## 独立项目验证

构建并打包 `@pms/monitoring-vue` 后，可在仓库外的独立 Vue 项目中只安装生成的单个 `.tgz`。仓库不保留专用 examples fixture。

## 测试策略

- core 单元测试覆盖合法 DSN 规范化、非法协议、缺少 public key、错误路径、初始化状态和冲突初始化。
- vue 单元测试覆盖初始化委托、应用关联，以及不会覆盖 Vue 错误处理器。
- 管理端页面测试覆盖安装命令、DSN 环境变量和 SDK 初始化代码。

## 完成标准

- core 可独立构建、测试和类型检查，但保持私有且不对外发布。
- Vue SDK 可独立构建、测试、类型检查和打包，并内联 core 运行时代码。
- PMS 管理端不依赖或初始化 Vue SDK。
- 外部 Vue 项目只需安装 Vue SDK tarball。
- 运行期间不注册错误捕获、不上报网络请求、不改变现有 Nest API。
