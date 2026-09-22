# 组与监控项目引导实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现登录用户创建多个组、在组下创建 Vue 监控项目、配置功能开关、生成 DSN，并通过公开校验端点确认本地连接。

**架构：** Nest 新增 Groups 与 MonitoringProjects 两个领域模块，数据库通过所有者和父级外键隔离资源；SDK 校验模块只接受公开项目 ID 与 public key，并更新连接时间。Vue 新增组/项目 API、引导守卫和组、项目、SDK 设置页面，沿用现有 UI 组件体系。

**技术栈：** NestJS 11、TypeORM/PostgreSQL、class-validator、Jest/Supertest、Vue 3、Pinia、Vue Router、Axios、VeeValidate/Zod、Vitest、Tailwind/Reka UI。

**规格：** `docs/superpowers/specs/2026-09-22-group-monitoring-project-onboarding-design.md`

## 全局约束

- 一个用户可创建多个组，一个组可创建多个监控项目。
- 当前只有组创建者本人可访问组和项目，不实现成员邀请和协作权限。
- 平台固定为 Vue。
- Error Monitoring 默认开启；Logging、Tracing、Application Metrics 默认关闭。
- 不展示、不存储 Session Replay。
- 本阶段不实现 SDK 包、Sentry 协议或监控事件采集。
- DSN 仅用于项目识别和连接校验，public key 不是管理凭证。
- UI 必须沿用当前项目组件、间距、配色和布局风格。
- 所有生产代码严格采用 TDD：先看到目标测试因缺少行为失败，再写最少实现。
- 按用户要求，不运行任何 Git 命令；计划中的完成点只运行测试和质量检查。

## 文件结构

### Nest 新增

- `src/common/utils/slug.ts`：名称转 slug 和非 ASCII 回退。
- `src/common/utils/slug.spec.ts`：slug 行为测试。
- `src/groups/entities/group.entity.ts`：组实体与用户关系。
- `src/groups/dto/create-group.dto.ts`：创建组验证。
- `src/groups/groups.service.ts`：组创建、列表、所有权查询。
- `src/groups/groups.controller.ts`：组 HTTP 接口。
- `src/groups/groups.module.ts`：组模块装配。
- `src/groups/groups.service.spec.ts`、`groups.controller.spec.ts`：组领域测试。
- `src/monitoring-projects/entities/monitoring-project.entity.ts`：监控项目实体与功能开关。
- `src/monitoring-projects/dto/create-monitoring-project.dto.ts`：创建项目验证。
- `src/monitoring-projects/monitoring-projects.service.ts`：项目创建、列表、详情、DSN 和连接状态。
- `src/monitoring-projects/monitoring-projects.controller.ts`：项目管理接口。
- `src/monitoring-projects/sdk-check.controller.ts`：公开 DSN 连接校验接口。
- `src/monitoring-projects/monitoring-projects.module.ts`：项目模块装配。
- `src/monitoring-projects/*.spec.ts`：项目与连接校验测试。

### Nest 修改

- `src/users/entities/user.entity.ts`：补充 groups 关系。
- `src/app.module.ts`：装配 GroupsModule 和 MonitoringProjectsModule。
- `src/config/configuration.ts`、`env.validation.ts` 及测试：增加 `MONITORING_PUBLIC_URL`。
- `.env.example`、`README.md`：记录监控公开地址和接口。
- `test/app.e2e-spec.ts`：增加完整所有权和连接校验流程。

### Vue 新增

- `src/components/ui/switch/*`：与现有组件风格一致的 Switch 封装。
- `src/features/monitoring/api/monitoring.api.ts`：组、项目和连接 API。
- `src/features/monitoring/model/types.ts`：前端领域类型。
- `src/features/monitoring/model/onboarding.store.ts`：组状态加载和引导状态。
- `src/features/monitoring/utils/sdk-setup.ts`：DSN 环境变量与校验代码生成。
- `src/features/monitoring/views/CreateGroupView.vue`：创建组。
- `src/features/monitoring/views/GroupsView.vue`：组列表。
- `src/features/monitoring/views/GroupDetailView.vue`：组详情和项目列表。
- `src/features/monitoring/views/CreateProjectView.vue`：创建 Vue 项目和功能开关。
- `src/features/monitoring/views/ProjectSetupView.vue`：SDK 指引和连接状态。
- `src/features/monitoring/views/ProjectDetailView.vue`：项目基础详情。
- `src/features/monitoring/**/__tests__/*`：API、store、工具和页面测试。

### Vue 修改

