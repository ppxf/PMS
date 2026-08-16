# PMS Monorepo

基于 pnpm workspace 和 Turborepo 的 monorepo 项目框架。

```text
.
├─ apps/
│  ├─ vue3/    # Vue 3 应用（暂为空）
│  └─ nest/    # NestJS 应用（暂为空）
├─ packages/   # 共享包预留目录
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

`apps/vue3` 和 `apps/nest` 当前仅创建空目录，后续可分别初始化应用。
