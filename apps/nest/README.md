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
填写连接信息。生产环境必须保持 `DB_SYNCHRONIZE=false`，启动服务前执行下方数据库迁移。

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
- `PATCH /api/groups/:groupSlug/projects/:projectSlug/issues/:issueId/archive`
- `PATCH /api/groups/:groupSlug/projects/:projectSlug/issues/:issueId/restore`
- `DELETE /api/groups/:groupSlug/projects/:projectSlug/issues/:issueId`
- `DELETE /api/groups/:groupSlug/projects/:projectSlug/issues/:issueId/permanent`

错误列表通过 `view=active|archived` 切换当前与已归档错误。归档支持永久归档，以及累计次数达到 `10`、`100`、`1000` 时自动恢复显示。普通删除会清除错误及历史事件，同类错误再次发生时重新创建；永久删除还会创建不可恢复的指纹阻止规则，未来相同项目、环境和指纹的事件不会入库。

浏览器 SDK 将版本化 JSON Envelope 发送到 `POST /api/sdk/:projectId/envelope`，并在请求头携带 `X-PMS-Key`。DSN 中的 public key 是浏览器可见的公开采集凭据，只有向所属项目写入连接报告和错误事件的权限，不是管理密钥；Issue 列表、详情等管理查询始终使用 JWT，并执行资源所有权校验。

SDK 初始化会发送 `client_report` 并更新项目 `last_seen_at`。错误事件在服务端同步处理：校验后于一个事务中写入事件表，并通过服务端 fingerprint 创建或更新错误归组表；相同 `eventId` 幂等，不会重复增加归组计数。首版没有消息队列、重试、离线缓存或批量发送。

DSN 的公开地址由下列变量决定：

```dotenv
PUBLIC_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:5173,http://localhost:3002
```

`CORS_ORIGINS` 是统一的逗号分隔来源列表，同时允许管理端访问和浏览器 SDK 上报。生产环境必须显式配置，且禁止使用 `*`。本地开发可使用 HTTP，生产环境必须为 `PUBLIC_URL` 配置 HTTPS 地址。

## 数据库结构管理

`src/database/migrations/1793577600000-baseline.ts` 是完整基线，覆盖当前全部 14 张业务表：用户、认证令牌、组、监控项目、错误事件、错误归组、错误抑制、日志及批次、指标及批次、Span、Trace 批次和 Profile，以及全部实体声明的主键、外键、枚举、唯一约束、检查约束和索引。

在仓库根目录运行：

```bash
pnpm --filter @pms/nest migration:show
pnpm --filter @pms/nest migration:run
# 回滚最后一份迁移；基线回滚会删除全部业务表及其中的数据
pnpm --filter @pms/nest migration:revert
```

CLI 自动加载 `apps/nest/.env.local`、`.env`（前者优先，进程环境变量优先于文件），使用与应用相同的 `DB_HOST/PORT/USERNAME/PASSWORD/NAME`。迁移显式连接数据库，不受应用的 `DB_ENABLED` 开关控制，始终关闭自动同步。执行记录保存在 `pms_migrations`，全部待执行迁移在同一事务中完成；成功后再次运行不会重复建表。数据库用户需要建表、建类型及创建 `uuid-ossp` 扩展的权限，也可由管理员预装扩展。回滚保留可能被其他应用共享的扩展。

生产环境先构建，再运行 `pnpm --filter @pms/nest migration:run:prod`，或在 API 生产容器内执行 `node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js`。生产环境必须保持 `DB_SYNCHRONIZE=false`。`migration:show:prod` 和 `migration:revert:prod` 分别查看状态和回滚。旧的 `traces:migrate` 命令现在是完整迁移的别名。

基线适用于空数据库，不是任意旧版本数据库的自动升级脚本。已经通过 synchronize 或历史 SQL 建表的数据库应先备份并核对实际结构；不要直接执行基线或仅伪造迁移记录。历史 `sql/20261023-profiles.sql` 是旧库的独立补丁，新库完整迁移后无需执行。

可设置 `MIGRATIONS_TEST_DATABASE_URL` 指向可用于测试的 PostgreSQL，再运行 `pnpm --filter @pms/nest test -- database/migrations.spec.ts --runInBand`。测试使用随机 schema 并自动清理，验证实体结构一致性、迁移执行记录、重复执行、回滚和重新迁移。未设置时跳过数据库测试。

已有数据库升级浏览器错误上下文结构时，需要执行以下等价变更：

```sql
ALTER TABLE monitoring_events DROP COLUMN IF EXISTS release;
ALTER TABLE monitoring_events
  ADD COLUMN IF NOT EXISTS contexts jsonb NOT NULL DEFAULT '{}'::jsonb;
```

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
