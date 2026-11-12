# 项目权限与邀请部署说明

项目所有者（owner）可以配置项目、执行管理写操作、邀请用户及管理成员。成员（member）按明确授权的模块读取；例外是 `project:issues:read` 同时允许确认站内告警，不能编辑告警规则、修改或删除错误。邀请不会授予分组管理权或同分组其他项目的访问权。权限每次请求检查，修改或移除成员后即作用于后续请求；管理请求幂等重放也必须重新授权。

七项可分配权限为：

- `project:audit:read`
- `project:issues:read`
- `project:traces:read`
- `project:metrics:read`
- `project:web-vitals:read`
- `project:logs:read`
- `project:profiles:read`

项目路径的分组与项目参数接受 UUID，也保留旧 slug。新生成的项目、成员和邀请跳转链接使用 UUID，避免不同所有者的同名分组或项目冲突。旧 slug 若对当前用户匹配多个资源，则拒绝歧义访问。

## 数据库部署

在 API 环境文件 `apps/nest/.env.local` 或 `.env` 配置数据库连接。部署新版本前，使用仓库根目录命令检查并执行迁移：

```powershell
pnpm --filter @pms/nest migration:show
pnpm --filter @pms/nest migration:run
```

编译后的生产包使用 `migration:show:prod` 和 `migration:run:prod`。迁移不会在应用启动时自动运行。开发和生产都保持 `DB_SYNCHRONIZE=false`，统一执行全部待运行迁移；`traces:migrate` 是同一完整迁移入口的兼容别名，不要单独运行历史 Profiles SQL。空库基线不适用于已自动建表且未经核对的旧数据库。

`1794355200000-project-access` 为项目增加 `owner_id`，以所属分组的 `owner_id` 回填历史项目，并创建 `project_members`、`project_invitations`。已有项目因此由原分组所有者持有。迁移依赖有效的项目与分组关联；执行前应备份数据库。回退该迁移会删除成员和邀请数据。

异步邀请邮件还需要 `1794528000001-invitation-outbox`；会话版本与查询索引由 `1794528000000-production-hardening` 提供。两者随统一入口执行，不在启动时自动建表。回退 outbox 会删除尚未发送的邮件任务。

## 邮件与前端地址

配置实际 SMTP 服务及前端公开地址，变量示例如下：

```dotenv
APP_FRONTEND_URL=https://pms.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mailer
SMTP_PASSWORD=replace-with-secret
SMTP_FROM=PMS <no-reply@example.com>
```

本地可按 `.env.example` 使用 `localhost:1025`、`SMTP_SECURE=false` 的邮件捕获服务。邀请链接指向 `APP_FRONTEND_URL/project-invitations/accept?token=…`；前端托管需支持该路径的 SPA 回退。

## 邀请操作

所有者从项目成员页面填写邮箱及权限发送邀请。链接有效期为 7 天，只能由该邮箱对应的已验证、启用账户接受；未登录用户需先登录或注册并验证邮箱。邀请表仅保存 Token 哈希；邮件任务为发送链接临时保存加密令牌，完成后清除。成功接受在事务中创建成员并标记已消费。

创建和重发在事务中持久化待发送邮件任务，后台在事务外调用 SMTP，因此接口成功只表示任务已保存，不表示邮件已经投递。任务发送失败后按后台重试规则处理；`deliveryStatus=pending|failed` 的邀请不能接受。修复 SMTP 后也可由所有者重发：重发生成新 Token 并重新计算 7 天有效期，旧链接立即失效。再次邀请同一项目同一邮箱也会撤销旧的未消费邀请。已接受或已撤销的邀请不能重发。具体环境变量、重试和恢复边界见 [生产加固与运维](production-hardening.md)。

## 验证与限制

以下为可复现的验证入口，不代表目标环境已经执行迁移、通过 PostgreSQL 并发测试或完成真实 SMTP 投递；部署验收需记录各环境的实际结果。

使用可丢弃的 PostgreSQL 数据库运行事务测试：

```powershell
$env:INVITATIONS_TEST_DATABASE_URL='postgresql://user:password@localhost:5432/pms_test'
pnpm --filter @pms/nest test -- project-invitations --runInBand
```

测试也接受 `MIGRATIONS_TEST_DATABASE_URL` 作为后备连接变量。测试账户需能创建和删除 schema；测试创建随机 schema 并清理，避免使用生产数据库。未配置这两个变量时，数据库测试会跳过，因此单元测试通过不能证明真实数据库并发或迁移已经验证。
