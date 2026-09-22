# 组与监控项目引导设计

## 目标

用户完成注册、邮箱验证并登录后，先创建组，再在组下创建 Vue 监控项目。项目创建后生成 DSN，并展示 Vue 项目的本地连接校验指引。

本阶段只完成组、监控项目、功能开关、DSN 和连接校验，不实现 Error、Logging、Tracing、Application Metrics 的数据采集、存储或展示，也不实现 Session Replay。

## 范围

### 包含

- 一个用户可创建多个组。
- 一个组可创建多个监控项目。
- 组当前只有创建者本人能够访问。
- 项目框架固定为 Vue。
- 项目保存 Error、Logging、Tracing、Application Metrics 四个功能开关。
- Error 默认开启，其余三项默认关闭。
- 创建项目后生成公开 DSN。
- SDK 指引页展示 DSN、环境变量和 `fetch` 连接校验代码。
- 项目记录连接状态和最后连接时间。
- 没有组的用户登录后进入强制创建组引导。

### 不包含

- 组成员、邀请、角色或协作权限。
- 组和项目的编辑、删除。
- 除 Vue 之外的框架。
- PMS SDK 包。
- Sentry SDK 或 Sentry Envelope 协议兼容。
- Error、Logging、Tracing、Application Metrics 的事件采集和展示。
- Session Replay 及其配置。

## 数据模型

### groups

- `id`: UUID 主键。
- `owner_id`: 创建者用户 ID，关联 `users.id`。
- `name`: 组名称。
- `slug`: URL 标识。
- `created_at`、`updated_at`: 时间戳。

同一用户下的组 slug 唯一。删除用户时级联删除其组；当前阶段不提供删除接口。

### monitoring_projects

- `id`: UUID 主键。
- `group_id`: 所属组 ID，关联 `groups.id`。
- `name`: 项目名称。
- `slug`: URL 标识。
- `platform`: 固定为 `vue`。
- `error_monitoring_enabled`: 默认 `true`。
- `logging_enabled`: 默认 `false`。
- `tracing_enabled`: 默认 `false`。
- `metrics_enabled`: 默认 `false`。
- `public_key`: 随机生成的公开项目密钥。
- `last_seen_at`: 最近一次 DSN 连接校验成功时间，可空。
- `created_at`、`updated_at`: 时间戳。

同一组下的项目 slug 唯一。`public_key` 全局唯一。删除组时级联删除项目；当前阶段不提供删除接口。

## Slug 规则

组名和项目名由用户输入，slug 由后端生成。生成规则为：转为小写、空格和连续非字母数字字符替换为单个连字符、去除首尾连字符。对于无法产生有效 ASCII slug 的名称，使用带随机短后缀的通用前缀：组使用 `group-xxxxxx`，项目使用 `project-xxxxxx`。

同一作用域发生 slug 冲突时返回 `409 Conflict`，前端提示用户修改名称，不静默追加序号。

## DSN 与本地校验

后端通过 `MONITORING_PUBLIC_URL` 配置 DSN 主机：

- 本地示例：`http://localhost:3001`
- 生产示例：`https://monitor.example.com`

DSN 使用标准 HTTP(S) URL 格式，使同一份 DSN 同时携带本地或生产传输协议：

```text
<http-or-https>://<publicKey>@<host>/api/sdk/<projectId>
```

例如：

```text
http://abc123@localhost:3001/api/sdk/550e8400-e29b-41d4-a716-446655440000
```

`public_key` 只用于标识项目和执行连接校验，不授予组或项目管理权限。

SDK 指引页提供一段无依赖的 JavaScript 函数。函数使用标准 `URL` API 解析 DSN，从用户名位置读取公开密钥、从路径读取项目 ID，并向同一 origin 的 `/api/sdk/check` 发送校验请求。该接口只记录连接成功，不接收或保存任何监控事件。

连接校验接口需要支持当前前端开发来源的 CORS。成功后更新项目的 `last_seen_at`，返回项目 ID、平台及校验成功时间。项目所有者通过受保护接口轮询或手动刷新连接状态。

## 权限模型

- 所有组和项目管理接口必须携带有效 JWT。
- 创建组时，当前用户自动成为 `owner_id`。
- 查询组、创建项目、查询项目和查询连接状态时，都必须验证当前用户是组所有者。
- 非所有者访问存在的组或项目时返回 `404 Not Found`，避免泄露资源存在性。
- `/sdk/check` 是公开接口，只接受 DSN 中的项目 ID 与公开密钥，不返回组、用户或项目配置等私有信息。

