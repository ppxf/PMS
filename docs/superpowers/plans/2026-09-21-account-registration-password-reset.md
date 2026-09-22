# 账号注册、邮箱验证与密码重置实现计划

> **面向 AI 代理的工作者：** 使用 executing-plans 在当前工作区逐任务实现。步骤使用复选框（`- [ ]`）跟踪进度。用户明确要求整个功能开发期间不得执行任何 Git 命令。

**目标：** 在现有 JWT 登录基础上增加访客注册、强制邮箱验证、SMTP 邮件投递、忘记密码和一次性密码重置流程。

**架构：** NestJS 新增持久化的一次性 Token 服务与独立 SMTP MailModule，AuthService 编排用户、Token、事务和邮件。Vue auth feature 增加五个 API 调用和四个公开页面，所有安全状态由服务端决定。

**技术栈：** NestJS 11、TypeORM/PostgreSQL、Nodemailer、bcrypt、Node crypto、Jest；Vue 3、Pinia、Vue Router、VeeValidate/Zod、Axios、Vitest。

**规格：** `docs/superpowers/specs/2026-09-21-account-registration-password-reset-design.md`

## 全局约束

- 不执行任何 Git 命令，包括只读命令。
- 应用不创建系统管理员，新注册用户权限为空。
- 新用户验证邮箱前不能登录。
- 密码最少 8 个字符，只保存 bcrypt 哈希。
- 验证与重置 Token 使用 32 字节随机值，数据库只保存 SHA-256 哈希。
- 忘记密码和重发验证不得披露邮箱是否存在或账号状态。
- 生产环境 SMTP 配置与 `APP_FRONTEND_URL` 必填。
- 每个生产行为先运行会因该行为缺失而失败的测试，再写最少实现。

---

### 任务 1：SMTP 与账号生命周期配置

**文件：**
- 修改：`apps/nest/package.json`
- 修改：`pnpm-lock.yaml`
- 修改：`apps/nest/src/config/configuration.ts`
- 修改：`apps/nest/src/config/env.validation.ts`
- 修改：`apps/nest/src/config/env.validation.spec.ts`
- 修改：`apps/nest/.env.example`

- [ ] **步骤 1：编写配置红灯测试**

验证生产环境缺少任一 SMTP 必填项或 `APP_FRONTEND_URL` 时抛出指向字段名的错误；开发环境缺省值可通过；Token 有效期必须是正整数分钟。

- [ ] **步骤 2：运行并确认正确失败**

运行：`pnpm --filter @pms/nest test -- env.validation.spec.ts --runInBand`

预期：FAIL，因为 SMTP 和有效期字段尚未被校验。

- [ ] **步骤 3：安装并配置 Nodemailer**

运行：

```bash
pnpm --filter @pms/nest add nodemailer
pnpm --filter @pms/nest add -D @types/nodemailer
```

新增 `mail.*`、`app.frontendUrl`、`auth.emailVerificationExpiresInMinutes` 和 `auth.passwordResetExpiresInMinutes` 配置。开发默认 SMTP 为 `localhost:1025`、`secure=false`；生产要求显式配置所有 SMTP 凭据和 HTTPS 前端地址。

- [ ] **步骤 4：验证**

运行：

```bash
pnpm --filter @pms/nest test -- env.validation.spec.ts --runInBand
pnpm --filter @pms/nest typecheck
```

预期：全部通过。

### 任务 2：邮件服务

**文件：**
- 创建：`apps/nest/src/mail/mail.constants.ts`
- 创建：`apps/nest/src/mail/mail.service.ts`
- 创建：`apps/nest/src/mail/mail.service.spec.ts`
- 创建：`apps/nest/src/mail/mail.module.ts`
- 修改：`apps/nest/src/app.module.ts`

- [ ] **步骤 1：编写 MailService 红灯测试**

传入只替换 `sendMail` 的 transport fake，验证邮箱验证邮件和密码重置邮件分别生成正确收件人、From、主题、纯文本、HTML 和经过 URL 编码的 Token 链接。测试禁止断言 mock 是否被创建，只断言最终邮件负载。

- [ ] **步骤 2：运行并确认正确失败**

运行：`pnpm --filter @pms/nest test -- mail.service.spec.ts --runInBand`

预期：FAIL，因为 MailService 尚不存在。

- [ ] **步骤 3：实现 MailModule**

用 `MAIL_TRANSPORT` token 注入 Nodemailer transport。模块工厂读取 SMTP 配置并调用 `createTransport`；MailService 提供 `sendEmailVerification(email, token)` 与 `sendPasswordReset(email, token)`，链接只使用配置的 `APP_FRONTEND_URL`。

