# PMS JWT 登录系统实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 用 PostgreSQL 用户、bcrypt 密码哈希和 JWT Access Token 打通 NestJS 与 Vue 3 的真实登录、会话恢复和接口保护流程。

**架构：** NestJS 中 `users` 模块负责用户持久化与默认管理员，`auth` 模块负责凭据校验、签发 JWT 和解析请求身份，全局 Guard 默认保护控制器。Vue auth feature 通过类型化 API 驱动 Pinia 会话，路由首次进入前向 `/auth/me` 校验本地 Token，Axios 统一注入 Token 并处理 401。

**技术栈：** NestJS 11、TypeORM/PostgreSQL、`@nestjs/jwt`、bcrypt、Jest；Vue 3、Pinia、Vue Router、Axios、Vitest。

**规格：** `docs/superpowers/specs/2026-09-21-jwt-authentication-design.md`

## 全局约束

- 用户保存在 PostgreSQL，邮箱唯一且查询前统一转为小写。
- 密码只保存 bcrypt 哈希，任何响应和日志不得返回密码或哈希。
- JWT 仅承载 `sub` 与 `email`，默认有效期 `1h`。
- 登录失败统一返回 401，不区分未知邮箱、错误密码或禁用用户。
- 后端接口默认受保护，登录和健康检查显式公开。
- 前端继续用 `localStorage` 保存本次单 Access Token 会话。
- 不实现注册、Refresh Token、找回密码、MFA、锁定和撤销列表。
- 每个生产行为严格遵循红—绿—重构；先确认测试因缺失行为失败，再实现。

---

### 任务 1：认证依赖与环境配置

**文件：**
- 修改：`apps/nest/package.json`
- 修改：`pnpm-lock.yaml`
- 修改：`apps/nest/src/config/configuration.ts`
- 修改：`apps/nest/src/config/env.validation.ts`
- 创建：`apps/nest/src/config/env.validation.spec.ts`
- 创建：`apps/nest/.env.example`

- [ ] **步骤 1：编写失败的配置校验测试**

在 `env.validation.spec.ts` 中用明确 fixture 验证：生产环境缺少 `JWT_SECRET` 会抛错；生产 JWT 密钥少于 32 字符会抛错；开发环境缺省认证配置可通过；显式 `JWT_EXPIRES_IN=2h` 可通过。

```ts
it('rejects production configuration without a strong JWT secret', () => {
  expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
    'JWT_SECRET',
  );
});
```

- [ ] **步骤 2：运行测试验证正确失败**

运行：`pnpm --filter @pms/nest test -- env.validation.spec.ts --runInBand`

预期：FAIL，因为当前校验器尚未处理 JWT 与管理员配置。

- [ ] **步骤 3：安装依赖并实现最少配置**

运行：

```bash
pnpm --filter @pms/nest add @nestjs/jwt bcrypt
pnpm --filter @pms/nest add -D @types/bcrypt
```

在配置中增加 `auth.jwtSecret`、`auth.jwtExpiresIn`、`auth.adminEmail`、`auth.adminPassword`、`auth.adminName`。开发默认值分别为非生产密钥、`1h`、`admin@example.com`、`123456`、`系统管理员`；生产环境要求显式提供至少 32 字符的密钥和非默认管理员密码。

- [ ] **步骤 4：运行配置测试与类型检查**

运行：

```bash
pnpm --filter @pms/nest test -- env.validation.spec.ts --runInBand
pnpm --filter @pms/nest typecheck
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add apps/nest/package.json pnpm-lock.yaml apps/nest/src/config apps/nest/.env.example
git commit -m "feat(auth): add authentication configuration"
```

### 任务 2：用户实体、查询和默认管理员

**文件：**
- 创建：`apps/nest/src/users/entities/user.entity.ts`
- 创建：`apps/nest/src/users/users.service.ts`
- 创建：`apps/nest/src/users/users.service.spec.ts`
- 创建：`apps/nest/src/users/admin-seeder.service.ts`
- 创建：`apps/nest/src/users/admin-seeder.service.spec.ts`
- 创建：`apps/nest/src/users/users.module.ts`
- 修改：`apps/nest/src/app.module.ts`

- [ ] **步骤 1：编写失败的用户服务测试**

用内存 fake repository（实现实际使用的 `findOne`、`create`、`save` 边界）验证 `findByEmail(' Admin@Example.com ')` 使用 `admin@example.com` 查询；验证默认管理员首次启动时保存 bcrypt 哈希和四项权限，第二次启动不覆盖已有用户；验证 `DB_ENABLED=false` 时不访问 repository。