## API

### 组

- `POST /groups`
  - 请求：`{ name }`
  - 返回：新组摘要。
- `GET /groups`
  - 返回当前用户拥有的组列表及每组项目数量。
- `GET /groups/:slug`
  - 返回组详情。

### 监控项目

- `POST /groups/:groupSlug/projects`
  - 请求：`{ name, platform: "vue", errorMonitoringEnabled, loggingEnabled, tracingEnabled, metricsEnabled }`
  - 返回项目详情、DSN 和连接状态。
- `GET /groups/:groupSlug/projects`
  - 返回该组的项目列表。
- `GET /groups/:groupSlug/projects/:projectSlug`
  - 返回项目详情、功能开关、DSN 和连接状态。
- `GET /groups/:groupSlug/projects/:projectSlug/connection`
  - 返回 `{ connected, lastSeenAt }`。

### SDK 连接校验

- `POST /sdk/check`
  - 公开接口。
  - 请求：`{ projectId, publicKey }`。
  - 成功：更新 `last_seen_at` 并返回 `{ projectId, platform, checkedAt }`。
  - 格式错误返回 `400`；项目或密钥不匹配返回 `404`。

## 前端页面与路由

### 登录后引导

认证恢复完成后读取当前用户组列表：

- 没有组且不在引导路由时，跳转 `/onboarding/groups/new`。
- 创建组成功后，跳转 `/groups/:groupSlug/projects/new`。
- 创建项目成功后，跳转 `/groups/:groupSlug/projects/:projectSlug/setup`。
- 已有组的用户进入正常工作台。
- 组列表请求失败时显示错误与重试操作，不执行循环重定向。

### 页面

- 创建组页：沿用当前卡片和表单样式，仅填写组名称。
- 组列表页：展示当前用户的所有组，支持创建更多组。
- 组详情页：展示项目列表和“创建项目”按钮。
- 创建项目页：
  - 框架固定显示 Vue，不提供其他选项。
  - 输入项目名称。
  - 四个 Switch：Error 默认开启；Logging、Tracing、Application Metrics 默认关闭。
  - 不显示 Replay。
- SDK 设置页：
  - 展示和复制 DSN。
  - 展示 `.env` 示例。
  - 展示和复制 `fetch` 校验代码。
  - 展示“等待连接”或“已连接”，以及最后校验时间。
  - 提供刷新状态、返回组详情和进入项目详情的入口。
- 项目详情页：展示项目基础信息、功能开关和连接状态，不展示监控数据。
- 工作台：展示组数量、项目数量和最近创建的项目。

所有页面沿用当前 Vue 项目的布局、Card、Button、Form、Input、Badge 等组件与现有配色，不照搬参考图的 Sentry 视觉风格。可新增与当前组件规范一致的 Switch 组件。

## 错误处理

- 名称校验失败返回 `400`。
- 同一作用域 slug 冲突返回 `409`。
- 无权访问或资源不存在返回 `404`。
- DSN 格式错误返回 `400`。
- 项目 ID 或公开密钥不匹配返回 `404`。
- 前端表单保留输入并显示服务端错误。
- 引导状态加载失败时允许重试，不将“加载失败”误判为“没有组”。

## 测试策略

### Nest 单元测试

- slug 生成和非 ASCII 回退。
- 组创建、列表及所有权隔离。
- 项目默认开关、显式开关和作用域唯一性。
- DSN 生成和解析。
- SDK 校验成功后更新时间。
- 错误项目 ID、错误公开密钥和非所有者访问。

### Vue 单元测试

- 无组用户进入创建组引导。
- 创建组成功后进入创建项目页。
- 项目表单默认开关状态。
- 四个开关值正确提交。
- SDK 指引中的 DSN、环境变量和校验代码复制。
- 等待连接、刷新及已连接状态。
- 组列表、组详情、项目详情和工作台摘要。

### 端到端验证

- 已验证用户登录后创建组。
- 在组下创建 Vue 项目。
- 使用返回的 DSN 参数调用连接校验。
- 所有者查询到已连接状态。
- 其他用户无法访问该组和项目。

完成后执行全量单元测试、Nest E2E、类型检查、lint 和生产构建。

## 配置

新增：

```env
MONITORING_PUBLIC_URL=http://localhost:3001
```

生产环境必须显式配置 HTTPS 地址。本地默认值与 Nest 开发服务地址一致。
