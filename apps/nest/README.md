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
填写连接信息。生产环境必须保持 `DB_SYNCHRONIZE=false`，数据库结构应使用迁移管理。

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

## 组、监控项目与 DSN 校验

登录用户可以创建多个组，每个组可以创建多个监控项目。当前资源只对创建者本人可见，暂不包含成员邀请或协作权限。项目平台固定为 Vue，并提供 Error Monitoring、Logging、Tracing 与 Application Metrics 四个功能开关；这些开关目前只保存项目配置，不采集对应监控事件。

管理接口均要求 JWT：

- `POST /api/groups`、`GET /api/groups`、`GET /api/groups/:groupSlug`
- `POST /api/groups/:groupSlug/projects`
- `GET /api/groups/:groupSlug/projects`
- `GET /api/groups/:groupSlug/projects/:projectSlug`
- `GET /api/groups/:groupSlug/projects/:projectSlug/connection`

DSN 中的 public key 只用于识别项目和连接校验，不是管理凭证。公开校验接口为 `POST /api/sdk/check`，请求体包含 `projectId` 和 `publicKey`；校验成功只更新项目的 `last_seen_at`。

DSN 的公开地址由下列变量决定：

```dotenv
MONITORING_PUBLIC_URL=http://localhost:3001
```

本地开发可使用 HTTP，生产环境必须配置 HTTPS 地址。本阶段不提供 SDK 包、不兼容 Sentry 协议，也不保存错误、日志、链路或指标正文。

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
