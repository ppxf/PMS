# PMS JWT 登录系统设计

## 目标与范围

为现有 NestJS API 与 Vue 3 管理后台建立一套可持久化、可验证的登录闭环。用户保存在 PostgreSQL 中，密码以 bcrypt 哈希保存；登录成功后由 NestJS 签发 JWT Access Token，Vue 使用该 Token 访问受保护接口。

本次包含登录、当前用户查询、后端接口保护、前端会话持久化、启动校验、未授权退出以及对应自动化测试。

本次不包含用户注册、Refresh Token、找回密码、多因素认证、登录失败锁定和 Token 撤销列表。

## 总体架构

后端新增 `users` 与 `auth` 两个边界清晰的模块：`users` 负责用户实体和查询；`auth` 负责凭据校验、JWT 签发、JWT 身份解析以及 HTTP 登录接口。认证通过全局 Guard 执行，明确标记为公开的端点绕过认证。

前端在现有 auth feature 中新增 API 层与会话初始化流程。登录页不再生成演示会话，而是调用 NestJS；Axios 继续通过现有 auth provider 添加 Bearer Token，并在 401 时统一清理会话和跳转登录页。

## 数据模型

`users` 表包含以下字段：

- `id`：UUID 主键。
- `email`：规范化为小写并建立唯一约束。
- `passwordHash`：bcrypt 哈希，不通过 API 返回。
- `name`：展示名称。
- `status`：`active` 或 `disabled`；只有 `active` 用户可以登录。
- `permissions`：PostgreSQL `text[]`，保存权限字符串。
- `createdAt`、`updatedAt`：审计时间。

应用不会自动创建任何用户。部署方需要通过迁移、运维脚本或其他受控方式预先写入用户记录，并确保 `passwordHash` 使用 bcrypt 生成。当 `DB_ENABLED=false` 时，认证接口不可用，但仍保留无需 PostgreSQL 即可运行基础健康检查的能力。

## 后端接口与认证流程

### `POST /api/auth/login`

请求体：

```json
{
  "email": "admin@example.com",
  "password": "change-me"
}
```

处理流程：

1. DTO 校验邮箱格式与密码非空。
2. 邮箱转换为小写后查询用户。
3. 以 bcrypt 比较提交密码与哈希。
4. 用户不存在、密码错误或状态禁用时统一返回 HTTP 401 和通用错误信息。
5. 成功时签发包含 `sub`（用户 ID）和 `email` 的 JWT，并返回会话数据。

响应数据在现有全局响应拦截器包装后为：

```json
{
  "success": true,
  "data": {
    "accessToken": "<jwt>",
    "user": {
      "id": "<uuid>",
      "name": "系统管理员",
      "email": "admin@example.com"
    },
    "permissions": ["user:read", "user:create", "user:update", "user:delete"]
  }
}
```

### `GET /api/auth/me`

要求 `Authorization: Bearer <jwt>`。Guard 验证签名、有效期和载荷后按 `sub` 查询用户；用户不存在或已禁用时返回 401。成功时返回与登录响应中相同的 `user` 和 `permissions`，不返回新 Token。

### 全局保护策略

JWT Guard 作为全局 Guard 注册。`POST /auth/login`、现有健康检查端点和 Swagger 文档明确使用 `@Public()` 跳过认证。后续新接口默认受保护，避免遗漏 Guard。

JWT 密钥从 `JWT_SECRET` 读取，生产环境必须显式配置且长度至少 32 个字符；开发和测试环境允许使用清晰标识为非生产用途的默认值。过期时间从 `JWT_EXPIRES_IN` 读取，默认 `1h`。

## 前端会话流程

auth feature 新增类型化 API：

- `login(credentials)` 调用 `POST /auth/login` 并返回完整 `AuthSession`。
- `getCurrentUser()` 调用 `GET /auth/me` 并返回当前用户与权限。

登录页提交表单后调用 API：成功则通过 store 保存会话，并安全跳转到 `redirect` 或首页；失败则展示后端规范化后的用户可读错误，且保留邮箱输入。按钮在提交期间禁用，防止重复请求。

Pinia store 保留现有 `localStorage` 持久化。增加初始化状态与 `initialize()`：

- 没有本地 Token 时直接完成初始化。
- 有 Token 时请求 `/auth/me`，以服务端返回的用户和权限刷新本地资料。
- 401 或无效 Token 会清除会话。
- 同一次应用生命周期中的并发初始化复用同一个 Promise，避免重复请求。

路由守卫在判断 `requiresAuth` 与权限前等待初始化完成。Axios 收到 401 后通过现有 auth provider 清除会话；若当前不在登录页，则跳转到登录页，并携带安全的站内 `redirect`。

JWT 继续保存在 `localStorage`，符合当前项目已有会话模型和本次单 Token 范围。该方案需要依赖现有 CSP、依赖治理和 Vue 默认转义降低 XSS 风险；未来若引入 Refresh Token，应将长期令牌放在 HttpOnly Cookie 中。

## 错误处理与安全

- 密码从不写入日志或响应，实体序列化也不暴露 `passwordHash`。
- 登录失败统一响应，避免账号枚举。
- JWT 只接受服务端配置的签名算法和密钥。
- DTO 使用全局 ValidationPipe 的白名单与转换能力；若当前入口尚未启用，则在本次补齐。
- 前端只接受以单个 `/` 开头且不以 `//` 开头的站内重定向地址。
- 401 清理会话；403 保留会话并进入无权访问页。

## 配置与依赖

NestJS 新增 `@nestjs/jwt`、`bcrypt` 及对应类型依赖。配置新增：

- `JWT_SECRET`
- `JWT_EXPIRES_IN`，默认 `1h`

`.env.example` 同步记录这些变量及生产安全要求。

## 测试策略

后端采用 Jest：

- users service：邮箱规范化以及 active 用户查询。
- auth service：有效凭据返回 JWT 会话；账号不存在、密码错误、禁用账号均返回 401。
- JWT Guard/策略：有效 Token 建立请求身份；过期或无效 Token 返回 401。
- controller/e2e：登录 DTO、登录成功、登录失败、`/auth/me`、无 Token 访问受保护接口。

前端采用 Vitest：

- auth API 请求路径与数据映射。
- auth store 登录持久化、启动校验、失败清理和初始化去重。
- 登录页成功跳转与错误展示。
- 路由守卫等待初始化、未登录跳转、权限不足跳转。
- Axios 401 触发一次统一注销流程。

实现遵循红—绿—重构循环：每个行为先添加会按预期原因失败的测试，再编写最少实现并运行相关测试，最后运行全量检查。

## 验收标准

- 使用初始化管理员的正确邮箱和密码可以登录并进入后台。
- 错误密码、未知邮箱和禁用账号均无法登录且不会泄露账号状态。
- 刷新浏览器后，有效 Token 可恢复会话；无效或过期 Token 会被清除并返回登录页。
- 所有受保护 NestJS 接口在缺少或携带无效 Token 时返回 401。
- 前端请求自动携带 Bearer Token，权限控制继续基于服务端返回的权限工作。
- NestJS 与 Vue 的测试、类型检查、Lint 和构建全部通过。
