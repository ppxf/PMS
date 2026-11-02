# SDK 独立工作区

主工作区负责 `apps/nest`、`apps/vue3` 和共享的 `packages/config`。
SDK 使用此目录下的独立 workspace 和 `pnpm-lock.yaml`，不参与主项目安装、Turbo 任务或 Docker 构建。
`config` 同时服务两个工作区，因此其依赖会分别记录在两个锁文件中。

在仓库根目录执行：

```sh
pnpm sdk:install
pnpm sdk:build
pnpm sdk:test
pnpm sdk:typecheck
pnpm sdk:lint
```

构建会按依赖顺序先构建 Core，再构建 Vue SDK。单独测试 Vue SDK 前，也应先运行构建。
首次从原共享工作区迁移时，先执行 `pnpm install --frozen-lockfile`，再执行以上 SDK 命令。

修改 SDK 的依赖后，在仓库根目录运行 `pnpm --dir packages install`，提交更新后的 SDK 锁文件。
现有 `pnpm --filter @pms/monitoring-core ...` 命令需要改为
`pnpm --dir packages --filter @pms/monitoring-core ...`，Vue SDK 同理。
发布仍在对应 SDK 包目录中执行 `pnpm pack` 或 `pnpm publish`。

主项目中的 TypeScript、Vite、Vitest、Vue 等依赖仍会保留，因为前后端及共享配置也需要它们。
重复依赖仅在版本约束兼容时合并，不强制将旧主版本替换为新主版本。
