# PMS 错误采集、归组与展示设计

## 背景

PMS 已具备监控项目、DSN、`@pms/monitoring-core` 和 `@pms/monitoring-vue` 的初始化外壳，但 SDK 当前使用 `NoopTransport`，不会注册错误处理器，也不会向服务端发送请求。管理端只能展示 SDK 接入说明，项目连接状态仍依赖历史的连接校验接口。

本阶段实现推荐顺序中的第 4、5、6 项：真实事件采集接口、事件表与错误归组表、错误列表与错误详情，并通过一次轻量级 `client_report` 验证 SDK 到服务端的网络链路。

## 目标

- Vue SDK 初始化后发送一次 `client_report`，服务端验证 DSN 对应的项目和 public key，并更新项目最近连接时间。
- SDK 自动捕获 Vue 错误、浏览器未处理错误和未处理 Promise 拒绝，同时提供手动 `captureException`。
- SDK 将错误加工为有版本的 PMS Envelope，通过 HTTP Transport 非阻塞上报。
- Nest 服务同步验证、持久化事件，并在同一事务中创建或更新错误组。
- PMS 管理端提供分页错误列表和错误详情，展示最新事件与最近事件记录。

## 非目标

- 不兼容 Sentry Envelope 协议。
- 不实现 Source Map 上传、解析或堆栈符号化。
- 不实现消息队列、后台消费者、批量发送、重试或离线缓存。
- 不实现 Tracing、Logging、Metrics、Replay 或性能监控。
- 不实现 Issue 指派、评论、忽略、解决和重新打开工作流；首版状态固定为 `unresolved`。
- 不实现复杂的 Sentry 分组算法或跨版本堆栈归一化。

## 总体架构

```text
Vue 应用
  -> @pms/monitoring-vue 捕获错误
  -> @pms/monitoring-core 加工事件并交给 HttpTransport
  -> POST /api/sdk/:projectId/envelope
  -> Nest 校验 public key、项目和事件结构
  -> PostgreSQL 事务写入 monitoring_events
  -> 按 fingerprint 新建或更新 monitoring_error_issues
  -> 更新 monitoring_projects.last_seen_at
  -> 管理 API 查询 Issue 列表和详情
  -> Vue 管理端聚合展示
```

## SDK 协议

### DSN 与采集地址

DSN 保持现有格式：

```text
https://<publicKey>@<host>/api/sdk/<projectId>
```

SDK 从 DSN 得到：

- `publicKey`：浏览器可见的公开写入标识，不是管理密钥。
- `projectId`：事件归属项目。
- `endpoint`：移除 DSN username 后的基础地址。

所有采集数据发送到：

```text
POST <endpoint>/envelope
Content-Type: application/json
X-PMS-Key: <publicKey>
```

### Envelope

Envelope 是版本化 JSON 联合类型。

客户端连接报告：

```json
{
  "version": 1,
  "type": "client_report",
  "sentAt": "2026-09-23T01:00:00.000Z",
  "sdk": {
    "name": "@pms/monitoring-vue",
    "version": "0.1.0"
  },
  "environment": "production",
  "release": "web@1.0.0"
}
```

错误事件：

```json
{
  "version": 1,
  "type": "event",
  "sentAt": "2026-09-23T01:00:00.000Z",
  "event": {
    "eventId": "3d6a72ac-6f8d-4b77-b227-51d24dbe4512",
    "timestamp": "2026-09-23T01:00:00.000Z",
    "type": "error",
    "level": "error",
    "source": "vue",
    "message": "支付接口调用失败",
    "exception": {
      "type": "Error",
      "value": "支付接口调用失败",
      "stacktrace": "Error: 支付接口调用失败\n    at submitOrder (...)"
    },
    "url": "https://app.example.com/orders",
    "environment": "production",
    "release": "web@1.0.0",
    "tags": {
      "component": "CheckoutView"
    }
  }
}
```

### 字段限制

- `eventId` 必须是 UUID。
- `timestamp` 和 `sentAt` 必须是 ISO 8601 日期字符串。
- `message`、`exception.value` 最大 2,000 字符。
- `exception.type`、`source`、`environment`、`release` 最大 128 字符。
- `stacktrace` 最大 64 KiB。
- `url` 最大 2,048 字符。
- `tags` 最多 50 项；键最大 64 字符，值最大 256 字符。
- HTTP JSON 请求体最大 100 KiB。

SDK 在发送前截断超过限制的字段；服务端仍独立执行验证，不能信任客户端。

## SDK 行为

### Core SDK

`@pms/monitoring-core` 增加：

- `HttpTransport`：使用注入或全局 `fetch` 发送 Envelope。
- `captureException(error, context?)`：把未知异常规范化为 `MonitoringEvent` 并立即交给 Transport。
- `sendClientReport()`：初始化后发送连接报告。
- `MonitoringEventSource`：`vue | window | unhandledrejection | manual`。

