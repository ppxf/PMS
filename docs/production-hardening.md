# 生产加固与运维

## Redis 部署与故障策略

API 使用 Node Redis 客户端，通过 `REDIS_URL` 连接 Redis，`REDIS_KEY_PREFIX` 默认为 `pms:`。同一部署的所有 API 实例必须使用同一 Redis 与前缀，不同部署应使用独立前缀或独立 Redis。

本地环境示例统一使用 API `http://localhost:3000`，前端本地示例直接请求该地址的 `/api`；生产镜像使用 Nginx 同源 `/api`。SDK DSN 的公开地址由 `PUBLIC_URL` 决定，不能与实际入口端口不一致。

生产环境缺少 `REDIS_URL` 会拒绝启动。已配置 Redis 时，不会降级为进程内存；连接中断、命令超时或内存耗尽导致协调失败时，依赖限流或请求幂等的接口返回 503，普通读取可继续服务。命令等待上限为 3 秒，客户端后台尝试重连。修复 Redis 后重试请求；健康检查成功不能证明 Redis 可用。

仅在本地开发未配置 `REDIS_URL` 时，使用最多 10,000 条记录的内存实现。过期记录可清理，容量不足返回 503。该实现重启即丢失，不能为多个 API 实例共享配额或请求结果。

Compose 提供 `redis:7.4-alpine`，启用 AOF、256 MB 上限和 `noeviction`。开发仅向宿主机 `127.0.0.1:16379` 暴露端口；生产不暴露 Redis、PostgreSQL 和 API 端口。API 容器连接 `redis://redis:6379`。两个环境使用各自的 Redis 数据卷。Redis 清空或数据卷丢失会清除限流窗口和幂等结果；AOF 不能提供与 PostgreSQL 事务一致提交的保证。