- [ ] **步骤 4：验证**

运行：`pnpm --filter @pms/nest test -- mail.service.spec.ts --runInBand`

预期：全部通过。

### 任务 3：用户状态与注册写入边界

**文件：**
- 修改：`apps/nest/src/users/entities/user.entity.ts`
- 修改：`apps/nest/src/users/users.service.ts`
- 修改：`apps/nest/src/users/users.service.spec.ts`

- [ ] **步骤 1：编写用户注册红灯测试**

验证 `createPendingUser()` 规范化邮箱、写入 `pending_verification`、空权限与 bcrypt 哈希；验证 `activate()` 只改变目标用户状态；验证 `updatePassword()` 写入新哈希。测试对 repository fake 的输入做字面量断言。

- [ ] **步骤 2：运行并确认正确失败**

运行：`pnpm --filter @pms/nest test -- users.service.spec.ts --runInBand`

预期：FAIL，因为新状态和方法不存在。

- [ ] **步骤 3：实现最少用户方法**

增加 `UserStatus.PendingVerification`。实现 `createPendingUser`、`activate`、`updatePassword`，并增加可接收 `EntityManager` repository 的内部边界，以便事务内复用。

- [ ] **步骤 4：验证**

运行：`pnpm --filter @pms/nest test -- users.service.spec.ts --runInBand`

预期：全部通过。

### 任务 4：一次性 Auth Token 存储

**文件：**
- 创建：`apps/nest/src/auth-tokens/entities/auth-token.entity.ts`
- 创建：`apps/nest/src/auth-tokens/auth-tokens.service.ts`
- 创建：`apps/nest/src/auth-tokens/auth-tokens.service.spec.ts`
- 创建：`apps/nest/src/auth-tokens/auth-tokens.module.ts`

- [ ] **步骤 1：编写 Token 服务红灯测试**

验证生成的明文 Token 可 base64url 解码为 32 字节、保存值为 64 位 SHA-256 十六进制且不等于明文；创建新同类 Token 会消费旧 Token；查找拒绝过期/已消费/用途错误；消费全部同类 Token 会设置 `consumedAt`。

- [ ] **步骤 2：运行并确认正确失败**

运行：`pnpm --filter @pms/nest test -- auth-tokens.service.spec.ts --runInBand`

预期：FAIL，因为模块尚不存在。

- [ ] **步骤 3：实现 Token 实体与服务**

使用 `randomBytes(32).toString('base64url')` 和 `createHash('sha256')`。服务方法接收可选 `EntityManager`，验证/消费路径用 pessimistic write lock 查询记录及用户关系。

- [ ] **步骤 4：验证**

运行：`pnpm --filter @pms/nest test -- auth-tokens.service.spec.ts --runInBand`

预期：全部通过。

### 任务 5：注册与邮箱验证业务

**文件：**
- 创建：`apps/nest/src/auth/dto/register.dto.ts`
- 创建：`apps/nest/src/auth/dto/email.dto.ts`
- 创建：`apps/nest/src/auth/dto/token.dto.ts`
- 修改：`apps/nest/src/auth/auth.service.ts`
- 修改：`apps/nest/src/auth/auth.service.spec.ts`
- 修改：`apps/nest/src/auth/auth.controller.ts`
- 修改：`apps/nest/src/auth/auth.controller.spec.ts`
- 修改：`apps/nest/src/auth/auth.module.ts`

- [ ] **步骤 1：编写注册红灯测试**

验证注册产生 pending 用户、bcrypt 哈希、空权限、验证 Token 和邮件；重复邮箱返回 409；SMTP 失败向外返回 503 且事务回滚回调抛错。验证登录仍对 pending 用户返回统一 401。

- [ ] **步骤 2：运行并确认正确失败**

运行：`pnpm --filter @pms/nest test -- auth.service.spec.ts --runInBand`

预期：FAIL，因为注册行为不存在。

- [ ] **步骤 3：实现注册编排**

注入 `DataSource`、`AuthTokensService` 和 `MailService`。在 `dataSource.transaction()` 内创建用户与 Token并发送邮件，映射重复邮箱和 SMTP 错误。DTO 用自定义字段匹配约束验证两次密码一致。

- [ ] **步骤 4：编写验证与重发红灯测试**

验证有效 Token 激活用户并消费验证 Token；无效/过期/重复 Token 返回统一 400；重发仅对 pending 用户发送，但所有非发送分支对外响应相同。

