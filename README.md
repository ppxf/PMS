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

SDK 与主应用共用根目录 workspace 和锁文件，根目录构建、测试也覆盖 SDK。
SDK 开发请执行 `pnpm sdk:install`、`pnpm sdk:build`、`pnpm sdk:test`；完整命令及迁移说明见 [SDK 工作区](packages/README.md)。

根目录数据库迁移入口（不会随 `dev` 自动执行）：

| 环境 | 查看状态 | 执行待运行迁移 | 回滚最后一份迁移 |
| --- | --- | --- | --- |
| 开发容器，数据库已启动 | `pnpm migration:show` | `pnpm migration:run` | `pnpm migration:revert` |
| 生产容器 | `pnpm production:migration:show` | `pnpm production:migration:run` | `pnpm production:migration:revert` |

生产命令使用 `.env.production` 和已构建的 API 镜像；数据库须先启动，迁移成功后再启动应用。开发和生产默认关闭自动同步。开发迁移使用一次性 API 容器，不需要 API 服务预先启动；先构建镜像，再启动数据库，执行迁移，最后启动应用。已经自动建表的旧数据库不能直接套用空库基线；应核对结构后接管，或选择新的空数据库，保留旧库。`revert` 会执行迁移的 down，可能删除表和数据，不能当作无损撤销。

开发首次使用空库：`docker compose -f compose.dev.yaml build api web` → `docker compose -f compose.dev.yaml up -d db redis` → `pnpm migration:run` → `docker compose -f compose.dev.yaml up -d api web`。

从自动同步切换且保留旧数据时，可以新建独立数据库：先启动 db，再执行 `docker compose -f compose.dev.yaml exec db createdb -U pms pms_migration_dev`；PowerShell 设置 `$env:DB_NAME='pms_migration_dev'`（Git Bash 使用 `export DB_NAME=pms_migration_dev`），再执行迁移和启动应用。新库不会复制旧库数据；后续启动也必须使用相同 DB_NAME，建议写入根目录 `.env`。已有同名库时不要重复 createdb。不要通过删除数据卷解决基线冲突。

## 运行与登录

开发与生产统一通过 Docker Compose 运行，不再维护子应用环境文件或宿主机直接启动流程。启动使用根目录 `dev`、`production`，迁移使用对应环境的 `migration:show/run/revert 或 production:migration:show/run/revert`，开发数据清理使用 `retention:cleanup`（默认 dry-run，显式传入 `--execute` 才删除）。构建、类型检查及单元测试可独立执行。

首次启动按下方 Docker 流程完成数据库迁移，配置可用的 SMTP 后访问 `/register` 自助注册，通过邮箱验证后登录。数据库和 Redis 由 Compose 提供，开发与生产均保持 `DB_SYNCHRONIZE=false`。限流、管理请求幂等、邮件任务及数据清理规则见 [生产加固与运维](docs/production-hardening.md)。

## Docker

需要 Docker Engine / Docker Desktop（Linux containers）及 Docker Compose v2。在仓库根目录执行以下命令。两个环境使用独立的 Compose 项目和数据库卷，请分别使用对应的配置文件，不要叠加。

### 开发环境

根目录 `.env` 可从根目录 `.env.example` 复制，仅用于覆盖 `compose.dev.yaml` 中通过 `${...}` 引用的配置，如数据库名称与密码、SMTP、Redis、SDK 限流和数据保留设置。Compose 将环境变量注入容器，API、迁移 CLI 和 Vite 不读取子应用环境文件。生产使用独立的 `.env.production`。

```bash
docker compose -f compose.dev.yaml up --build -d
docker compose -f compose.dev.yaml logs -f api web
docker compose -f compose.dev.yaml down
```

- 前端：<http://localhost:5173>；API：<http://localhost:3000/api>；Swagger：<http://localhost:3000/api/docs>。
- PostgreSQL：`localhost:15432`，用户名 `pms`，数据库 `pms`，默认密码 `pms-development`，可通过 `DB_PASSWORD` 覆盖。
- Redis 7.4：`localhost:16379`，仅绑定本机；API 容器使用 `redis://redis:6379`。Redis 启用 AOF，内存上限 256 MB，采用 `noeviction`，容量耗尽时协调请求返回 503。
- 前后端源码挂载并启用轮询监听，支持 Windows Docker Desktop 热更新。依赖存放在镜像内，不挂载宿主机 `node_modules`；修改依赖、环境变量或未挂载的配置后重新执行 `up --build -d`。
- 开发环境关闭 `DB_SYNCHRONIZE`，通过迁移创建和更新数据库结构。
- 不包含邮件服务。注册验证、密码重置需要自行提供 SMTP。默认连接宿主机 `host.docker.internal:1025`；在根目录 `.env` 设置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASSWORD`、`SMTP_FROM`。尚未配置 SMTP 时，邮件相关操作会失败。
- 开发前端由 Compose 配置为请求 `http://localhost:3000/api`，适用于本机浏览器访问；生产使用同源 `/api`。

### 生产环境：GHCR

GitHub Actions 构建镜像并推送 GHCR，ECS 仅拉取运行。参见 [部署步骤](GHCR-DEPLOY.md)。
