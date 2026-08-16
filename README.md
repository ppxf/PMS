# PMS Monorepo

基于 pnpm workspace 和 Turborepo 的 monorepo 项目框架。

```text
.
├─ apps/
│  ├─ nest/    # NestJS HTTP API
│  └─ vue3/    # Vue 3 CMS 应用
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

`apps/nest` 与 `apps/vue3` 使用 `@pms/config` 中相同的 ESLint、TypeScript 与 Prettier 公共入口。