- [ ] **步骤 5：实现验证与重发**

在事务内锁定并消费 Token；Controller 新增公开的 `register`、`verify-email`、`resend-verification` 端点，注册返回 201，重发返回 202。

- [ ] **步骤 6：验证**

运行：

```bash
pnpm --filter @pms/nest test -- auth.service.spec.ts auth.controller.spec.ts --runInBand
pnpm --filter @pms/nest typecheck
```

预期：全部通过。

### 任务 6：忘记与重置密码业务

**文件：**
- 创建：`apps/nest/src/auth/dto/reset-password.dto.ts`
- 修改：`apps/nest/src/auth/auth.service.ts`
- 修改：`apps/nest/src/auth/auth.service.spec.ts`
- 修改：`apps/nest/src/auth/auth.controller.ts`
- 修改：`apps/nest/src/auth/auth.controller.spec.ts`

- [ ] **步骤 1：编写忘记密码红灯测试**

验证 active 用户创建 Token 并发邮件；未知、pending 和 disabled 用户不创建 Token但返回相同结果；邮件失败返回不披露邮箱状态的 503。

- [ ] **步骤 2：运行并确认正确失败**

运行：`pnpm --filter @pms/nest test -- auth.service.spec.ts --runInBand`

预期：FAIL，因为忘记密码行为不存在。

- [ ] **步骤 3：实现忘记密码**

实现统一响应常量和 active 用户分支，新增公开 `POST /auth/forgot-password`，Controller 使用 HTTP 202。

- [ ] **步骤 4：编写重置密码红灯测试**

验证有效 Token 更新为可通过 bcrypt 比较的新哈希并消费全部 reset Token；无效、过期、已消费 Token 返回统一 400；disabled 或 pending 用户不能重置。

- [ ] **步骤 5：实现重置密码**

在事务内锁定 Token、哈希新密码、更新用户并消费 Token。新增公开 `POST /auth/reset-password`。

- [ ] **步骤 6：验证**

运行：`pnpm --filter @pms/nest test -- auth.service.spec.ts auth.controller.spec.ts --runInBand`

预期：全部通过。

### 任务 7：后端 E2E 账号生命周期

**文件：**
- 修改：`apps/nest/test/app.e2e-spec.ts`

- [ ] **步骤 1：编写 E2E 红灯场景**

在测试模块中替换 SMTP transport，保留真实 Controller、DTO、AuthService、Token 逻辑和响应包装。覆盖注册 DTO 400、注册 201、未验证登录 401、验证成功、验证后登录、忘记密码统一 202、重置成功及 Token 重用失败。

- [ ] **步骤 2：运行并确认失败/修正装配**

运行：`pnpm --filter @pms/nest test:e2e -- --runInBand`

预期：新增场景最初因模块装配或缺失测试存储边界失败；补齐测试 provider 后全部通过。

- [ ] **步骤 3：验证后端全量**

运行：

```bash
pnpm --filter @pms/nest test -- --runInBand
pnpm --filter @pms/nest test:e2e -- --runInBand
pnpm --filter @pms/nest typecheck
pnpm --filter @pms/nest lint
```

预期：全部通过。

### 任务 8：Vue Auth API

**文件：**
- 修改：`apps/vue3/src/features/auth/api/auth.api.ts`
- 修改：`apps/vue3/src/features/auth/api/__tests__/auth.api.spec.ts`
- 修改：`apps/vue3/src/features/auth/index.ts`

- [ ] **步骤 1：编写五个 API 红灯测试**

分别断言 `register`、`verifyEmail`、`resendVerification`、`forgotPassword`、`resetPassword` 的 HTTP method、路径和完整请求体。

- [ ] **步骤 2：运行并确认正确失败**

运行：`pnpm --filter @pms/vue3 test -- src/features/auth/api/__tests__/auth.api.spec.ts`

预期：FAIL，因为 API 函数不存在。

- [ ] **步骤 3：实现 API 与类型**

所有 API 复用现有 `http` 解包和 `AppError`，响应类型使用 `{ message: string }`。

- [ ] **步骤 4：验证**

运行：`pnpm --filter @pms/vue3 test -- src/features/auth/api/__tests__/auth.api.spec.ts`

预期：全部通过。

### 任务 9：注册与验证邮箱页面

