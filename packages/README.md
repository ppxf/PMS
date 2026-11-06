# SDK 开发与发布

SDK、主应用与 `packages/config` 共用根目录 workspace 和 `pnpm-lock.yaml`。
Basic setup 默认自动采集 Web Vitals；无需额外 setup 页面或开启自定义 Metrics/Traces。发布包含该能力的 SDK 前先部署服务端 Web Vitals 迁移与接收入口。
根目录 Turbo 任务包含 SDK，Docker 按主应用依赖范围安装并排除 SDK 源码。
锁文件记录 SDK 的开发依赖，不会使外部使用方安装 SDK 的开发工具。

在仓库根目录执行：

```sh
pnpm sdk:install
pnpm sdk:build
pnpm sdk:test
pnpm sdk:typecheck
pnpm sdk:lint
```

构建会按依赖顺序先构建 Core，再构建 Vue SDK。单独测试 Vue SDK 前，也应先运行构建。
从独立工作区迁移后，先在根目录执行 `pnpm install --frozen-lockfile`，统一更新依赖链接。

修改 SDK 的依赖后，在仓库根目录运行 `pnpm install`，提交根目录锁文件。
单包命令使用 `pnpm --filter @pms/monitoring-core ...`，Vue SDK 同理。
发布前执行构建和测试，再在对应 SDK 包目录中执行 `pnpm pack` 并检查产物。
先发布 Core，再发布 Vue SDK；pnpm 会把发布产物中的 `workspace:*` 转换为对应 Core 的实际版本。
Vue 保持为 peer dependency，外部使用方使用自己的锁文件管理最终安装版本。

Docker 的过滤安装限制实际安装范围，但共享锁文件的供应链校验仍可能读取其他条目的元数据。
包文件缓存和元数据缓存用于减少重复下载，不能保证首次构建不需要网络。

主项目中的 TypeScript、Vite、Vitest、Vue 等依赖仍会保留，因为前后端及共享配置也需要它们。
重复依赖仅在版本约束兼容时合并，不强制将旧主版本替换为新主版本。
