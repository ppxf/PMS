# PMS 监控 SDK 外壳实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 建立不采集错误、不发送网络请求的 PMS core/Vue SDK，并验证 workspace 与 tarball 两种消费方式。

**架构：** 私有的 `@pms/monitoring-core` 负责 DSN、初始化状态、事件和 Transport 契约；`@pms/monitoring-vue` 负责 Vue 应用接入，并在发布构建时内联 core。PMS 管理端只展示接入指引，不依赖或初始化 SDK。

**技术栈：** TypeScript 5、Vue 3、Vite 8、Vitest 4、pnpm workspace、tsc。

**规格：** `docs/superpowers/specs/2026-09-22-monitoring-sdk-shell-design.md`

## 全局约束

- 不注册错误处理器或浏览器全局监听器。
- 不提供事件采集操作，不发送 HTTP 请求。
- SDK 包必须输出 ESM JavaScript 与 TypeScript 声明。
- 对外只发布 `@pms/monitoring-vue` 单包 tarball。

---

### 任务 1：Core SDK 契约和初始化

**文件：**
- 创建：`packages/monitoring-core/package.json`
- 创建：`packages/monitoring-core/tsconfig.json`
- 创建：`packages/monitoring-core/src/index.ts`
- 创建：`packages/monitoring-core/src/client.ts`
- 创建：`packages/monitoring-core/src/dsn.ts`
- 创建：`packages/monitoring-core/src/types.ts`
- 创建：`packages/monitoring-core/src/client.spec.ts`

- [x] 先写测试，断言 DSN 规范化、错误输入、幂等初始化、冲突初始化和 Noop Transport 无副作用。
- [x] 运行 `pnpm --filter @pms/monitoring-core test`，确认因实现缺失而失败。
- [x] 实现最小类型、DSN 解析、状态和默认 Noop Transport。
- [x] 运行包测试、类型检查与构建，确认通过。

### 任务 2：Vue SDK 适配层

**文件：**
- 创建：`packages/monitoring-vue/package.json`
- 创建：`packages/monitoring-vue/tsconfig.json`
- 创建：`packages/monitoring-vue/src/index.ts`
- 创建：`packages/monitoring-vue/src/vue-client.ts`
- 创建：`packages/monitoring-vue/src/vue-client.spec.ts`

- [x] 先写测试，断言 Vue 初始化返回 core 状态、关联 app，且不覆盖 `app.config.errorHandler`。
- [x] 运行 `pnpm --filter @pms/monitoring-vue test`，确认因实现缺失而失败。
- [x] 实现最小 Vue 适配层和公开入口。
- [x] 运行包测试、类型检查与构建，确认通过。

### 任务 3：管理端 SDK 接入指引

**文件：**
- 修改：`apps/vue3/package.json`
- 修改：`apps/vue3/env.d.ts`
- 修改：`apps/vue3/src/main.ts`
- 修改：`apps/vue3/src/features/monitoring/utils/sdk-setup.ts`
- 修改：`apps/vue3/src/features/monitoring/views/ProjectSetupView.vue`
- 修改：`pnpm-lock.yaml`

- [x] 先写测试，断言展示单包安装、DSN 环境变量和 SDK 初始化代码，且不展示原始 fetch。
- [x] 删除管理端自身的 SDK 初始化和 workspace 依赖。
- [x] 实现 SDK 形式的接入指引。
- [x] 运行 Vue 测试、类型检查和构建，确认通过。

### 任务 4：发布包构建验证

**文件：**
- 修改：`packages/monitoring-vue/package.json`

- [x] 构建并打包 `@pms/monitoring-vue` 单包 tarball。
- [x] 确认构建产物不包含任何采集或上报逻辑。

### 任务 5：完整质量门禁

- [x] 运行两个 SDK 包测试和 Vue 目标测试。
- [ ] 运行 `pnpm test`、`pnpm typecheck`、`pnpm lint` 和 `pnpm build`。（typecheck、lint、build 通过；全仓 test 存在既有 Nest CORS 默认值断言失败。）
- [x] 检查 diff，确认 Nest 与采集端点没有变化，且范围没有扩展到错误采集。