- `src/router/routes.ts`：加入引导、组和项目路由。
- `src/router/guards/authorization.ts` 及测试：加入无组引导守卫。
- `src/components/layout/AppLayout.vue`：加入组导航。
- `src/features/dashboard/views/DashboardView.vue`：展示组/项目摘要。
- `src/main.ts`：仅在 store/守卫装配需要时调整。
- `README.md`：记录新增页面和本地 DSN 校验流程。

---

### 任务 1：配置与 slug 基础能力

**文件：**
- 创建：`apps/nest/src/common/utils/slug.ts`
- 测试：`apps/nest/src/common/utils/slug.spec.ts`
- 修改：`apps/nest/src/config/configuration.ts`
- 修改：`apps/nest/src/config/configuration.spec.ts`
- 修改：`apps/nest/src/config/env.validation.ts`
- 修改：`apps/nest/src/config/env.validation.spec.ts`
- 修改：`apps/nest/.env.example`

- [x] **步骤 1：编写 slug 和监控公开地址的失败测试**

```ts
expect(createSlug('My Vue App', 'project')).toBe('my-vue-app')
expect(createSlug('中文项目', 'project')).toMatch(/^project-[a-z0-9]{6}$/)
expect(configuration().monitoring.publicUrl).toBe('http://localhost:3001')
```

生产环境验证测试必须断言缺少 `MONITORING_PUBLIC_URL` 时抛错，非 HTTPS 地址时抛错。

- [x] **步骤 2：运行红灯测试**

运行：`pnpm --filter @pms/nest test -- slug.spec.ts configuration.spec.ts env.validation.spec.ts --runInBand`

预期：FAIL，原因分别为 `createSlug` 不存在、`monitoring.publicUrl` 不存在和生产环境未校验监控地址。

- [x] **步骤 3：实现最少代码**

`createSlug(name, fallbackPrefix)` 对 ASCII 名称规范化；结果为空时用 `randomBytes(3).toString('hex')` 生成六位后缀。配置读取 `MONITORING_PUBLIC_URL`，开发默认 `http://localhost:3001`；生产环境要求 HTTPS。

- [x] **步骤 4：运行绿灯测试**

运行：`pnpm --filter @pms/nest test -- slug.spec.ts configuration.spec.ts env.validation.spec.ts --runInBand`

预期：全部 PASS。

### 任务 2：组领域与所有权隔离

**文件：**
- 创建：`apps/nest/src/groups/entities/group.entity.ts`
- 创建：`apps/nest/src/groups/dto/create-group.dto.ts`
- 创建：`apps/nest/src/groups/groups.service.ts`
- 创建：`apps/nest/src/groups/groups.controller.ts`
- 创建：`apps/nest/src/groups/groups.module.ts`
- 测试：`apps/nest/src/groups/groups.service.spec.ts`
- 测试：`apps/nest/src/groups/groups.controller.spec.ts`
- 修改：`apps/nest/src/users/entities/user.entity.ts`
- 修改：`apps/nest/src/app.module.ts`

- [x] **步骤 1：编写组服务失败测试**

覆盖：创建时写入当前 `ownerId`；列表只按 owner 查询并返回 `projectCount`；`findOwnedBySlug` 同时使用 owner ID 与 slug；数据库唯一冲突码 `23505` 映射为 `ConflictException`。

```ts
await expect(service.create('user-1', { name: 'Acme Team' })).resolves.toMatchObject({
  name: 'Acme Team',
  slug: 'acme-team',
  ownerId: 'user-1',
})
```

- [x] **步骤 2：运行组服务红灯测试**

运行：`pnpm --filter @pms/nest test -- groups.service.spec.ts --runInBand`

预期：FAIL，GroupsService 和 Group 实体尚不存在。

- [x] **步骤 3：实现实体和服务**

实体建立 `(owner_id, slug)` 唯一索引和 `ManyToOne(User, onDelete: 'CASCADE')`。服务只暴露 `create(ownerId, dto)`、`listOwned(ownerId)`、`findOwnedBySlug(ownerId, slug)`。

- [x] **步骤 4：运行组服务绿灯测试**

运行：`pnpm --filter @pms/nest test -- groups.service.spec.ts --runInBand`

预期：PASS。

- [x] **步骤 5：编写并运行 Controller 红灯测试**

断言 `POST /groups` 与 `GET /groups` 将 `request.user.id` 传给服务，`GET /groups/:slug` 不接受客户端 owner ID。

运行：`pnpm --filter @pms/nest test -- groups.controller.spec.ts --runInBand`

预期：FAIL，Controller 尚不存在。

- [x] **步骤 6：实现 Controller、Module 并装配 AppModule**

