# PMS · 应用监控平台

PMS 是面向 Web 应用的监控平台，帮助开发者收集运行异常、分析页面与请求性能，并在同一工作台中查看日志、指标和调用信息，定位影响用户体验的问题。

项目包含 Vue 3 管理后台、NestJS API 和浏览器 / Vue SDK，支持通过 Docker Compose 自行部署。

界面支持简体中文与英文，可在右上角切换。首次访问会根据浏览器语言选择，手动选择后将在当前浏览器中保存偏好。

**网站访问：[https://pmspulse.xyz/](https://pmspulse.xyz/)**

[本地运行](#本地运行) · [SDK 接入](packages/monitoring-vue/README.md) · [生产部署](#生产部署) · [部署指南](GHCR-DEPLOY.md)

## 能做什么

| 能力       | 用途                                                            |
| ---------- | --------------------------------------------------------------- |
| 异常监控   | 收集 Vue、浏览器运行错误及未处理的 Promise 异常，按问题聚合排查 |
| Web Vitals | 查看 LCP、INP、CLS、FCP、TTFB 等用户体验指标                    |
| Traces     | 分析页面加载、路由切换、HTTP 请求与手动埋点的耗时               |
| Logs       | 上报并查询应用结构化日志                                        |
| Metrics    | 记录计数、仪表值和分布等自定义业务指标                          |
| Profiles   | 基于采样调用栈分析浏览器代码执行情况                            |
| 项目管理   | 按分组和项目管理监控数据，配置成员权限、采集开关与 SDK 上报来源 |

典型使用流程：注册并验证邮箱 → 创建项目 → 获取该项目的 DSN → 按接入页配置 SDK → 在工作台查看上报数据。不同业务项目应使用各自的 DSN。

### 技术与目录

前端使用 Vue 3、TypeScript、Vite 和 Tailwind CSS；后端使用 NestJS、TypeORM、PostgreSQL 和 Redis。仓库通过 pnpm workspace 与 Turborepo 管理应用、SDK 和共享配置。

```text
apps/
├─ vue3/                 # 监控管理后台
└─ nest/                 # API、数据接收与项目管理
packages/
├─ monitoring-core/      # 浏览器采集核心
├─ monitoring-vue/       # Vue SDK
└─ config/               # ESLint、TypeScript、Prettier 共享配置
docker/                  # 镜像构建与容器内 Nginx 配置
scripts/deploy.sh        # 生产部署脚本
compose.dev.yaml         # 本地开发环境
compose.production.yaml  # 生产环境
```

## 本地运行

### 环境要求

- Docker Engine / Docker Desktop（Linux containers）及 Docker Compose v2。
- 可用的 SMTP 服务，用于注册验证、密码重置等邮件功能；Compose 不包含邮件服务。
- 如需在宿主机执行构建、测试或 SDK 开发命令，使用 Node.js 24.12+ 和 pnpm 11.19.0。仅运行容器无需在宿主机安装 Node.js。

以下命令均在仓库根目录执行。应用统一通过 Docker Compose 启动，配置集中在根目录，前后端不读取子应用环境文件。

### 首次启动

先复制开发配置，并按实际情况填写 SMTP：

```bash
cp .env.example .env
```

PowerShell 可使用 `Copy-Item .env.example .env`。默认 SMTP 地址为 `host.docker.internal:1025`，需要自行在该地址运行邮件服务，或修改 `.env` 中的 SMTP 配置。

首次使用空数据库时，按以下顺序构建镜像、启动数据库、执行迁移，再启动应用：

```bash
docker compose -f compose.dev.yaml build api web
docker compose -f compose.dev.yaml up -d --wait db redis
docker compose -f compose.dev.yaml run --rm --no-deps api pnpm exec typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
docker compose -f compose.dev.yaml up -d api web
```

开发与生产均关闭自动建表（`DB_SYNCHRONIZE=false`），启动命令不会自动执行数据库迁移。

启动后访问：

| 服务     | 本地地址                                                         |
| -------- | ---------------------------------------------------------------- |
| 管理后台 | [http://localhost:5173](http://localhost:5173)                   |
| 注册页面 | [http://localhost:5173/register](http://localhost:5173/register) |
| API      | [http://localhost:3000/api](http://localhost:3000/api)           |
| Swagger  | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) |

完成邮箱验证后即可登录、创建项目并接入 SDK。未配置可用 SMTP 时，邮件相关操作会失败。

### 日常开发

```bash
# 启动或更新开发环境（已完成数据库初始化）
docker compose -f compose.dev.yaml up --build -d

# 查看应用日志
docker compose -f compose.dev.yaml logs -f api web

# 停止开发环境，保留数据卷
docker compose -f compose.dev.yaml down
```

安装 pnpm 后，可使用 `pnpm dev` 启动同一开发环境。前后端源码挂载到容器并支持热更新；修改依赖、环境变量或未挂载的配置后，需要重新构建并启动容器。

PostgreSQL 和 Redis 仅向本机暴露，默认端口分别为 `15432` 和 `16379`。数据库默认用户名、库名为 `pms`，开发密码为 `pms-development`，可在 `.env` 中覆盖。

### 构建与检查

以下命令在宿主机执行，首次使用先安装工作区依赖：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test
pnpm typecheck
```

SDK 与主应用共用工作区和锁文件，根目录构建、测试覆盖 SDK。仅开发 SDK 时，可使用 `pnpm sdk:install`、`pnpm sdk:build`、`pnpm sdk:test`；更多命令与发布顺序见 [SDK 开发与发布](packages/README.md)。

数据库结构变更使用 `pnpm migration:show` 查看状态、`pnpm migration:run` 执行迁移。已有自动建表历史的旧数据库，应先核对结构或使用新的空数据库，不能直接套用空库基线。迁移回滚可能删除表和数据，应先确认影响并备份。

## 生产部署

### 部署方式

仓库已配置 **GitHub Actions → GHCR 镜像仓库 → ECS 上的 Docker Compose** 发布流程。

| 环节       | 当前配置                                                                        |
| ---------- | ------------------------------------------------------------------------------- |
| 构建       | 推送 `main` 或在 `main` 手动触发工作流，构建 Linux amd64 的 API / Web 镜像      |
| 镜像分发   | 推送 GHCR，使用完整提交 SHA 标识应用镜像版本                                    |
| 服务运行   | ECS 拉取镜像，通过 `compose.production.yaml` 运行 Web、API、PostgreSQL 和 Redis |
| HTTPS 入口 | 宿主机 Nginx 管理 HTTPS；Web 默认仅监听宿主机 `127.0.0.1:8080`                  |
| API 访问   | 浏览器通过同源 `/api` 访问后端                                                  |
| 数据持久化 | PostgreSQL、Redis 使用独立的生产数据卷，与开发环境隔离                          |
| 更新流程   | 拉取镜像 → 启动数据库与 Redis → 备份数据库 → 执行迁移 → 更新应用 → 健康检查     |

服务器只拉取并运行镜像，无需安装 pnpm 或在服务器上构建应用。

### 配置与发布

1. 从根目录 `.env.production.example` 创建 `.env.production`，填写数据库密码、JWT 密钥、正式域名、SMTP 和 GHCR 镜像地址。
2. 准备可读取 GHCR 镜像的部署账号，并按指南同步 PostgreSQL、Redis 基础镜像。
3. 配置 GitHub Actions 的 SSH 部署 Secrets 和部署路径 Variable。
4. 推送 `main`，由工作流构建镜像并调用 `scripts/deploy.sh` 完成发布。

完整操作、所需 Secrets 与手工部署要求见 [GHCR 部署指南](GHCR-DEPLOY.md)，工作流见 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)。

### 检查与维护

在已配置 `.env.production` 的服务器上，将 `PMS_IMAGE_TAG` 设置为目标版本的完整提交 SHA 后执行：

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 api web
```

部署脚本在 `.deploy/current-release`、`.deploy/previous-release` 记录版本，数据库备份保存在 `.deploy/backups`；异地备份需另行安排。回滚应用前须确认数据库兼容性，部署失败不会自动撤销数据库迁移。

生产默认开启监控数据定时清理，保留期为 30 天，可通过 `.env.production` 的 `RETENTION_*` 配置调整。已安装 pnpm 的环境可使用 `pnpm production:migration:show`、`pnpm production:migration:run`、`pnpm production:migration:revert` 管理迁移；服务器端可按部署脚本直接调用容器中的 TypeORM CLI。
