# PMS Monorepo

基于 pnpm workspace 和 Turborepo 的 monorepo 项目框架。

```text
.
├─ apps/
│  ├─ vue3/    # Vue 3 应用（暂为空）
│  └─ nest/    # NestJS HTTP API
├─ packages/
│  └─ config/  # ESLint、TypeScript、Prettier 公共配置
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

## 常用命令

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm typecheck
pnpm clean
```

`apps/vue3` 当前为空目录；`apps/nest` 已初始化为 NestJS HTTP API 项目。
