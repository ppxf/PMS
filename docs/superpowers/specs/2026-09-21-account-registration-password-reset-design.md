# 账号注册、邮箱验证与密码重置设计

## 目标与范围

在现有 NestJS JWT 登录与 Vue 3 登录页面基础上，增加访客自助注册、强制邮箱验证、重新发送验证邮件、忘记密码和重置密码功能，并通过真实 SMTP 投递邮件。

本次不增加系统管理员、邀请码、第三方登录、短信验证码、MFA、Refresh Token 或后台用户审批。新注册用户不获得任何业务权限。

## 用户生命周期

`UserStatus` 增加 `pending_verification`：

- 注册成功后为 `pending_verification`，不能登录。
- 邮箱验证成功后变为 `active`，可以登录。
- `disabled` 用户不能登录、不能通过密码重置恢复状态。

注册邮箱在查询和保存前统一 `trim().toLowerCase()`。数据库唯一约束作为并发注册的最终防线；应用层在可读错误场景返回 HTTP 409。

密码策略统一为至少 8 个字符。前后端使用相同下限；后端始终作为最终校验边界。密码仅保存 bcrypt 哈希。

## 一次性 Token 模型

新增 `auth_tokens` 表：

- `id`：UUID 主键。
- `userId`：关联用户，用户删除时级联删除。
- `type`：`email_verification` 或 `password_reset`。
- `tokenHash`：随机 Token 的 SHA-256 十六进制哈希，建立唯一索引。
- `expiresAt`：过期时间。
- `consumedAt`：消费时间，可空。
- `createdAt`：创建时间。

服务端使用加密安全随机源生成 32 字节 Token，通过 base64url 编码后发送给用户，数据库从不保存明文。查找时对提交 Token 做相同 SHA-256 处理，仅接受未消费且未过期的记录。

创建同用途的新 Token 前，将该用户尚未消费的旧 Token 标记为已消费。邮箱验证默认 24 小时有效，密码重置默认 30 分钟有效，分别由 `EMAIL_VERIFICATION_EXPIRES_IN_MINUTES` 和 `PASSWORD_RESET_EXPIRES_IN_MINUTES` 配置。

## 后端接口

### `POST /api/auth/register`

请求：

```json
{
  "name": "张三",
  "email": "user@example.com",
  "password": "password123",
  "passwordConfirmation": "password123"
}
```

流程：

1. 校验姓名非空、邮箱格式、密码至少 8 位且两次输入一致。
2. 若规范化邮箱已存在，返回 409“该邮箱已注册”。
3. 在数据库事务中创建 `pending_verification` 用户和邮箱验证 Token。
4. 发送验证邮件。
5. 如果 SMTP 发送失败，事务回滚，不保留用户或 Token，并返回 503。
6. 成功返回 201 和不含敏感信息的提示，不签发 JWT。

### `POST /api/auth/verify-email`

请求 `{ "token": "..." }`。在事务内锁定 Token，校验用途、有效期和消费状态，将用户改为 `active`，并消费该用户全部邮箱验证 Token。重复、伪造或过期 Token 统一返回 400“验证链接无效或已过期”。

### `POST /api/auth/resend-verification`

请求 `{ "email": "user@example.com" }`。仅为 `pending_verification` 用户创建新 Token并发送邮件；未知邮箱、已验证或禁用账号均返回相同 202 响应，避免泄露状态。SMTP 失败返回 503，但响应中不披露账号是否存在。

### `POST /api/auth/forgot-password`

请求 `{ "email": "user@example.com" }`。仅为 `active` 用户创建密码重置 Token并发送邮件；其他情况直接返回相同 202 响应。对外固定提示：“如果该邮箱已注册，我们将发送重置邮件。”

### `POST /api/auth/reset-password`

请求：

```json
{
  "token": "...",
  "password": "new-password",
  "passwordConfirmation": "new-password"
}
```

在事务内锁定 Token，验证用途、有效期和状态，更新 bcrypt 密码哈希，并消费该用户所有未消费的密码重置 Token。无效 Token 统一返回 400“重置链接无效或已过期”。成功后用户需要使用新密码重新登录。

### 登录行为调整

`POST /api/auth/login` 对未知邮箱、密码错误、`pending_verification` 和 `disabled` 均继续返回相同 401，避免从登录接口枚举账号状态。注册成功页单独提示用户查收验证邮件。

