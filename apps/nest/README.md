# PMS Nest API

NestJS 11 HTTP API 基础项目，作为 PMS monorepo 中的后端应用。

## 已接入能力

- `@nestjs/config`：全局配置、`.env` 加载与启动时环境变量校验
- `@nestjs/typeorm`：PostgreSQL 数据库模块，支持实体自动发现
- 全局 `ValidationPipe`：DTO 转换、白名单过滤、拒绝未知参数
- 全局异常过滤器：统一错误结构并隐藏未知内部异常细节
- 全局响应拦截器：统一普通 JSON 成功响应结构
- 日志模块：应用日志和 HTTP 请求耗时日志
- Swagger：默认访问 `/api/docs`
- Helmet：设置常用 HTTP 安全响应头
- JWT 登录：PostgreSQL 用户、bcrypt 密码哈希、默认保护所有控制器
- `@pms/config`：复用 monorepo 公共 ESLint、TypeScript 和 Prettier 规则

## 本地运行

```bash
cp .env.example .env
pnpm start:dev
```

默认端口为 `3000`，健康检查地址为 `GET /api`。数据库默认关闭，因此没有
PostgreSQL 服务时也可以启动。需要数据库时，将 `DB_ENABLED` 设置为 `true` 并
填写连接信息。生产环境必须保持 `DB_SYNCHRONIZE=false`。当前开发阶段暂未保留数据库迁移；正式部署生产环境前，需要基于全部实体统一创建完整的数据库基线 migration。

## JWT 登录

JWT 使用以下环境变量：

```dotenv
JWT_SECRET=development-only-jwt-secret-change-before-production
JWT_EXPIRES_IN=1h
```

登录接口为 `POST /api/auth/login`，当前用户接口为 `GET /api/auth/me`。除登录和健康检查外，控制器默认要求 `Authorization: Bearer <token>`。

生产环境要求 `JWT_SECRET` 至少 32 个字符。应用不会自动创建引导用户；访客可通过注册接口创建账号，完成邮箱验证后登录。

## 注册、邮箱验证与密码重置

应用通过真实 SMTP 发送验证和重置链接，需配置：

```dotenv
APP_FRONTEND_URL=https://pms.example.com
CORS_ORIGINS=https://pms.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mailer
SMTP_PASSWORD=replace-me
SMTP_FROM=PMS <no-reply@example.com>
EMAIL_VERIFICATION_EXPIRES_IN_MINUTES=1440
PASSWORD_RESET_EXPIRES_IN_MINUTES=30
```

生产环境必须完整提供这些配置。本地可使用 Mailpit 或 MailHog 的 SMTP 端口 `1025`。新用户注册后为 `pending_verification`，验证邮箱后才可登录；新用户默认没有业务权限。

本地开发默认允许 `http://localhost:5173` 和 `http://127.0.0.1:5173` 跨域访问 API。如 Vite 使用其他地址或端口，请通过 `CORS_ORIGINS` 配置逗号分隔的来源列表。生产环境必须显式设置该变量，且不允许使用 `*`。

公开接口包括 `/auth/register`、`/auth/verify-email`、`/auth/resend-verification`、`/auth/forgot-password` 和 `/auth/reset-password`。忘记密码与重发验证返回统一响应，避免披露账号状态。

## 组、监控项目与错误采集

登录用户可以创建多个组，每个组可以创建多个监控项目。当前资源只对创建者本人可见，暂不包含成员邀请或协作权限。项目平台固定为 Vue；首版实现 Error Monitoring，Logging、Tracing 与 Application Metrics 开关只保存配置，尚未实现对应采集。

管理接口均要求 JWT：

- `POST /api/groups`、`GET /api/groups`、`GET /api/groups/:groupSlug`
- `POST /api/groups/:groupSlug/projects`
- `GET /api/groups/:groupSlug/projects`
- `GET /api/groups/:groupSlug/projects/:projectSlug`
- `GET /api/groups/:groupSlug/projects/:projectSlug/connection`
- `GET /api/groups/:groupSlug/projects/:projectSlug/issues`
- `GET /api/groups/:groupSlug/projects/:projectSlug/issues/:issueId`

浏览器 SDK 将版本化 JSON Envelope 发送到 `POST /api/sdk/:projectId/envelope`，并在请求头携带 `X-PMS-Key`。DSN 中的 public key 是浏览器可见的公开采集凭据，只有向所属项目写入连接报告和错误事件的权限，不是管理密钥；Issue 列表、详情等管理查询始终使用 JWT，并执行资源所有权校验。

SDK 初始化会发送 `client_report` 并更新项目 `last_seen_at`。错误事件在服务端同步处理：校验后于一个事务中写入事件表，并通过服务端 fingerprint 创建或更新错误归组表；相同 `eventId` 幂等，不会重复增加归组计数。首版没有消息队列、重试、离线缓存或批量发送。

DSN 的公开地址由下列变量决定：

```dotenv
MONITORING_PUBLIC_URL=http://localhost:3001
MONITORING_CORS_ORIGINS=http://localhost:3002
```

`MONITORING_CORS_ORIGINS` 是允许浏览器 SDK 上报的逗号分隔来源列表，会与管理端 `CORS_ORIGINS` 合并。生产环境必须显式配置，且禁止使用 `*`。本地开发可使用 HTTP，生产环境必须为 `MONITORING_PUBLIC_URL` 配置 HTTPS 地址。

## 数据库结构管理

当前开发环境通过 `DB_SYNCHRONIZE=true` 根据全部 TypeORM 实体创建和更新数据库结构。仓库暂未保留增量 migration，也不能在 `DB_SYNCHRONIZE=false` 的空数据库中自动建立完整 PMS schema。

正式部署生产环境前，需要基于届时确认的全部实体统一生成并审查一份完整数据库基线 migration，覆盖用户、认证令牌、组、监控项目、错误归组和错误事件等全部表、外键、约束与索引。生产环境必须保持 `DB_SYNCHRONIZE=false`，并通过部署流程显式执行该完整 migration。

## 首版限制

当前不支持队列、自动重试、离线缓存、批量上报、Source Map、Tracing、Logging 或 Metrics，也不兼容 Sentry Envelope。仓库测试覆盖服务与仓储替身上的事务和查询契约，但尚未提供真实 PostgreSQL 集成测试证据。

## 响应约定

普通成功响应：

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-08-16T08:00:00.000Z"
}
```

错误响应：

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Bad Request",
  "error": "Bad Request",
  "timestamp": "2026-08-16T08:00:00.000Z",
  "path": "/api/example"
}
```

`StreamableFile`、Node 可读流、SSE、附件、二进制响应、204 和已发送的原生响应
不会被包装。对于使用 `@Res()`、重定向或其他特殊协议的处理器，请添加
`@SkipResponseWrap()`：

```ts
import { SkipResponseWrap } from './common/decorators/skip-response-wrap.decorator';

@SkipResponseWrap()
@Get('download')
download() {
  // Return StreamableFile or manage the response directly.
}
```

## 质量检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```
