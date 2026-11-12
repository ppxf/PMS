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
- Redis：跨实例原子限流与管理写请求幂等协调；配置的 Redis 故障时返回 503
- `@pms/config`：复用 monorepo 公共 ESLint、TypeScript 和 Prettier 规则

## 本地运行

```bash
cp .env.example .env
pnpm start:dev
```

默认端口为 `3000`，健康检查地址为 `GET /api`。数据库默认关闭，因此没有
PostgreSQL 服务时也可以启动。需要数据库时，将 `DB_ENABLED` 设置为 `true` 并
填写连接信息。开发和生产均保持 `DB_SYNCHRONIZE=false`，启动服务前执行下方数据库迁移。生产还必须配置 `REDIS_URL`；本地未配置时使用最多 10,000 条记录的进程内协调存储，容量耗尽返回 503。

## JWT 登录

JWT 使用以下环境变量：

```dotenv
JWT_SECRET=development-only-jwt-secret-change-before-production
JWT_EXPIRES_IN=1h
```

登录接口为 `POST /api/auth/login`，当前用户接口为 `GET /api/auth/me`。除登录和健康检查外，控制器默认要求 `Authorization: Bearer <token>`。

生产环境要求 `JWT_SECRET` 至少 32 个字符。应用不会自动创建引导用户；访客可通过注册接口创建账号，完成邮箱验证后登录。密码重置成功会增加账户会话版本，旧 JWT 在后续请求中失效。

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

登录用户可以创建多个组，每个组可以创建多个监控项目。项目支持 owner 和 member 协作：owner 执行管理写操作，member 按七项模块读取权限访问。`project:issues:read` 还允许确认站内告警，规则管理仍仅限 owner。权限、邀请和邮件说明见 [项目权限与邀请](../../docs/project-access.md)。项目平台为 Vue，支持错误、日志、链路、指标、Web Vitals 与浏览器 Profiles 采集。

下面路由参数为兼容保留名称：`:groupSlug` 和 `:projectSlug` 均接受 UUID 或旧 slug。新链接使用 UUID。旧 slug 对当前用户匹配多个资源时返回未找到或歧义错误，不能任意选择。

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

浏览器 SDK 将版本化 JSON Envelope 发送到 `POST /api/sdk/:projectId/envelope`，并在请求头携带 `X-PMS-Key`。DSN 中的 public key 是浏览器可见的公开采集凭据，只能向所属项目写入已启用的采集数据；Issue 列表、详情等管理查询始终使用 JWT，并按项目角色与模块权限授权。

SDK 初始化会发送 `client_report` 并更新项目 `last_seen_at`。`connected` 表示曾成功连接，不表示实时在线；接入状态按数据类型的最近活动区分最近 24 小时的 `active`、超过 24 小时的 `stale`、从未收到的 `waiting` 以及采集关闭的 `disabled`。Web Vitals 没有独立项目开关。

错误事件在服务端同步处理：校验后于事务中写入事件表，并通过服务端 fingerprint 创建或更新错误归组表；相同 `eventId` 幂等且会校验载荷，不会重复增加归组计数。Redis 限流不替代数据库唯一约束、事务和 SDK 载荷校验。管理请求的可选 `Idempotency-Key`、各接口配额和故障恢复规则见 [生产加固与运维](../../docs/production-hardening.md)。

DSN 的公开地址由下列变量决定：

```dotenv
PUBLIC_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:5173,http://localhost:3002
```

`CORS_ORIGINS` 是统一的逗号分隔来源列表，同时允许管理端访问和浏览器 SDK 上报。生产环境必须显式配置，且禁止使用 `*`。本地开发可使用 HTTP，生产环境必须为 `PUBLIC_URL` 配置 HTTPS 地址。

## 数据库结构管理

`src/database/migrations/1793577600000-baseline.ts` 创建最初 14 张业务表及其约束、索引。统一迁移入口还按顺序执行 Web Vitals、项目成员与邀请、审计、工作台告警和后续运维迁移；不要将基线的表数当作当前完整结构，也不要分别手动建表。

在仓库根目录运行：

```bash
pnpm --filter @pms/nest migration:show
pnpm --filter @pms/nest migration:run
# 回滚最后一份迁移；基线回滚会删除全部业务表及其中的数据
pnpm --filter @pms/nest migration:revert
```

CLI 自动加载 `apps/nest/.env.local`、`.env`（前者优先，进程环境变量优先于文件），使用与应用相同的 `DB_HOST/PORT/USERNAME/PASSWORD/NAME`。迁移显式连接数据库，不受应用的 `DB_ENABLED` 开关控制，始终关闭自动同步。执行记录保存在 `pms_migrations`，全部待执行迁移在同一事务中完成；成功后再次运行不会重复建表。数据库用户需要建表、建类型及创建 `uuid-ossp` 扩展的权限，也可由管理员预装扩展。回滚保留可能被其他应用共享的扩展。

生产环境先构建，再运行 `pnpm --filter @pms/nest migration:run:prod`，或在 API 生产容器内执行 `node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js`。生产环境必须保持 `DB_SYNCHRONIZE=false`。`migration:show:prod` 和 `migration:revert:prod` 分别查看状态和回滚。旧的 `traces:migrate` 命令现在是完整迁移的别名。

生产加固版本包括 `1794528000000-production-hardening`（会话版本及事件查询索引）、`1794528000001-invitation-outbox`（持久邀请邮件任务）。生产默认启用监控数据 30 天保留清理；`pnpm retention:cleanup` 从仓库根目录默认执行 dry-run，显式传入 `-- --execute` 才删除，后台开关与保留参数见 [生产加固与运维](../../docs/production-hardening.md)。审计不随监控清理删除，错误归组的末次事件证据予以保留。

基线适用于空数据库，不是任意旧版本数据库的自动升级脚本。已经通过 synchronize 或历史 SQL 建表的数据库应先备份并核对实际结构；不要直接执行基线或仅伪造迁移记录。历史 `sql/20261023-profiles.sql` 仅留作旧补丁参考，统一迁移管理的数据库不再手动执行。

可设置 `MIGRATIONS_TEST_DATABASE_URL` 指向可用于测试的 PostgreSQL，再运行 `pnpm --filter @pms/nest test -- database/migrations.spec.ts --runInBand`。测试使用随机 schema 并自动清理，验证实体结构一致性、迁移执行记录、重复执行、回滚和重新迁移。未设置时跳过数据库测试。

## 当前边界

PMS 使用自身版本化 Envelope，不兼容 Sentry Envelope；尚未实现 Source Map 反混淆。邀请邮件通过数据库任务异步投递，采用至少一次语义；SDK 采集的持久去重仍由数据库承担。Redis 请求幂等不提供进程崩溃情况下的 exactly-once 保证。数据库与 Redis 集成测试需要显式测试连接，单元测试或构建通过不能证明实际部署已执行迁移、投递邮件或完成跨实例验证。

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