以上五个账号生命周期接口均通过 `@Public()` 公开；`GET /auth/me` 继续要求 JWT。

## SMTP 与邮件

新增独立 `MailModule`，使用 Nodemailer SMTP transport。配置项：

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `APP_FRONTEND_URL`

生产环境所有 SMTP 配置和 `APP_FRONTEND_URL` 必填；开发和测试环境提供适合本地邮件捕获工具的默认主机与端口，但仍使用真实 SMTP 协议，不把 Token 写入 API 响应或日志。

验证链接为 `${APP_FRONTEND_URL}/verify-email?token=<encoded-token>`，重置链接为 `${APP_FRONTEND_URL}/reset-password?token=<encoded-token>`。邮件包含纯文本和 HTML 两种正文，不在主题中包含 Token。

`MailService` 只暴露 `sendEmailVerification()` 与 `sendPasswordReset()`，业务服务不直接依赖 Nodemailer。自动测试替换 SMTP transport 这一外部边界，并断言真实 MailService 生成的收件人、主题和链接。

## 前端体验

新增公开路由：

- `/register`：姓名、邮箱、密码、确认密码；成功后显示查收邮件提示和返回登录入口。
- `/verify-email?token=...`：进入页面即提交 Token，显示验证中、成功、无效/过期状态；成功后提供登录入口。
- `/forgot-password`：提交邮箱后始终显示统一成功提示。
- `/reset-password?token=...`：输入新密码与确认密码；成功后跳转或提供登录入口。

登录页增加“注册账号”和“忘记密码”链接，去掉任何特定账号暗示。所有表单防止重复提交，后端 `AppError` 的可公开消息显示在 `role="alert"` 区域。

## 错误处理与安全

- 忘记密码和重发验证接口采用统一响应，防止账号枚举。
- 注册接口允许返回 409，因为用户需要知道邮箱已占用；数据库唯一约束处理并发竞争。
- Token 使用加密随机源、只存哈希、短时有效且单次消费。
- 验证和重置使用数据库事务与行锁，防止同一 Token 并发消费。
- 新密码写入前使用 bcrypt；密码、Token、SMTP 密码不进入日志。
- 邮件链接只基于受控的 `APP_FRONTEND_URL`，不接受请求头提供的 Host。
- SMTP 错误对客户端转换为 503 通用提示，详细错误只进入服务端错误日志。
- 本次不增加请求频率限制；部署层应对注册、重发和忘记密码端点限流，后续也可增加应用级限流模块。

## 数据一致性

注册使用数据库事务包裹用户、Token 和邮件发送，以满足“发送失败不留下无法验证账号”的需求。该方案会在等待 SMTP 时占用事务连接，但保证当前范围内的一致性；未来若引入任务队列，应改为 outbox 模式。

验证与重置流程在事务中锁定 Token 记录。密码重置不会自动启用 `disabled` 或 `pending_verification` 用户。

## 测试策略

后端 Jest 测试覆盖：

- 用户注册的规范化、bcrypt 哈希、默认空权限和 pending 状态。
- 重复邮箱 409 与数据库唯一约束错误映射。
- SMTP 失败时注册数据回滚。
- 验证 Token 的成功、过期、伪造、重复使用和并发消费。
- 重发验证及忘记密码的统一响应和旧 Token 失效。
- 密码重置更新哈希、旧密码失效、新密码可登录。
- MailService 生成正确的 SMTP 信封、主题、纯文本和 HTML 链接。
- 五个公开接口的 DTO 校验、响应码和 E2E 流程。

前端 Vitest 测试覆盖：

- auth API 的五个新增请求契约。
- 注册表单验证、成功状态与重复邮箱错误。
- 邮箱验证页面的自动提交及成功/失败状态。
- 忘记密码统一成功提示。
- 重置密码的 Token、确认密码校验及成功入口。
- 登录页注册链接和忘记密码链接。

## 验收标准

- 新访客可自行注册，但验证邮箱前不能登录。
- SMTP 能发送可用的验证和重置链接，API 与日志不泄露明文 Token。
- 验证链接只能使用一次，并在有效期内激活账号。
- 忘记密码不泄露邮箱是否存在，重置链接只能使用一次。
- 重置成功后旧密码不能登录，新密码可以登录。
- 应用不创建系统管理员，也不赋予新用户管理权限。
- Nest/Vue 单元测试、Nest E2E、类型检查、Lint 和生产构建全部通过。
- 整个实现过程不执行 Git 操作。