```ts
expect(savedUser.email).toBe('admin@example.com');
expect(savedUser.passwordHash).not.toBe('123456');
expect(await bcrypt.compare('123456', savedUser.passwordHash)).toBe(true);
```

- [ ] **步骤 2：运行测试验证正确失败**

运行：`pnpm --filter @pms/nest test -- users.service.spec.ts admin-seeder.service.spec.ts --runInBand`

预期：FAIL，因为 users 模块尚不存在。

- [ ] **步骤 3：实现用户持久化边界**

创建 UUID `User` 实体，字段为 `email`、`passwordHash`、`name`、`status`、`permissions`、时间戳。`UsersService` 提供 `findByEmail()` 与 `findActiveById()`。`AdminSeederService implements OnApplicationBootstrap` 仅在数据库启用时执行幂等初始化。

- [ ] **步骤 4：运行用户测试**

运行：`pnpm --filter @pms/nest test -- users.service.spec.ts admin-seeder.service.spec.ts --runInBand`

预期：PASS，且错误输出为空。

- [ ] **步骤 5：提交**

```bash
git add apps/nest/src/users apps/nest/src/app.module.ts
git commit -m "feat(users): persist users and seed administrator"
```

### 任务 3：登录服务与 JWT 会话接口

**文件：**
- 创建：`apps/nest/src/auth/dto/login.dto.ts`
- 创建：`apps/nest/src/auth/interfaces/auth-user.interface.ts`
- 创建：`apps/nest/src/auth/interfaces/jwt-payload.interface.ts`
- 创建：`apps/nest/src/auth/auth.service.ts`
- 创建：`apps/nest/src/auth/auth.service.spec.ts`
- 创建：`apps/nest/src/auth/auth.controller.ts`
- 创建：`apps/nest/src/auth/auth.controller.spec.ts`
- 创建：`apps/nest/src/auth/auth.module.ts`
- 修改：`apps/nest/src/app.module.ts`

- [ ] **步骤 1：编写失败的 AuthService 行为测试**

使用真实 bcrypt 哈希和真实 `JwtService` 验证正确凭据返回可验签 Token、公开用户字段和权限；未知邮箱、错误密码、禁用用户均抛出同一种 `UnauthorizedException('邮箱或密码错误')`。

```ts
const payload = await jwtService.verifyAsync(result.accessToken);
expect(payload).toMatchObject({ sub: 'user-1', email: 'admin@example.com' });
expect(result.user).toEqual({
  id: 'user-1',
  name: '系统管理员',
  email: 'admin@example.com',
});
```

- [ ] **步骤 2：运行测试验证正确失败**

运行：`pnpm --filter @pms/nest test -- auth.service.spec.ts --runInBand`

预期：FAIL，因为 AuthService 尚不存在。

- [ ] **步骤 3：实现最少登录服务**

实现 `AuthService.login(email, password)`：规范化邮箱、查询用户、执行 bcrypt compare、签发只含 `sub`/`email` 的 JWT，并通过专用映射函数返回 `AuthSession`。实现 `getCurrentUser(id)` 返回最新用户与权限。

- [ ] **步骤 4：运行服务测试验证通过**