初始化时，如果调用方没有提供自定义 Transport，则默认使用 `HttpTransport`。自定义 Transport 继续保留，方便测试和其他运行环境。

发送是 fire-and-forget：Transport 捕获网络异常，不向宿主应用抛出。首版每条事件单独发送，不重试、不批量。

### Vue SDK

`@pms/monitoring-vue` 在每个 Vue App 上只安装一次：

- 包装 `app.config.errorHandler`，上报来源为 `vue`，并在上报调用后继续调用原处理器。
- 注册 `window.error`，上报来源为 `window`。
- 注册 `window.unhandledrejection`，上报来源为 `unhandledrejection`。
- 公开 `captureException`，手动上报来源为 `manual`。

多次以相同配置初始化同一应用保持幂等，不重复注册监听器或发送连接报告。不同配置重复初始化仍沿用现有冲突错误。

SDK 自身发送失败不触发再次采集，避免递归上报。

## 服务端采集

### 公开接口

新增无需 JWT 的采集接口：

```text
POST /api/sdk/:projectId/envelope
```

服务端按以下顺序处理：

1. 从 `X-PMS-Key` 读取 public key。
2. 按 `projectId + publicKey` 查找项目；不存在时返回 404。
3. 验证 Envelope 版本、类型和字段限制。
4. `client_report` 只更新 `last_seen_at`，返回 202。
5. `event` 要求项目 `errorMonitoringEnabled=true`，否则返回 403。
6. 检查 `eventId` 是否已存在；重复事件返回 202，不重复计数。
7. 计算服务端 fingerprint。
8. 在事务中写入事件、创建或更新错误组，并更新 `last_seen_at`。
9. 返回 202，不向 SDK 暴露内部实体。

采集响应跳过普通管理 API 的响应包装，只返回最小确认信息或空响应。

### CORS

新增：

```dotenv
CORS_ORIGINS=http://localhost:5173,http://localhost:3002,https://app.example.com
```

服务端使用统一的 `CORS_ORIGINS` 允许管理端访问和监控客户端上报。生产环境禁止通配符。SDK 不发送 Cookie 或 JWT。

## 数据模型

### monitoring_events

每次合法错误上报保存一条不可变事件：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| id | uuid | 主键，使用 SDK eventId |
| project_id | uuid | 外键，级联删除 |
| issue_id | uuid | 外键，级联删除 |
| timestamp | timestamptz | 错误发生时间 |
| received_at | timestamptz | 服务端接收时间 |
| source | varchar(32) | 捕获来源 |
| level | varchar(16) | 首版为 error |
| message | varchar(2000) | 错误消息 |
| exception_type | varchar(128) | 异常类型 |
| exception_value | varchar(2000) | 异常值 |
| stacktrace | text nullable | 原始堆栈 |
| url | varchar(2048) nullable | 页面地址 |
| environment | varchar(128) nullable | 环境 |
| release | varchar(128) nullable | 版本 |
| tags | jsonb | 标签，默认空对象 |

索引：

- `(project_id, received_at DESC)`
- `(issue_id, received_at DESC)`

### monitoring_error_issues

每个 fingerprint 在项目内对应一个错误组：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| id | uuid | 主键 |
| project_id | uuid | 外键，级联删除 |
| fingerprint | char(64) | SHA-256 十六进制 |
| title | varchar(2000) | 最新错误标题 |
| exception_type | varchar(128) | 异常类型 |
| culprit | varchar(512) nullable | 第一条有效堆栈或 URL |
| status | varchar(16) | 固定 unresolved |
| event_count | integer | 大于等于 1 |
| first_seen_at | timestamptz | 首次发生 |
| last_seen_at | timestamptz | 最近发生 |
| latest_event_id | uuid nullable | 最新事件 ID |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

唯一索引：

```text
(project_id, fingerprint)
```

列表查询索引：

```text
(project_id, last_seen_at DESC)
```

### 数据库迁移

新增 TypeORM migration 和可执行的 migration 脚本。开发环境可以继续使用 `DB_SYNCHRONIZE=true`，生产环境保持 `DB_SYNCHRONIZE=false`，通过 migration 创建表、约束和索引。

## 错误归组

服务端不接受客户端提供的 fingerprint。首版归组输入为：

```text
exceptionType + "\n" + normalizedMessage + "\n" + culprit
```

其中：

- `normalizedMessage` 去除首尾空白，并把连续空白压缩为单个空格。
- `culprit` 优先取 stacktrace 中第一条非空 `at ...` 行；无堆栈时取 URL；两者都没有时为空字符串。
- 对输入执行 SHA-256，得到 64 位十六进制 fingerprint。

同一项目下 fingerprint 相同的事件归入同一个 Issue；不同项目永不跨项目归组。