复用 AuthController 的 `AuthenticatedRequest` 模式，所有组接口保留全局 JWT 保护，不添加 `@Public()`。

- [x] **步骤 7：运行组模块全部测试**

运行：`pnpm --filter @pms/nest test -- groups --runInBand`

预期：PASS。

### 任务 3：监控项目、功能开关和 DSN

**文件：**
- 创建：`apps/nest/src/monitoring-projects/entities/monitoring-project.entity.ts`
- 创建：`apps/nest/src/monitoring-projects/dto/create-monitoring-project.dto.ts`
- 创建：`apps/nest/src/monitoring-projects/monitoring-projects.service.ts`
- 创建：`apps/nest/src/monitoring-projects/monitoring-projects.controller.ts`
- 创建：`apps/nest/src/monitoring-projects/monitoring-projects.module.ts`
- 测试：`apps/nest/src/monitoring-projects/monitoring-projects.service.spec.ts`
- 测试：`apps/nest/src/monitoring-projects/monitoring-projects.controller.spec.ts`
- 修改：`apps/nest/src/groups/entities/group.entity.ts`
- 修改：`apps/nest/src/app.module.ts`

- [x] **步骤 1：编写项目服务失败测试**

覆盖固定平台 `vue`、默认开关、显式开关、随机 public key、HTTP/HTTPS DSN、组所有权检查、同组 slug 冲突、列表与详情。

```ts
expect(created).toMatchObject({
  platform: 'vue',
  errorMonitoringEnabled: true,
  loggingEnabled: false,
  tracingEnabled: false,
  metricsEnabled: false,
})
expect(created.dsn).toMatch(/^http:\/\/[a-f0-9]+@localhost:3001\/api\/sdk\//)
```

- [x] **步骤 2：运行项目服务红灯测试**

运行：`pnpm --filter @pms/nest test -- monitoring-projects.service.spec.ts --runInBand`

预期：FAIL，项目领域尚不存在。

- [x] **步骤 3：实现实体、DTO 和服务**

DTO 使用 `@IsIn(['vue'])` 和四个 `@IsBoolean()` 可选字段。服务先调用 `groups.findOwnedBySlug(userId, groupSlug)`；实体建立 `(group_id, slug)` 唯一索引，`public_key` 全局唯一，`last_seen_at` 可空。

- [x] **步骤 4：运行项目服务绿灯测试**

运行：`pnpm --filter @pms/nest test -- monitoring-projects.service.spec.ts --runInBand`

预期：PASS。

- [x] **步骤 5：编写并实现 Controller 测试循环**

覆盖创建、列表、详情和 connection 路由，所有调用必须传递 `request.user.id` 与路径中的 group/project slug。

运行：`pnpm --filter @pms/nest test -- monitoring-projects.controller.spec.ts --runInBand`

预期：先 FAIL，完成 Controller 和 Module 后 PASS。

### 任务 4：公开 SDK 连接校验

**文件：**
- 创建：`apps/nest/src/monitoring-projects/dto/check-sdk.dto.ts`
- 创建：`apps/nest/src/monitoring-projects/sdk-check.controller.ts`
- 测试：`apps/nest/src/monitoring-projects/sdk-check.controller.spec.ts`
- 修改：`apps/nest/src/monitoring-projects/monitoring-projects.service.ts`
- 修改：`apps/nest/src/monitoring-projects/monitoring-projects.service.spec.ts`
- 修改：`apps/nest/src/monitoring-projects/monitoring-projects.module.ts`

- [x] **步骤 1：编写连接校验失败测试**

覆盖正确 projectId/publicKey 更新时间；错误项目或 key 抛 `NotFoundException`；Controller 带 `@Public()` 且返回 `{ projectId, platform: 'vue', checkedAt }`。

```ts
const result = await service.checkConnection('project-1', 'public-key')
expect(result.platform).toBe('vue')
expect(repository.update).toHaveBeenCalledWith('project-1', {
  lastSeenAt: expect.any(Date),
})
```

- [x] **步骤 2：运行红灯测试**

运行：`pnpm --filter @pms/nest test -- monitoring-projects.service.spec.ts sdk-check.controller.spec.ts --runInBand`

预期：FAIL，连接校验方法与 Controller 不存在。

- [x] **步骤 3：实现 DTO、服务和公开 Controller**

DTO 校验 UUID projectId 和非空 publicKey。查询必须同时匹配 `id` 与 `publicKey`；响应不包含组和用户信息。

- [x] **步骤 4：运行绿灯测试**

运行：`pnpm --filter @pms/nest test -- monitoring-projects.service.spec.ts sdk-check.controller.spec.ts --runInBand`

