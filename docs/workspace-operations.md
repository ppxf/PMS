# 工作台使用与运维

## 使用
- 未选择项目时，侧边栏提供总览、问题中心、告警、接入状态、分组与项目。
- 管理区域的审计记录仅对当前拥有审计权限、项目所有者或仍有本人历史记录的用户显示；项目成员权限页可单独授权 Audit records。
- 问题中心筛选用户有错误查看权限的项目。
- `connected` 表示 SDK 曾成功连接，不表示当前在线。接入状态按数据种类展示开关及最后上报时间：`active` 表示最近 24 小时有上报，`stale` 表示最后上报超过 24 小时，`waiting` 表示从未上报，`disabled` 表示采集关闭；低流量项目的 stale 不等同于 SDK 故障。Web Vitals 当前没有独立项目开关。
- 项目所有者在告警页面创建或编辑规则；支持新问题、重新打开的问题、时间窗口错误次数阈值。后台约每 30 秒评估，站内记录可确认并自动恢复。具有 `project:issues:read` 的成员也可查看和确认告警，规则管理仍仅限所有者。暂不发送邮件或 Webhook。
- 审计记录从功能启用后产生，包含人工管理操作及系统自动解决问题，敏感请求体、凭据及原始事件载荷不会记录。项目删除后所有者仍可查看保留快照。

## 数据库
审计与告警结构由 `1794441600000-audit-records`、`1794441600001-workspace-alerts` 及后续统一迁移维护。
已有环境先运行 `pnpm migration:show`，再运行 `pnpm migration:run`；Docker 开发环境使用 `pnpm docker:dev:migration:show` 和 `pnpm docker:dev:migration:run`，无需预先运行 API 服务。生产使用对应的 `docker:production:migration:*` 命令，数据库与 Redis 先启动，迁移成功后再启动 API。
开发和生产均保持 `DB_SYNCHRONIZE=false`，不手动运行历史模块 SQL。以上是部署操作说明，不代表任何目标环境已经应用迁移。完整基线只适用于空库，旧结构需先备份和核对。

数据保留、清理 dry-run、定时执行及 Redis 协调规则见 [生产加固与运维](production-hardening.md)。审计记录有独立保留策略，监控清理不会删除仍被错误归组引用的末次错误事件。

## 验证
后端 `pnpm --filter @pms/nest build`，前端 `pnpm --filter @pms/vue3 typecheck`。
后端测试 `pnpm --filter @pms/nest test -- --runInBand`。
PostgreSQL 测试通过 MIGRATIONS_TEST_DATABASE_URL 与 WORKSPACE_TEST_DATABASE_URL 显式启用，创建随机临时 schema，结束后清理；不要输出连接凭据。
前端 `pnpm --filter @pms/vue3 test -- src/features/workspace/__tests__/WorkspaceView.spec.ts src/components/layout/__tests__/AppLayout.spec.ts`。

## 当前边界
审计用于应用内追溯，数据库管理者仍可修改表，不宣称具备防篡改归档能力。历史操作不补录。站内告警通过定时评估当前问题状态产生；一个扫描周期内多次重新打开同一问题，会以数据库保留的最近一次重开时间生成告警。

## 历史验收记录（2026-11-11）

以下记录仅对应当日版本，不是当前版本或目标部署环境的验收证明。
- 本地开发库两条新增迁移执行成功，原有业务数据保留，开发容器已恢复运行。
- 后端完整回归459项通过，19项需外部条件的测试跳过；新增功能与真实数据库专项22项全部通过。
- 工作台/导航/路由20项通过，另审计专属成员跳转相关6项通过。
- 后端构建、前端类型检查通过；四个新增页面浏览器加载成功，八个新增读取接口返回200，未认证返回401。
- 临时浏览器验证会话已清除。未提交、推送或发布到生产环境。

Global search 已按用户要求移除；项目内日志与链路功能继续保留。旧全局查询链接回到总览，后端不再提供 /workspace/search 接口。
