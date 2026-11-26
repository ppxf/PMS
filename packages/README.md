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
单包命令使用 `pnpm --filter @pmspulse/monitoring-core ...`，Vue SDK 同理。
发布前执行构建和测试，再在对应 SDK 包目录中执行 `pnpm pack` 并检查产物。
先发布 Core，再发布 Vue SDK；pnpm 会把发布产物中的 `workspace:*` 转换为对应 Core 的实际版本。
Vue 保持为 peer dependency，外部使用方使用自己的锁文件管理最终安装版本。

Docker 的过滤安装限制实际安装范围，但共享锁文件的供应链校验仍可能读取其他条目的元数据。
包文件缓存和元数据缓存用于减少重复下载，不能保证首次构建不需要网络。

主项目中的 TypeScript、Vite、Vitest、Vue 等依赖仍会保留，因为前后端及共享配置也需要它们。
重复依赖仅在版本约束兼容时合并，不强制将旧主版本替换为新主版本。

## 页面测量结束与退出上报

SPA 路由导航沿用当前文档的 Trace ID；刷新、重新打开或整页跳转后重新生成 Trace ID。
路由切换和页面隐藏只结束页面测量，已开始的子操作最多再等待 5 秒，仍归属原页面。
页面离开时立即封包；往返缓存恢复会创建新的页面测量区间。

Span 的 `attributes['pms.measurement.status']` 区分 `complete`、`lifecycle`、`interrupted` 和 `timeout`。
`truncated` 和 `droppedSpanCount` 用于容量限制导致的记录丢弃；旧 SDK 数据保留原含义。
服务端沿用 JSON 属性字段，无需数据库迁移；部署对应服务端查询和前端展示逻辑后，才能正确区分新状态并排除未完成耗时。

Trace 封包会拆分为小包，各包带相同内容的根 Span 和独立 event ID，服务端按 Span ID 与内容去重。
HTTP 上报共享文档内的 keepalive 在途体积与请求数预算，超出预算时使用普通 fetch。
浏览器关闭、网络中断等情况下仍不保证送达，不通过阻塞页面或本地持久化队列保证交付。

## 日志与链路关联

启用日志后，logger 与受支持的 console 采集会在记录日志时自动读取当前 Trace/Span 上下文；显式 `traceContext` 优先。
页面测量结束、超时或进入后台后保留当前文档的关联上下文，页面离开时清理。
Trace 未采样时日志仍可保存关联 ID；没有上下文的日志不补造 Trace ID，历史未关联日志也不按时间推测归属。

链路详情的“关联日志”按项目和整个 Trace 查询，不受导航窗口或当前 Span 影响，仅向有日志读取权限且有相关记录的用户显示。
日志展开详情可跳入关联日志，关联日志可通过可编辑的 Trace 筛选跳入完整日志页。
本功能复用现有日志 Trace/Span 字段与索引，无数据库迁移；需要更新 SDK、服务端日志查询入口及前端。