预期：PASS。

### 任务 5：Vue API、类型、Switch 与 SDK 指引工具

**文件：**
- 创建：`apps/vue3/src/components/ui/switch/Switch.vue`
- 创建：`apps/vue3/src/components/ui/switch/index.ts`
- 创建：`apps/vue3/src/features/monitoring/model/types.ts`
- 创建：`apps/vue3/src/features/monitoring/api/monitoring.api.ts`
- 创建：`apps/vue3/src/features/monitoring/api/__tests__/monitoring.api.spec.ts`
- 创建：`apps/vue3/src/features/monitoring/utils/sdk-setup.ts`
- 创建：`apps/vue3/src/features/monitoring/utils/__tests__/sdk-setup.spec.ts`
- 创建：`apps/vue3/src/features/monitoring/index.ts`

- [x] **步骤 1：编写 API 与 SDK 工具红灯测试**

API 测试覆盖全部七个受保护接口。工具测试使用字面量 DSN，断言 `.env` 输出和校验代码包含正确 origin、projectId、publicKey，且不包含 Replay 或 Sentry。

```ts
expect(buildEnvSnippet(dsn)).toBe(`VITE_PMS_DSN=${dsn}`)
expect(buildCheckSnippet(dsn)).toContain("fetch('http://localhost:3001/api/sdk/check'")
```

- [x] **步骤 2：运行红灯测试**

运行：`pnpm --filter @pms/vue3 test -- monitoring.api.spec.ts sdk-setup.spec.ts`

预期：FAIL，模块不存在。

- [x] **步骤 3：实现类型、API、DSN 解析与代码生成**

`MonitoringProject` 明确定义四个布尔字段、dsn、connected、lastSeenAt。使用 `new URL(dsn)` 读取 `username` 和最后一个 pathname segment，校验协议只允许 HTTP(S)。

- [x] **步骤 4：实现 Switch 封装**

使用 Reka UI 的 Switch primitive，暴露 `v-model`，样式沿用当前 input/button 的圆角、focus ring 和 disabled 状态。

- [x] **步骤 5：运行绿灯测试和类型检查**

运行：`pnpm --filter @pms/vue3 test -- monitoring.api.spec.ts sdk-setup.spec.ts`

运行：`pnpm --filter @pms/vue3 typecheck`

预期：全部通过。

### 任务 6：无组引导与组页面

**文件：**
- 创建：`apps/vue3/src/features/monitoring/model/onboarding.store.ts`
- 创建：`apps/vue3/src/features/monitoring/model/__tests__/onboarding.store.spec.ts`
- 创建：`apps/vue3/src/features/monitoring/views/CreateGroupView.vue`
- 创建：`apps/vue3/src/features/monitoring/views/GroupsView.vue`
- 创建：`apps/vue3/src/features/monitoring/views/GroupDetailView.vue`
- 创建：`apps/vue3/src/features/monitoring/views/__tests__/GroupViews.spec.ts`
- 修改：`apps/vue3/src/router/routes.ts`
- 修改：`apps/vue3/src/router/guards/authorization.ts`
- 修改：`apps/vue3/src/router/guards/__tests__/authorization.spec.ts`
- 修改：`apps/vue3/src/components/layout/AppLayout.vue`

- [x] **步骤 1：编写 store 与守卫红灯测试**

覆盖加载成功的空组、已有组、加载失败三种独立状态。守卫仅在 `loaded && groups.length === 0` 时跳转引导；引导路由自身不得再次跳转。

- [x] **步骤 2：运行红灯测试**

运行：`pnpm --filter @pms/vue3 test -- onboarding.store.spec.ts authorization.spec.ts`

预期：FAIL，无 onboarding store 和引导逻辑。

- [x] **步骤 3：实现 store、路由和守卫**

新增命名路由 `create-group-onboarding`、`groups`、`group-detail`。组创建成功后 store 追加组并跳到 `create-project`。

- [x] **步骤 4：运行 store 与守卫绿灯测试**

运行：`pnpm --filter @pms/vue3 test -- onboarding.store.spec.ts authorization.spec.ts`

预期：PASS。

- [x] **步骤 5：编写组页面红灯测试**

覆盖创建表单保留输入、成功导航、列表空态、组详情项目列表与创建按钮、请求失败重试。

- [x] **步骤 6：实现三个组页面与导航入口**

复用 Card、AppFormField、Input、Button、Alert、Skeleton。创建页只有 name 字段；组列表和详情不增加编辑/删除动作。

- [x] **步骤 7：运行组页面绿灯测试**

运行：`pnpm --filter @pms/vue3 test -- GroupViews.spec.ts`