为保证并发一致性，错误组使用 PostgreSQL upsert：冲突时原子增加 `event_count`，更新 `last_seen_at`、`latest_event_id`、`title` 和 `culprit`。事件插入和 Issue 更新位于同一事务中。

## 管理查询 API

所有管理查询继续要求 JWT，并复用现有资源所有权校验。

### 错误列表

```text
GET /api/groups/:groupSlug/projects/:projectSlug/issues?page=1&pageSize=20
```

响应：

```json
{
  "items": [
    {
      "id": "issue-uuid",
      "title": "支付接口调用失败",
      "exceptionType": "Error",
      "culprit": "at submitOrder (...) ",
      "status": "unresolved",
      "eventCount": 2,
      "firstSeenAt": "2026-09-23T01:00:00.000Z",
      "lastSeenAt": "2026-09-23T01:05:00.000Z",
      "environment": "production",
      "release": "web@1.0.0"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

默认按 `lastSeenAt DESC` 排序，`pageSize` 只允许 10、20、50、100。

### 错误详情

```text
GET /api/groups/:groupSlug/projects/:projectSlug/issues/:issueId
```

返回 Issue 摘要、`latestEvent` 和最近 20 条事件。查询必须同时约束用户、组、项目和 issue，避免越权读取。

## 管理端

新增路由：

```text
/groups/:groupSlug/projects/:projectSlug/issues
/groups/:groupSlug/projects/:projectSlug/issues/:issueId
```

### 错误列表页

复用现有 `DataTable`，展示：

- 标题和异常类型
- 状态
- 事件次数
- environment / release
- 首次发生时间
- 最近发生时间

支持服务端分页、加载态、空态、失败重试和点击进入详情。

### 错误详情页

展示：

- Issue 标题、类型、状态和事件次数
- 首次/最近发生时间
- 最新事件 environment、release、URL、source 和 tags
- 保留换行的原始 stacktrace
- 最近 20 条事件的时间、来源和版本

项目详情页增加“错误监控”入口，并把原有未实现提示改为当前真实能力描述。

## 错误处理和安全

- public key 只允许向绑定项目写入，不允许查询数据或执行管理操作。
- SDK 上报失败不抛回宿主应用，不阻塞 Vue mount。
- DTO 拒绝未知字段、非法版本、非法 UUID、无效日期、过长字符串和过多 tags。
- 重复 eventId 幂等处理，不重复创建事件或增加 Issue 次数。
- 关闭错误监控的项目仍可接受 `client_report`，但拒绝错误事件。
- 数据库异常返回通用错误，不向 SDK 暴露 SQL 或内部结构。
- 首版通过明确的监控来源列表配置 CORS，不使用生产通配符。

## 测试策略

### Core SDK

- DSN 正确推导 Envelope 地址和 public key 请求头。
- 初始化发送一次 `client_report`。
- `captureException` 规范化 Error、字符串和未知对象。
- HTTP 失败被吞掉，不产生未处理 Promise 拒绝。
- 相同事件不会被 SDK 自行重试。

### Vue SDK

- 安装并只安装一次 Vue errorHandler、`error` 和 `unhandledrejection` 监听器。
- 三种自动来源生成正确 source。
- 原有 Vue errorHandler 仍被调用。
- 手动 `captureException` 可用。
- SDK 自身传输错误不会递归捕获。

### Nest

- `client_report` 校验成功并更新 `last_seen_at`。
- 错误事件写入事件表和 Issue 表。
- 同一错误上报两次只生成一个 Issue，`event_count=2`。
- 不同 fingerprint、不同项目分别归组。
- 重复 eventId 不重复计数。
- 错误 public key、禁用错误监控、非法 DTO 和越权查询被拒绝。
- 列表分页排序和详情最近事件符合契约。
- migration 可在空数据库上创建全部表和索引。

### Vue 管理端

- API 路径和分页参数正确。
- 错误列表展示聚合次数和最近发生时间。
- 空态、失败重试和分页交互正确。
- 详情展示最新事件、标签、堆栈和最近事件。
- 项目详情存在错误列表入口。

## 验收标准

1. 独立 Vue 项目安装 tarball 并初始化 SDK 后，PMS 项目连接状态能被服务端更新。
2. Vue 错误、浏览器错误、未处理 Promise 拒绝和手动异常均能上报。
3. 合法错误同时产生一条 `monitoring_events` 记录和对应的 `monitoring_error_issues` 记录。
4. 同一错误上报两次后，事件表有两条记录，Issue 表只有一条且 `event_count=2`。
5. 错误列表按最近发生时间分页展示，详情可以查看最新堆栈和最近事件。
6. 管理数据只能由拥有该组和项目的登录用户读取。
7. SDK 发送失败不会影响宿主 Vue 应用运行。
8. SDK、Nest 和 Vue 的测试、类型检查、lint 和生产构建全部通过。