**文件：**
- 创建：`apps/vue3/src/features/auth/views/RegisterView.vue`
- 创建：`apps/vue3/src/features/auth/views/VerifyEmailView.vue`
- 创建：`apps/vue3/src/features/auth/views/__tests__/RegisterView.spec.ts`
- 创建：`apps/vue3/src/features/auth/views/__tests__/VerifyEmailView.spec.ts`
- 修改：`apps/vue3/src/router/routes.ts`
- 修改：`apps/vue3/src/features/auth/views/LoginView.vue`
- 修改：`apps/vue3/src/features/auth/views/__tests__/LoginView.spec.ts`

- [ ] **步骤 1：编写注册页面红灯测试**

验证姓名/邮箱/密码/确认密码提交，密码不一致时不请求 API，成功后显示查收邮件状态，409 显示占用错误，页面有登录入口。

- [ ] **步骤 2：实现注册页面**

使用现有表单组件、Zod refine 和 Alert，成功后不自动登录。

- [ ] **步骤 3：编写验证页面红灯测试**

验证有 Token 时进入页面自动调用一次 API并显示成功入口；缺失 Token 或 API 400 显示无效/过期状态。

- [ ] **步骤 4：实现验证页面与路由入口**

新增两个公开 blank-layout 路由；登录页添加 `/register` 链接。

- [ ] **步骤 5：验证**

运行：`pnpm --filter @pms/vue3 test -- src/features/auth/views/__tests__/RegisterView.spec.ts src/features/auth/views/__tests__/VerifyEmailView.spec.ts src/features/auth/views/__tests__/LoginView.spec.ts`

预期：全部通过。

### 任务 10：忘记与重置密码页面

**文件：**
- 创建：`apps/vue3/src/features/auth/views/ForgotPasswordView.vue`
- 创建：`apps/vue3/src/features/auth/views/ResetPasswordView.vue`
- 创建：`apps/vue3/src/features/auth/views/__tests__/ForgotPasswordView.spec.ts`
- 创建：`apps/vue3/src/features/auth/views/__tests__/ResetPasswordView.spec.ts`
- 修改：`apps/vue3/src/router/routes.ts`
- 修改：`apps/vue3/src/features/auth/views/LoginView.vue`
- 修改：`apps/vue3/src/features/auth/views/__tests__/LoginView.spec.ts`

- [ ] **步骤 1：编写忘记密码页面红灯测试**

验证提交邮箱、所有成功响应显示统一提示、按钮防重复提交、登录页有忘记密码入口。

- [ ] **步骤 2：实现忘记密码页面**

成功后不显示邮箱存在性，提供返回登录入口。

- [ ] **步骤 3：编写重置密码页面红灯测试**

验证缺失 Token、密码不足 8 位、确认密码不一致、有效提交、API Token 失效错误和成功登录入口。

- [ ] **步骤 4：实现重置密码页面与路由**

从 query 读取 Token但不写日志或持久化；成功后清空密码字段并显示登录入口。

- [ ] **步骤 5：验证**

运行：`pnpm --filter @pms/vue3 test -- src/features/auth/views/__tests__/ForgotPasswordView.spec.ts src/features/auth/views/__tests__/ResetPasswordView.spec.ts src/features/auth/views/__tests__/LoginView.spec.ts`

预期：全部通过。

### 任务 11：文档与最终质量门禁

**文件：**
- 修改：`README.md`
- 修改：`apps/nest/README.md`
- 修改：`apps/vue3/README.md`

- [ ] **步骤 1：补充 SMTP 和账号流程说明**

记录 SMTP 环境变量、Mailpit/MailHog 本地示例、生产 TLS 要求、注册/验证/重置路由，以及应用不会自动创建用户或管理员。

- [ ] **步骤 2：格式化本次文件**

仅对本功能创建或修改的 Nest/Vue 文件运行项目 Prettier，避免触碰无关文件。

- [ ] **步骤 3：运行完整质量门禁**

依次运行，任何非零退出码立即停止：

```bash
pnpm test
pnpm --filter @pms/nest test:e2e -- --runInBand
pnpm typecheck
pnpm lint
pnpm build
```

预期：所有测试、E2E、类型检查、Lint 和构建通过。

- [ ] **步骤 4：安全检索**

使用 `rg` 确认生产源码不存在明文 Token 日志、默认系统管理员、`ADMIN_*` 配置或把 SMTP 密码写入响应的代码。

- [ ] **步骤 5：交付变更清单**

仅汇报修改/新增/删除的文件、验证命令结果、SMTP 配置方法和仍需部署方执行的数据库迁移事项；不执行 Git 状态、提交、分支、推送或 PR 操作。