运行：`pnpm --filter @pms/nest test -- auth.service.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 5：为 Controller 编写失败测试并实现端点**

测试 `login(dto)` 将 DTO 传给服务并返回会话，`me(request.user)` 返回当前用户资料；实现 `POST /auth/login` 与 `GET /auth/me`，使用 Swagger DTO 描述请求和响应。

运行：`pnpm --filter @pms/nest test -- auth.controller.spec.ts --runInBand`

预期：先 FAIL（控制器缺失），实现后 PASS。

- [ ] **步骤 6：提交**

```bash
git add apps/nest/src/auth apps/nest/src/app.module.ts
git commit -m "feat(auth): add JWT login endpoints"
```

### 任务 4：全局 JWT Guard 与公开端点

**文件：**
- 创建：`apps/nest/src/auth/decorators/public.decorator.ts`
- 创建：`apps/nest/src/auth/guards/jwt-auth.guard.ts`
- 创建：`apps/nest/src/auth/guards/jwt-auth.guard.spec.ts`
- 修改：`apps/nest/src/auth/auth.controller.ts`
- 修改：`apps/nest/src/app.controller.ts`
- 修改：`apps/nest/src/app.module.ts`
- 修改：`apps/nest/test/app.e2e-spec.ts`

- [ ] **步骤 1：编写失败的 Guard 单元测试**

验证 `@Public()` 元数据直接放行；缺少 Bearer Token 返回 401；有效 Token 被验签后按 `sub` 查询 active 用户并把公开身份写入 `request.user`；无效 Token、已过期 Token、用户不存在和禁用用户均返回 401。

- [ ] **步骤 2：运行 Guard 测试验证正确失败**

运行：`pnpm --filter @pms/nest test -- jwt-auth.guard.spec.ts --runInBand`

预期：FAIL，因为 Guard 尚不存在。

- [ ] **步骤 3：实现 Guard 并注册为 APP_GUARD**

从 Authorization header 严格提取 Bearer Token，以 `JwtService.verifyAsync` 验签，查询当前 active 用户并构造 `{ id, name, email, permissions }`。用 Reflector 读取 `IS_PUBLIC_KEY`；登录控制器和健康检查添加 `@Public()`。

- [ ] **步骤 4：编写并运行 E2E 保护测试**

在 e2e 测试模块中覆盖：健康检查无 Token 为 200；受保护 `/auth/me` 无 Token 为 401；有效登录后携带 Token 访问 `/auth/me` 为 200。数据库外部边界可在 e2e 测试模块中用测试 provider 替换，Guard、Controller、ValidationPipe 和响应包装保持真实。

运行：`pnpm --filter @pms/nest test:e2e -- --runInBand`

预期：新增测试先 FAIL，实现完整装配后 PASS。

- [ ] **步骤 5：提交**

```bash
git add apps/nest/src/auth apps/nest/src/app.controller.ts apps/nest/src/app.module.ts apps/nest/test
git commit -m "feat(auth): protect API with a global JWT guard"
```

### 任务 5：Vue Auth API 与可恢复会话 Store

**文件：**
- 创建：`apps/vue3/src/features/auth/api/auth.api.ts`
- 创建：`apps/vue3/src/features/auth/api/__tests__/auth.api.spec.ts`
- 修改：`apps/vue3/src/features/auth/model/auth.store.ts`
- 修改：`apps/vue3/src/features/auth/model/__tests__/auth.store.spec.ts`
- 修改：`apps/vue3/src/features/auth/index.ts`

- [ ] **步骤 1：编写失败的 Auth API 测试**

通过 Axios mock adapter 或 Vitest 对 HTTP 边界的窄 mock 验证 `login()` 发往 `/auth/login` 且传递邮箱密码，`getCurrentUser()` 请求 `/auth/me`，返回值完整映射 `user` 与 `permissions`。

- [ ] **步骤 2：运行 API 测试验证正确失败**

运行：`pnpm --filter @pms/vue3 test -- src/features/auth/api/__tests__/auth.api.spec.ts`

预期：FAIL，因为 API 模块尚不存在。

- [ ] **步骤 3：实现类型化 Auth API**

定义 `LoginCredentials`、`CurrentUser`，调用现有 `http.post`/`http.get`，复用 `AuthSession` 与 `AuthUser` 类型。

- [ ] **步骤 4：为 Store 初始化编写失败测试**

验证无本地会话时不请求 API；有效本地 Token 调用 `/auth/me` 并刷新用户/权限；请求失败清除 Token；两次并发 `initialize()` 只调用一次 API；`isInitialized` 在完成后为 true。

- [ ] **步骤 5：实现 Store 初始化并运行测试**

为 store 增加 `isInitialized`、`initialize()` 和模块级/Store 内共享 Promise；仅 `login()` 写入完整新会话，初始化刷新时保留原 accessToken。

运行：

```bash
pnpm --filter @pms/vue3 test -- src/features/auth/api/__tests__/auth.api.spec.ts src/features/auth/model/__tests__/auth.store.spec.ts
pnpm --filter @pms/vue3 typecheck
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add apps/vue3/src/features/auth
git commit -m "feat(auth): connect Vue session store to API"
```

### 任务 6：真实登录页与错误反馈

**文件：**
- 修改：`apps/vue3/src/features/auth/views/LoginView.vue`
- 创建：`apps/vue3/src/features/auth/views/__tests__/LoginView.spec.ts`

- [ ] **步骤 1：编写失败的登录视图测试**

挂载真实 LoginView（只替换 HTTP 外部边界），验证提交有效表单会调用 `authApi.login`、保存返回会话并跳转安全 redirect；API 抛出 `AppError('邮箱或密码错误')` 时页面显示错误且不跳转；`//evil.example` 回退首页。