预期：PASS。

### 任务 7：项目创建、详情与 SDK 设置页

**文件：**
- 创建：`apps/vue3/src/features/monitoring/views/CreateProjectView.vue`
- 创建：`apps/vue3/src/features/monitoring/views/ProjectSetupView.vue`
- 创建：`apps/vue3/src/features/monitoring/views/ProjectDetailView.vue`
- 创建：`apps/vue3/src/features/monitoring/views/__tests__/ProjectViews.spec.ts`
- 修改：`apps/vue3/src/router/routes.ts`

- [x] **步骤 1：编写项目页面红灯测试**

断言平台仅显示 Vue；默认只有 Error Switch 开启；四个布尔值准确提交；页面不存在 Replay 文案；成功进入 setup；setup 展示/复制 DSN、env 和 fetch；状态可刷新为已连接。

```ts
expect(wrapper.get('[data-testid="error-switch"]').attributes('data-state')).toBe('checked')
expect(wrapper.text()).not.toContain('Replay')
```

- [x] **步骤 2：运行红灯测试**

运行：`pnpm --filter @pms/vue3 test -- ProjectViews.spec.ts`

预期：FAIL，页面尚不存在。

- [x] **步骤 3：实现项目创建页**

表单提交固定 `platform: 'vue'` 和四个 Switch 值。禁用提交时防止重复请求，服务端错误显示在表单上方且不清空输入。

- [x] **步骤 4：实现 SDK 设置与项目详情页**

复制动作使用 `navigator.clipboard.writeText`；连接状态初始来自项目详情，刷新调用 connection API；日期使用 `Intl.DateTimeFormat('zh-CN')`。

- [x] **步骤 5：补充路由并运行绿灯测试**

命名路由：`create-project`、`project-setup`、`project-detail`。

运行：`pnpm --filter @pms/vue3 test -- ProjectViews.spec.ts`

预期：PASS。

### 任务 8：工作台摘要、E2E、文档与完整验证

**文件：**
- 修改：`apps/vue3/src/features/dashboard/views/DashboardView.vue`
- 创建或修改：`apps/vue3/src/features/dashboard/views/__tests__/DashboardView.spec.ts`
- 修改：`apps/nest/test/app.e2e-spec.ts`
- 修改：`apps/nest/README.md`
- 修改：`apps/vue3/README.md`

- [x] **步骤 1：编写工作台摘要红灯测试**

用两组、三个项目 fixture，断言组数量为 2、项目数量为 3，并展示按创建时间排序的最近项目。

- [x] **步骤 2：实现工作台摘要并运行绿灯测试**

运行：`pnpm --filter @pms/vue3 test -- DashboardView.spec.ts`

预期：PASS。

- [x] **步骤 3：编写 Nest E2E 红灯流程**

在现有 `TestingModule` 中覆盖 GroupsService 和 MonitoringProjectsService，使用一个按 owner ID 隔离的内存 Map fake 保存完整组、项目与 `lastSeenAt` 状态。通过两个签发给不同用户的 JWT 发起真实 HTTP 请求，覆盖：用户 A 创建组和项目、调用公开 check、查询 connected；用户 B 访问用户 A 资源得到 404。断言 HTTP 响应以及后续 GET 读到的状态，不断言 fake 的调用次数。TypeORM 持久化与唯一约束由任务 2-4 的 service 测试和步骤 7 的本地 PostgreSQL 冒烟测试覆盖。

- [x] **步骤 4：运行 E2E 红灯并补齐集成缺口**

运行：`pnpm --filter @pms/nest test:e2e`

预期：首次因未装配的实体关系、路由或响应形状失败；仅修复对应集成缺口，直到 PASS。

- [x] **步骤 5：更新文档**

Nest README 记录 `MONITORING_PUBLIC_URL`、组/项目接口和公开 check 接口；Vue README 记录引导路由、项目创建默认值和本地 fetch 校验步骤。明确当前不采集事件。

- [x] **步骤 6：运行完整质量门禁**

运行：

```powershell
pnpm test
pnpm --filter @pms/nest test:e2e
pnpm typecheck
pnpm lint
pnpm build
```

预期：所有命令退出码为 0；Nest/Vue 测试无失败；lint 无错误；两端生产构建成功。

- [x] **步骤 7：进行真实本地连接冒烟测试**

启动 Nest 与 Vue，使用新注册并验证邮箱的用户完成创建组、创建项目；复制 SDK 页生成的 fetch 代码在本地 Vue 项目执行；刷新页面后显示“已连接”及最近时间。确认数据库只更新 `last_seen_at`，没有保存事件正文。