首次部署先构建镜像，再启动 `db redis`，执行统一数据库迁移，最后启动 API 与 Web。命令见 [根目录 Docker 说明](../README.md#docker)。增加实例时复用 Redis，不通过清空 Redis 恢复服务；监控内存使用、命令失败及 429/503 变化。

## 限流配额

Redis 用 Lua 原子更新固定窗口，SDK、邀请和认证使用隔离的协调键。账号按去除首尾空格并转小写归一化后哈希，Redis 键不保存明文邮箱、密码或 Token。配额在请求进入业务处理前消耗，成功与失败请求都会计数；超限返回 429 和按剩余窗口计算的 `Retry-After` 秒数。

| 请求 | IP 配额 | 归一化账号配额 |
| --- | --- | --- |
| 注册、重发邮箱验证、忘记密码（分别按动作） | 每小时 10 次 | 每小时 3 次 |
| 登录（独立动作） | 每分钟 30 次 | 每 15 分钟 10 次 |
| 验证邮箱、重置密码（分别按动作） | 每分钟 30 次 | 仅有邮箱字段时每 15 分钟 10 次；这两类 Token 请求通常没有邮箱字段 |

SDK Envelope 默认为每个可信客户端 IP 每分钟 120 次，通过 `SDK_RATE_LIMIT_PER_MINUTE` 调整；同 IP 的项目共享此配额。邀请管理和预览、接受接口按已登录用户独立计数，默认为每分钟 120 次，当前共用 `SDK_RATE_LIMIT_PER_MINUTE` 配置额度，但不占用 SDK IP 窗口。客户端 IP 取决于正确的代理信任设置：`TRUST_PROXY_HOPS` 必须匹配实际链路，公网入口覆盖 `X-Forwarded-For`，API 不绕过代理暴露。

## 管理请求幂等

已认证管理写接口可选传入 `Idempotency-Key`。支持组、项目、成员与邀请管理、错误管理、告警规则及告警确认的 `POST/PUT/PATCH/DELETE`。认证响应与 SDK 采集不会通过该机制缓存，邀请接受仍由数据库事务和唯一约束保障。

Key 为 8–128 个字符，只允许字母、数字、`_`、`.`、`:`、`-`。同一逻辑操作重试时使用相同 key；新操作使用新 key。服务端按用户、HTTP 方法、完整请求 URL 和 key 隔离，按 JSON 请求体的稳定序列化摘要识别负载。

- 首个请求取得 60 秒处理租约，每 15 秒续租。
- 相同 key、不同负载返回 409；同一请求仍在处理时返回 409，附带 `Retry-After: 1`。
- 成功结果保留 24 小时，重试重放原状态码和 JSON 响应，并返回 `Idempotency-Replayed: true`。
- 重放前重新验证当前登录会话和资源权限，成员移除、权限撤销或密码重置不会被缓存结果绕过。
- 业务处理失败不缓存错误响应；写操作已返回成功但结果持久化到 Redis 失败时返回 503，并保留剩余 pending 租约。

Redis 租约与数据库写入不是同一事务。进程在数据库提交后、结果保存前崩溃，租约过期后重试仍可能再次执行；该机制不提供 exactly-once 崩溃保证。需要持久唯一性的业务继续依赖数据库约束和事务。SDK 的 `eventId`、批次标识及载荷一致性校验继续由 PostgreSQL 承担，不能用 Redis 成功或幂等 key 替代。

## 数据保留与清理

统一清理入口默认只统计符合条件的记录，必须显式传入 `--execute` 才会删除。先备份并检查 dry-run 的范围与数量，再执行清理：

```powershell
# 仓库根目录：默认 dry-run
pnpm retention:cleanup
# 显式执行删除
pnpm retention:cleanup -- --execute
# 已构建的 API 生产包
pnpm --filter @pms/nest retention:cleanup:prod
pnpm --filter @pms/nest retention:cleanup:prod -- --execute
```

命令使用 API 的数据库配置与统一迁移结构，运行前检查目标库。输出包含 `cutoff`、`executed` 和按表统计的 `counts`。`RETENTION_ENABLED` 只控制后台定时执行，不替代 CLI 的显式执行参数；后台启用且数据库就绪时，启动会立即执行一轮，随后按配置间隔执行。

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `RETENTION_ENABLED` | 生产 `true`，开发 `false` | 是否后台定时清理 |
| `RETENTION_DAYS` | `30` | 监控数据保留天数 |
| `RETENTION_INTERVAL_MINUTES` | `60` | 后台执行间隔，分钟 |
| `RETENTION_BATCH_SIZE` | `5000` | 每条 DELETE 的行数上限，循环分批直到无可删记录 |

统一清理覆盖错误事件、日志及批次、指标及批次、Profiles、Span 及 Trace 批次、Web Vitals 和 Page View 共 10 张采集或批次表，按服务端 `received_at` 计算保留窗口。错误归组当前 `latest_event_id` 引用的末次证据保留，即使已超过窗口，因此清理不会使 issue 的末次详情失效。仍包含窗口内 Web Vital 的旧 Page View 也保留，避免父记录级联删除近期更新的指标。审计记录不随监控清理删除，当前保留审计历史；审计归档或删除应按独立策略处理。

旧命令 `pnpm --filter @pms/nest traces:retention` 仍只处理 Trace 范围，使用原有固定 30 天策略并默认 dry-run；可加 `-- --execute` 执行。它等价于清理 CLI 的 `--traces-only` 分支，不代表统一清理全部监控模块。

## 邀请邮件与会话失效

邀请创建和重发先在数据库事务中保存邀请及邮件任务，后台再于事务外调用 SMTP；HTTP 成功只表示任务已持久化。邀请表保存令牌哈希，待发送任务使用从 `JWT_SECRET` 派生的 AES-256-GCM 密钥临时加密链接令牌，完成后清除加密内容。轮换 `JWT_SECRET` 前需考虑未发送任务：轮换后应检查失败任务，并由所有者重发受影响邀请。

邮件按至少一次语义投递：SMTP 已接受、服务却未记录完成时仍可能重发。重发邀请会生成新令牌并使旧链接失效；撤销、过期或已消费邀请不会恢复为可接受状态。`pending/failed` 邀请不能接受，发送完成后才可使用。详情见 [项目权限与邀请](project-access.md)。

后台不需要额外环境变量，固定执行参数如下：

| 行为 | 当前参数 |
| --- | --- |
| 轮询 | 数据库就绪后启动立即执行，之后每 5 秒检查；上一轮未完成时跳过，避免同实例重入 |
| 每轮任务数 | 最多 20 条，串行发送 |
| 领取租约 | 2 分钟；进程中断后过期任务可重新领取 |
| SMTP 超时 | 连接、问候各 30 秒，Socket 空闲超时 60 秒 |
| 失败重试 | 从 30 秒开始按 `30 × 2^(attempt-1)` 秒退避，上限 1 小时；正常失败路径第 8 次尝试失败后终止 |

中间重试保留加密 payload，完成、取消或最终失败后清除 payload。后台失败日志不保存 SMTP 原始错误或链接令牌。处理失败时先核对 SMTP 和数据库可用性；修复后尚在重试期的任务会继续尝试，也可由 owner 手动重发生成新链接。`JWT_SECRET` 轮换导致的旧密文解密失败按同一重试规则处理，最终清除后需手动重发。

密码重置成功会增加用户 `session_version`，JWT guard 每次请求与当前用户版本比较，旧会话立即不能继续请求。兼容旧 JWT 时，缺失版本视为 `0`，仅能与仍为版本 `0` 的用户匹配；重置密码后不再匹配。

## 数据库与权限约定

开发和生产都使用 `DB_SYNCHRONIZE=false`。在应用启动前执行全部待运行迁移；`traces:migrate` 是统一 `migration:run` 的兼容别名，包含 Profiles 与后续模块，不再单独执行历史 Profiles SQL。空库可从基线开始，旧的自动建表数据库先备份和核对实际结构，不通过伪造迁移记录或删除数据卷解决冲突。

本次新增 `1794528000000-production-hardening`（会话版本及事件查询索引）与 `1794528000001-invitation-outbox`（持久邮件任务）。回滚 outbox 迁移会删除任务表及待发送任务；回滚会话版本迁移会移除版本字段，不能继续保证旧会话撤销。回滚前停止应用并确认备份与回退方案。

已有大表的升级应安排迁移窗口：当前索引使用事务内 `CREATE INDEX`，会取得表锁。先备份并暂停 API 写入，执行迁移后再启动新版 API；这组命令不作为无停机并发建索引流程使用。

项目 owner 执行管理写操作。member 可分配 `project:audit:read`、`project:issues:read`、`project:traces:read`、`project:metrics:read`、`project:web-vitals:read`、`project:logs:read`、`project:profiles:read` 七项权限；其中 `project:issues:read` 还允许确认站内告警，不能管理规则。新链接使用分组与项目 UUID，旧 slug 保留兼容，歧义拒绝访问。

UUID 优先级分别作用于分组和项目：对应对象 ID 在数据库中存在时，只定位该 ID，不能因为无权限或父子组合不匹配而改选同名 slug；该对象 ID 不存在时，才兼容 UUID 形旧 slug。读、写和审计定位遵循同一规则。

`connected` 仅表示曾成功连接；各采集类型的 `active/stale` 按最近 24 小时上报划分，`waiting` 表示从未上报，`disabled` 表示采集关闭。这些状态不能证明客户端仍在线，也不能将低流量的 stale 直接判定为 SDK 故障。

## 查询与索引

接入状态按当前页有权限的项目集合、按数据种类批量聚合最近 `received_at`，最多执行 6 次采集统计查询，不再为每个项目的每种信号单独查询；项目选择和权限读取另计。错误事件新增 `(project_id, received_at)`、`(project_id, timestamp)` 与 `received_at` 索引，用于对应的告警窗口、事件时间和保留清理查询；问题表增加 `latest_event_id` 索引，支持清理时保护末次证据及外键反向检查。阈值规则按项目和窗口去重后批量统计，复用相同窗口的结果。具体执行计划与延迟仍需按部署数据量验证，测试中的查询次数不等同于生产性能基准。

## 验证边界

上线前按部署环境分别记录迁移状态、Redis 配额与断连行为、两个 API 实例同时请求同一 key、负载冲突、权限撤销后的重放、SMTP 任务及清理 dry-run 的实际结果。生产连接不用于自动化数据库测试。真实 PostgreSQL 测试仅在显式测试连接下运行并清理临时 schema；真实 Redis 测试应使用独立前缀并清理。文档中的命令和预期行为不代表这些验证已经执行。

Redis 专项测试从仓库根目录运行，显式提供测试连接：

```powershell
$env:REDIS_TEST_URL='redis://localhost:16379'
pnpm --filter @pms/nest test -- coordination --runInBand
```

未提供 `REDIS_TEST_URL` 时，外部 Redis 测试应跳过；内存实现或 mock 的单元测试通过不能替代真实 Lua、跨实例或 OOM 故障验证。不要将测试连接指向生产 Redis。

保留清理的 PostgreSQL 专项测试使用 `RETENTION_TEST_DATABASE_URL`，未设置时回退到 `MIGRATIONS_TEST_DATABASE_URL`；显式配置可丢弃的测试数据库后运行 `pnpm --filter @pms/nest test -- retention --runInBand`。测试创建随机 schema 并清理，覆盖 dry-run、分批执行、末次错误证据及近期 Web Vital 的父记录保护。

## 开发验收记录（2026-11-12）

开发测试日志记录 Redis 协调专项 4 个套件、18 项通过，以及管理请求幂等和 SDK 限流的 HTTP 专项 2 项通过。真实 Redis 的嵌套空数组与数字精度回归曾复现响应形状变化，改为保存原始 JSON 字符串后通过。该记录仅对应开发测试，不代表生产已执行迁移、发送邀请邮件或完成保留清理。

最终回归记录：后端 70 个套件、536 项全部通过，真实 PostgreSQL、Redis、HTTP 测试均已启用；前端 41 个文件、214 项全部通过。前后端生产构建、完整类型检查、变更文件 ESLint 和 Git 差异空白检查通过。前端构建另有 509.60 KB（gzip 173.54 KB）的分块提示；生产负载和页面网络性能没有在本次测试中量化。

完整应用连接独立测试数据库启动成功，`GET /api` 返回 200，未认证的工作台项目查询返回 401。统一清理和兼容 Trace CLI 的实际输出均为 `executed: false`。邮件的并发、退避、撤销和重发使用真实 PostgreSQL 与替代 SMTP 验证，尚未向实际 SMTP 服务投递。