- [ ] **步骤 2：运行测试验证正确失败**

运行：`pnpm --filter @pms/vue3 test -- src/features/auth/views/__tests__/LoginView.spec.ts`

预期：FAIL，因为页面仍生成演示 Token。

- [ ] **步骤 3：实现真实提交与错误展示**

调用 `login(values)`，成功后 `auth.login(session)`；catch 中把 `AppError.message` 写入页面 Alert，未知错误显示“登录失败，请稍后重试”。保留提交中禁用按钮和既有站内 redirect 检查，更新演示文案。

- [ ] **步骤 4：运行视图测试与可访问性相关断言**

运行：`pnpm --filter @pms/vue3 test -- src/features/auth/views/__tests__/LoginView.spec.ts`

预期：PASS；错误信息能通过 alert role 查询。

- [ ] **步骤 5：提交**

```bash
git add apps/vue3/src/features/auth/views
git commit -m "feat(auth): submit login form to Nest API"
```

### 任务 7：路由初始化与 401 会话失效

**文件：**
- 修改：`apps/vue3/src/router/guards/authorization.ts`
- 修改：`apps/vue3/src/router/guards/__tests__/authorization.spec.ts`
- 创建：`apps/vue3/src/services/http/__tests__/client.spec.ts`
- 修改：`apps/vue3/src/main.ts`

- [ ] **步骤 1：编写失败的路由初始化测试**

验证进入受保护页面前等待 `auth.initialize()`；初始化恢复权限后允许进入；初始化清除无效 Token 后跳转登录；访问登录页不因自身 `/auth/me` 失败产生循环。

- [ ] **步骤 2：运行路由测试验证正确失败**

运行：`pnpm --filter @pms/vue3 test -- src/router/guards/__tests__/authorization.spec.ts`

预期：FAIL，因为 Guard 尚未等待初始化。

- [ ] **步骤 3：实现异步路由 Guard**

将 `beforeEach` 改为 async，在认证和权限判断前 `await auth.initialize()`；保持安全 redirect 和现有 403 行为。

- [ ] **步骤 4：编写并运行 Axios 401 测试**

验证并发 401 只触发一次 `onUnauthorized`，请求带当前 Bearer Token，provider 完成后每个请求都拒绝为规范化 `AppError`。实现若无需修改 client，则保留测试作为现有契约保护；在 `main.ts` 的 provider 中清会话并仅从非登录页跳转。

运行：`pnpm --filter @pms/vue3 test -- src/services/http/__tests__/client.spec.ts src/router/guards/__tests__/authorization.spec.ts`

预期：新增测试先 FAIL 或暴露现有竞态，调整后 PASS。

- [ ] **步骤 5：提交**

```bash
git add apps/vue3/src/router apps/vue3/src/services/http apps/vue3/src/main.ts
git commit -m "feat(auth): validate sessions before protected navigation"
```

### 任务 8：全量验证与文档收尾

**文件：**
- 修改：`README.md`
- 修改：`apps/nest/README.md`
- 修改：`apps/vue3/README.md`

- [ ] **步骤 1：补充运行说明**

记录 PostgreSQL 建库、`DB_ENABLED=true`、认证环境变量、首次启动初始化管理员、前后端启动命令和登录地址。明确生产环境必须替换 JWT 密钥与管理员密码。

- [ ] **步骤 2：运行格式化检查与自动修复**

运行：

```bash
pnpm --filter @pms/nest format
pnpm --filter @pms/vue3 format
```

检查格式化 diff 仅涉及本功能文件和必要的既有格式一致性。

- [ ] **步骤 3：运行全量质量门禁**

运行：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

预期：全部退出码为 0，无测试失败、类型错误、Lint 错误、构建错误或空白错误。

- [ ] **步骤 4：执行变异式人工检查**

逐项确认：改错 JWT 密钥会使受保护请求 401；删除 active 状态判断会有测试失败；把邮箱规范化去掉会有测试失败；让初始化保留无效 Token 会有测试失败；把安全 redirect 改为接受 `//` 会有测试失败。

- [ ] **步骤 5：提交文档与最终修整**

```bash
git add README.md apps/nest/README.md apps/vue3/README.md
git commit -m "docs: document JWT login setup"
```

- [ ] **步骤 6：检查工作区和提交历史**

运行：

```bash
git status --short
git log --oneline -10
```

预期：工作区干净，JWT 登录实现与文档提交完整可审查。
