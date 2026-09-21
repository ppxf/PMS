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

## 本地登录

1. 创建 PostgreSQL 数据库 `pms`。
2. 将 `apps/nest/.env.example` 复制为 `apps/nest/.env`，确认 `DB_ENABLED=true` 与数据库连接信息正确。
3. 开发环境可保留 `DB_SYNCHRONIZE=true`，首次启动会创建数据表。
4. 将 `apps/vue3/.env.example` 复制为 `apps/vue3/.env.local`。
5. 预先在 `users` 表中创建带 bcrypt 密码哈希的用户，然后运行 `pnpm dev` 登录。

生产部署必须替换 `JWT_SECRET`，并关闭 `DB_SYNCHRONIZE`。
