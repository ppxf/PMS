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

根目录数据库迁移入口（不会随 `docker:dev` 自动执行）：

| 环境 | 查看状态 | 执行待运行迁移 | 回滚最后一份迁移 |
| --- | --- | --- | --- |
| 本地，使用 API 环境变量 | `pnpm migration:show` | `pnpm migration:run` | `pnpm migration:revert` |
| 开发容器，数据库已启动 | `pnpm docker:dev:migration:show` | `pnpm docker:dev:migration:run` | `pnpm docker:dev:migration:revert` |
| 生产容器 | `pnpm docker:production:migration:show` | `pnpm docker:production:migration:run` | `pnpm docker:production:migration:revert` |

生产命令使用 `docker/.env.production` 和已构建的 API 镜像；数据库须先启动，迁移成功后再启动应用。开发和生产默认关闭自动同步。开发迁移使用一次性 API 容器，不需要 API 服务预先启动；先构建镜像，再启动数据库，执行迁移，最后启动应用。已经自动建表的旧数据库不能直接套用空库基线；应核对结构后接管，或选择新的空数据库，保留旧库。`revert` 会执行迁移的 down，可能删除表和数据，不能当作无损撤销。

开发首次使用空库：`docker compose -f compose.dev.yaml build api web` → `docker compose -f compose.dev.yaml up -d db` → `pnpm docker:dev:migration:run` → `docker compose -f compose.dev.yaml up -d api web`。

从自动同步切换且保留旧数据时，可以新建独立数据库：先启动 db，再执行 `docker compose -f compose.dev.yaml exec db createdb -U pms pms_migration_dev`；PowerShell 设置 `$env:DB_NAME='pms_migration_dev'`（Git Bash 使用 `export DB_NAME=pms_migration_dev`），再执行迁移和启动应用。新库不会复制旧库数据；后续启动也必须使用相同 DB_NAME，建议写入根目录 `.env`。已有同名库时不要重复 createdb。不要通过删除数据卷解决基线冲突。

## 本地登录

1. 创建 PostgreSQL 数据库 `pms`。
2. 将 `apps/nest/.env.example` 复制为 `apps/nest/.env`，确认 `DB_ENABLED=true` 与数据库连接信息正确。
3. 保持 `DB_SYNCHRONIZE=false`，先执行 `pnpm migration:run` 创建数据库结构，再启动 API。
4. 将 `apps/vue3/.env.example` 复制为 `apps/vue3/.env.local`。
5. 启动后访问 `/register` 自助注册，并通过 SMTP 邮件完成邮箱验证后登录。

生产部署必须替换 `JWT_SECRET`，并关闭 `DB_SYNCHRONIZE`。

## Docker

需要 Docker Engine / Docker Desktop（Linux containers）及 Docker Compose v2。在仓库根目录执行以下命令。两个环境使用独立的 Compose 项目和数据库卷，请分别使用对应的配置文件，不要叠加。

### 开发环境

```bash
docker compose -f compose.dev.yaml up --build -d
docker compose -f compose.dev.yaml logs -f api web
docker compose -f compose.dev.yaml down
```

- 前端：<http://localhost:5173>；API：<http://localhost:3000/api>；Swagger：<http://localhost:3000/api/docs>。
- PostgreSQL：`localhost:5432`，用户名 `pms`，数据库 `pms`，默认密码 `pms-development`，可通过 `DB_PASSWORD` 覆盖。
- 前后端源码挂载并启用轮询监听，支持 Windows Docker Desktop 热更新。依赖存放在镜像内，不挂载宿主机 `node_modules`；修改依赖、环境变量或未挂载的配置后重新执行 `up --build -d`。
- 开发环境关闭 `DB_SYNCHRONIZE`，通过迁移创建和更新数据库结构。
- 不包含邮件服务。注册验证、密码重置需要自行提供 SMTP。默认连接宿主机 `host.docker.internal:1025`；可创建 `docker/.env.dev` 设置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASSWORD`、`SMTP_FROM`，启动时添加 `--env-file docker/.env.dev`。尚未配置 SMTP 时，邮件相关操作会失败。
- 容器不会读取宿主机已有的 `apps/*/.env.local`；开发前端固定请求 `http://localhost:3000/api`，适用于本机浏览器访问。

### 生产环境

默认 `TRUST_PROXY_HOPS=2` 对应“浏览器 → 宿主机 HTTPS 入口 → Nginx → API”，用于正确识别 SDK 客户端 IP 并分别限流。HTTPS 入口必须覆盖 `X-Forwarded-For` 为真实客户端地址，禁止透传客户端自填值。若只有 Nginx 一层代理，设为 `1`；直接运行 API 时默认 `0`。API 不应绕过约定的代理链暴露公网。

先将 `docker/.env.example` 复制为 `docker/.env.production`，填写真实域名、数据库密码、至少 32 字符的随机 JWT 密钥及 SMTP 设置。该文件已被 Git 和 Docker 构建上下文排除。

```bash
docker compose --env-file docker/.env.production -f compose.production.yaml build
docker compose --env-file docker/.env.production -f compose.production.yaml up -d db
docker compose --env-file docker/.env.production -f compose.production.yaml run --rm --no-deps api node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
docker compose --env-file docker/.env.production -f compose.production.yaml up -d
docker compose --env-file docker/.env.production -f compose.production.yaml ps
docker compose --env-file docker/.env.production -f compose.production.yaml logs -f api web
```

生产镜像采用多阶段构建：NestJS 以非 root 用户运行编译产物和生产依赖，Nginx 托管前端并代理 `/api`，支持 SPA 路由与 `Document-Policy: js-profiling`。API 和数据库只在容器网络内提供服务，Web 默认绑定宿主机 `127.0.0.1:8080`（通过 `HTTP_PORT` 调整）。请在宿主机配置 HTTPS 反向代理转发到该端口，外部访问域名须与环境变量一致。此配置不负责申请证书或终止 TLS。

**首次部署数据库：** 生产固定关闭 `DB_SYNCHRONIZE`。启动应用前执行上面的完整基线迁移，创建全部 14 张业务表及约束、索引，执行记录保存在 `pms_migrations`。重复运行会跳过已执行迁移。基线仅适用于空数据库；已有数据库应先备份并核对结构后制定升级方案。执行命令、回滚说明及测试方法见 [API 数据库结构管理](apps/nest/README.md#数据库结构管理)。

开发和生产数据库分别保存在 `pms-dev_postgres` 和 `pms-production_postgres` 卷中。`down` 保留数据，`down -v` 会删除对应环境的数据卷。生产数据库应定期备份；数据库初始化后，修改环境变量中的密码不会自动修改数据库用户密码。

构建使用项目固定的 pnpm 版本和锁文件，并排除本机 `.npmrc`（其 registry 指向 `localhost:4873`）、环境文件和构建缓存。不要使用示例密码部署生产环境。

Docker 构建不包含两个 SDK 包的源码，仅安装主应用及其 workspace 依赖，使用共享锁文件，并通过 BuildKit 缓存复用 pnpm 包文件及元数据。
首次构建仍需下载依赖；后续未修改依赖时，可直接执行 `docker compose -f compose.dev.yaml up -d`。

## Profiles

浏览器函数采样的接入、响应头配置和分析说明见 [Profiles 文档](PROFILES.md)。在项目的 Profiles 页面启用采集后，使用 PMS Vue SDK 的 `browserProfilingIntegration()` 接入。
