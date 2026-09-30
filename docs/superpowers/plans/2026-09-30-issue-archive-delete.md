# 错误归档与删除实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在错误详情页提供永久归档、按累计次数归档、恢复、普通删除和不可恢复的永久删除，并在列表提供已归档视图。

**架构：** 错误聚合记录新增独立于解决状态的可见性字段；永久删除使用只保存项目、环境和指纹的 suppression 实体。事件入库在同一事务中先检查 suppression，再通过 PostgreSQL upsert 原子递增次数并按阈值恢复；管理操作通过项目所有权约束的服务方法完成。

**技术栈：** NestJS、TypeORM/PostgreSQL、class-validator、Jest、Vue 3、Vue Router、TanStack Vue Table、Reka UI Dialog、Vitest。

**规格：** `docs/superpowers/specs/2026-09-30-issue-archive-delete-design.md`

## 全局约束

- 归档阈值只能为 `10`、`100`、`1000`，并且必须严格大于归档时的累计次数。
- 达到阈值的那次事件必须把次数归档恢复为 `active`。
- 永久归档和次数归档期间继续保存事件并累计次数。
- 普通删除清除错误及全部历史事件；再次发生时次数从 `1` 开始。
- 永久删除经过两个前端确认弹框，后端删除历史数据并创建不可恢复的阻止规则。
- 永久阻止规则不得保存标题、异常内容、堆栈、URL、标签或浏览器上下文。
- 错误列表不增加行级操作，只增加当前/已归档视图入口和归档状态视觉区分。
- 所有新增后端操作必须校验用户、组、项目和错误的所有权。
- 生产代码严格遵循红—绿—重构；每个任务先观察新增测试按预期失败。

## 文件结构

- 创建 `apps/nest/src/monitoring-events/entities/monitoring-error-suppression.entity.ts`：永久阻止规则实体。
- 修改 `apps/nest/src/monitoring-events/entities/monitoring-error-issue.entity.ts`：归档状态、阈值和时间。
- 修改 `apps/nest/src/monitoring-events/monitoring-events.module.ts`：注册 suppression 实体。
- 创建 `apps/nest/src/monitoring-events/dto/archive-issue.dto.ts`：归档请求联合约束。
- 修改 `apps/nest/src/monitoring-events/dto/list-issues-query.dto.ts`：当前/已归档列表视图。
- 修改 `apps/nest/src/monitoring-events/monitoring-events.service.ts`：入库策略、列表过滤和管理事务。
- 修改 `apps/nest/src/monitoring-events/monitoring-issues.controller.ts`：归档、恢复和两类删除路由。
- 修改对应 Nest 单元测试与 `apps/nest/test/app.e2e-spec.ts`：服务、控制器、权限和 HTTP 契约。
- 修改 `apps/vue3/src/features/monitoring/model/types.ts`：归档字段和请求类型。
- 修改 `apps/vue3/src/features/monitoring/api/monitoring.api.ts`：列表视图与详情操作 API。
- 修改 `apps/vue3/src/features/monitoring/views/ProjectIssuesView.vue`：视图切换和归档行样式。
- 修改 `apps/vue3/src/components/data-table/DataTable.vue`：提供可选行 class 回调，不承载业务判断。
- 修改 `apps/vue3/src/features/monitoring/views/ProjectIssueDetailView.vue`：归档、恢复、普通删除和双重永久删除弹框。
- 修改对应 Vue API、DataTable 和页面测试：交互、请求参数、颜色标识和失败状态。

---

### 任务 1：建立归档状态与永久阻止规则数据模型

**文件：**
- 创建：`apps/nest/src/monitoring-events/entities/monitoring-error-suppression.entity.ts`
- 修改：`apps/nest/src/monitoring-events/entities/monitoring-error-issue.entity.ts`
- 修改：`apps/nest/src/monitoring-events/monitoring-events.module.ts`
- 测试：`apps/nest/src/monitoring-events/monitoring-events.service.spec.ts`

- [ ] **步骤 1：编写失败的数据模型测试**

在 service 测试 fixture 中构造并断言默认业务形态，明确后续响应依赖的字段：

```ts
expect(issue).toMatchObject({
  visibility: MonitoringErrorIssueVisibility.Active,
  archiveThreshold: null,
  archivedAt: null,
});

const suppression = Object.assign(new MonitoringErrorSuppression(), {
  projectId,
  environment: 'production',
  fingerprint: 'a'.repeat(64),
});
expect(suppression).not.toHaveProperty('title');
expect(suppression).not.toHaveProperty('stacktrace');
```

- [ ] **步骤 2：运行测试并确认因枚举/实体不存在而失败**

运行：

```bash
pnpm --filter @pms/nest test -- monitoring-events/monitoring-events.service.spec.ts --runInBand
```

预期：FAIL，TypeScript 报告 `MonitoringErrorIssueVisibility` 或 `MonitoringErrorSuppression` 未导出。

- [ ] **步骤 3：实现实体字段和约束**

在 issue 实体增加：

```ts
export enum MonitoringErrorIssueVisibility {
  Active = 'active',
  ArchivedPermanent = 'archived_permanent',
  ArchivedUntilCount = 'archived_until_count',
}

@Column({ type: 'varchar', length: 32, default: MonitoringErrorIssueVisibility.Active })
visibility!: MonitoringErrorIssueVisibility;

@Column({ name: 'archive_threshold', type: 'integer', nullable: true })
archiveThreshold!: number | null;

@Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
archivedAt!: Date | null;
```

创建 suppression 实体，并用唯一索引约束项目、环境、指纹：

```ts
@Entity({ name: 'monitoring_error_suppressions' })
@Index('uq_monitoring_error_suppressions_scope', ['projectId', 'environment', 'fingerprint'], {
  unique: true,
})
export class MonitoringErrorSuppression {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @ManyToOne(() => MonitoringProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' }) project!: Relation<MonitoringProject>;
  @Column({ type: 'varchar', length: 64 }) environment!: string;
  @Column({ type: 'char', length: 64 }) fingerprint!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
```

用 `@Check` 约束 `visibility`、`archive_threshold` 的合法组合，并把新实体加入 `TypeOrmModule.forFeature`。

- [ ] **步骤 4：运行目标测试和类型检查**

```bash
pnpm --filter @pms/nest test -- monitoring-events/monitoring-events.service.spec.ts --runInBand
pnpm --filter @pms/nest typecheck
```

预期：PASS；类型检查退出码为 `0`。

- [ ] **步骤 5：提交数据模型**

```bash
git add apps/nest/src/monitoring-events/entities/monitoring-error-issue.entity.ts apps/nest/src/monitoring-events/entities/monitoring-error-suppression.entity.ts apps/nest/src/monitoring-events/monitoring-events.module.ts apps/nest/src/monitoring-events/monitoring-events.service.spec.ts
git commit -m "feat: 增加错误归档与阻止规则模型"
```

---

### 任务 2：在事件入库中执行永久阻止与按次数自动恢复

**文件：**
- 修改：`apps/nest/src/monitoring-events/monitoring-events.service.ts`
- 测试：`apps/nest/src/monitoring-events/monitoring-events.service.spec.ts`

- [ ] **步骤 1：编写三个失败的入库测试**

扩展现有内存 DataSource fixture，使其保存 suppressions，并添加：

```ts
it('drops a suppressed event without storing or incrementing it', async () => {
  app.state().suppressions.push({ projectId, environment: 'production', fingerprint });
  await app.service.ingest(projectId, publicKey, envelope);
  expect(app.state().issues).toHaveLength(0);
  expect(app.state().events).toHaveLength(0);
});

it('keeps permanent archives hidden while recording new events', async () => {
  Object.assign(app.state().issues[0], {
    visibility: MonitoringErrorIssueVisibility.ArchivedPermanent,
  });
  await app.service.ingest(projectId, publicKey, secondEnvelope);
  expect(app.state().issues[0]).toMatchObject({
    visibility: MonitoringErrorIssueVisibility.ArchivedPermanent,
    eventCount: 2,
  });
  expect(app.state().events).toHaveLength(2);
});

it('reactivates a count archive on the event that reaches its threshold', async () => {
  Object.assign(app.state().issues[0], {
    eventCount: 9,
    visibility: MonitoringErrorIssueVisibility.ArchivedUntilCount,
    archiveThreshold: 10,
  });
  await app.service.ingest(projectId, publicKey, secondEnvelope);
  expect(app.state().issues[0]).toMatchObject({
    eventCount: 10,
    visibility: MonitoringErrorIssueVisibility.Active,
    archiveThreshold: null,
    archivedAt: null,
  });
});
```

测试中的 `fingerprint` 必须用 `createErrorFingerprint` 对 fixture 事件独立计算，不能复制生产 SQL 的判断逻辑。

- [ ] **步骤 2：运行测试确认三种行为均失败**

```bash
pnpm --filter @pms/nest test -- monitoring-events/monitoring-events.service.spec.ts --runInBand
```

预期：FAIL；suppression 事件仍被保存、永久归档 fixture 无状态保持、次数归档未恢复。

- [ ] **步骤 3：实现事务内 suppression 检查**

在计算 `environment` 和 `fingerprint` 后，先取得该错误身份的事务级 advisory lock，再在 issue upsert 前调用事务 manager：

```ts
const environment = event.environment ?? 'unknown';
await manager.query(
  'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
  [`${project.id}:${environment}:${fingerprint}`],
);
const suppressed = await manager.existsBy(MonitoringErrorSuppression, {
  projectId: project.id,
  environment,
  fingerprint,
});
if (suppressed) return;
```

锁和检查必须位于当前 `dataSource.transaction` 回调内，不能先在事务外查询。后续永久删除事务取得同一个 advisory lock，使“检查后准备写入”的 ingest 与“创建阻止规则并删除”的操作串行化，消除并发重建窗口。

- [ ] **步骤 4：扩展 upsert 的原子状态转换**

在冲突更新中加入基于递增后次数的 CASE：

```sql
visibility = CASE
  WHEN monitoring_error_issues.visibility = 'archived_until_count'
   AND monitoring_error_issues.event_count + 1 >= monitoring_error_issues.archive_threshold
  THEN 'active'
  ELSE monitoring_error_issues.visibility
END,
archive_threshold = CASE
  WHEN monitoring_error_issues.visibility = 'archived_until_count'
   AND monitoring_error_issues.event_count + 1 >= monitoring_error_issues.archive_threshold
  THEN NULL
  ELSE monitoring_error_issues.archive_threshold
END,
archived_at = CASE
  WHEN monitoring_error_issues.visibility = 'archived_until_count'
   AND monitoring_error_issues.event_count + 1 >= monitoring_error_issues.archive_threshold
  THEN NULL
  ELSE monitoring_error_issues.archived_at
END
```

- [ ] **步骤 5：运行入库测试并提交**

```bash
pnpm --filter @pms/nest test -- monitoring-events/monitoring-events.service.spec.ts --runInBand
git add apps/nest/src/monitoring-events/monitoring-events.service.ts apps/nest/src/monitoring-events/monitoring-events.service.spec.ts
git commit -m "feat: 应用错误归档入库策略"
```

预期：目标测试全部通过。

---

### 任务 3：实现归档、恢复和删除管理接口

**文件：**
- 创建：`apps/nest/src/monitoring-events/dto/archive-issue.dto.ts`
- 修改：`apps/nest/src/monitoring-events/monitoring-events.service.ts`
- 修改：`apps/nest/src/monitoring-events/monitoring-issues.controller.ts`
- 测试：`apps/nest/src/monitoring-events/monitoring-events.service.spec.ts`
- 测试：`apps/nest/src/monitoring-events/monitoring-issues.controller.spec.ts`

- [ ] **步骤 1：编写失败的 DTO 与控制器转发测试**

覆盖两种合法归档 body 和非法组合：

```ts
it.each([
  [{ mode: 'permanent' }, 0],
  [{ mode: 'until_count', threshold: 10 }, 0],
  [{ mode: 'until_count', threshold: 100 }, 0],
  [{ mode: 'until_count', threshold: 1000 }, 0],
  [{ mode: 'until_count' }, 1],
  [{ mode: 'permanent', threshold: 10 }, 1],
  [{ mode: 'until_count', threshold: 50 }, 1],
])('validates archive input %p', (input, errorCount) => {
  const dto = plainToInstance(ArchiveIssueDto, input);
  expect(validateSync(dto)).toHaveLength(errorCount);
});
```

控制器测试分别断言 `archiveOwnedIssue`、`restoreOwnedIssue`、`deleteOwnedIssue`、`permanentlyDeleteOwnedIssue` 收到认证用户及完整项目作用域。

- [ ] **步骤 2：运行控制器测试确认失败**

```bash
pnpm --filter @pms/nest test -- monitoring-events/monitoring-issues.controller.spec.ts --runInBand
```

预期：FAIL，DTO、控制器方法和 service mock 方法不存在。

- [ ] **步骤 3：实现 DTO 和四个控制器路由**

DTO 使用类内自定义 `ArchiveThresholdConstraint` 同时检查 `mode` 和 `threshold`：`permanent` 必须没有 threshold，`until_count` 必须包含 `10 | 100 | 1000`。控制器增加 `Delete` 导入并提供：

```ts
@Patch(':issueId/archive')
archive(/* scope */, @Body() body: ArchiveIssueDto) { /* forward */ }

@Patch(':issueId/restore')
restore(/* scope */) { /* forward */ }

@Delete(':issueId')
@HttpCode(HttpStatus.NO_CONTENT)
remove(/* scope */) { /* forward */ }

@Delete(':issueId/permanent')
@HttpCode(HttpStatus.NO_CONTENT)
permanentlyRemove(/* scope */) { /* forward */ }
```

静态 `permanent` 路由位于动态详情路由体系内，但 HTTP method 不冲突；仍为永久删除方法保留明确的 controller 测试。

- [ ] **步骤 4：编写失败的 service 管理测试**

```ts
it('rejects a count archive threshold at or below the current count', async () => {
  await expect(service.archiveOwnedIssue(userId, group, project, issueId, {
    mode: 'until_count', threshold: 10,
  })).rejects.toThrow(BadRequestException);
});

it('restores an archived issue and clears archive metadata', async () => {
  await service.restoreOwnedIssue(userId, group, project, issueId);
  expect(repository.update).toHaveBeenCalledWith(issueId, {
    visibility: MonitoringErrorIssueVisibility.Active,
    archiveThreshold: null,
    archivedAt: null,
  });
});

it('deletes an owned issue and its cascaded events', async () => {
  await service.deleteOwnedIssue(userId, group, project, issueId);
  expect(manager.delete).toHaveBeenCalledWith(MonitoringErrorIssue, issueId);
});

it('creates suppression before permanently deleting the issue', async () => {
  await service.permanentlyDeleteOwnedIssue(userId, group, project, issueId);
  expect(manager.insert).toHaveBeenCalledWith(MonitoringErrorSuppression, {
    projectId, environment: 'production', fingerprint: issue.fingerprint,
  });
  expect(manager.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
    manager.insert.mock.invocationCallOrder[0],
  );
});
```

fixture 必须为 issue 提供真实 `fingerprint`。另加“不属于项目返回 NotFound”的测试，四个操作至少共享一个明确的所有权断言辅助函数。

- [ ] **步骤 5：实现 service 管理事务**

- 归档：查询 scoped issue；验证阈值；更新 visibility、threshold、archivedAt；返回刷新后的详情。
- 恢复：查询 scoped issue；更新 active/null/null；返回刷新后的详情。
- 普通删除：事务内 scoped 查询后删除 issue，依赖 FK cascade 清除 events。
- 永久删除：事务内 scoped 查询；取得与 ingest 相同的 project/environment/fingerprint advisory lock；先用 `orIgnore()` 插入 suppression，再删除 issue。

永久删除必须以服务端读取的 `projectId/environment/fingerprint` 为准，不接受客户端传入。

- [ ] **步骤 6：运行测试、类型检查并提交**

```bash
pnpm --filter @pms/nest test -- monitoring-events/monitoring-issues.controller.spec.ts monitoring-events/monitoring-events.service.spec.ts --runInBand
pnpm --filter @pms/nest typecheck
git add apps/nest/src/monitoring-events/dto/archive-issue.dto.ts apps/nest/src/monitoring-events/monitoring-events.service.ts apps/nest/src/monitoring-events/monitoring-issues.controller.ts apps/nest/src/monitoring-events/monitoring-events.service.spec.ts apps/nest/src/monitoring-events/monitoring-issues.controller.spec.ts
git commit -m "feat: 增加错误归档恢复与删除接口"
```

---

### 任务 4：提供已归档列表查询和响应字段

**文件：**
- 修改：`apps/nest/src/monitoring-events/dto/list-issues-query.dto.ts`
- 修改：`apps/nest/src/monitoring-events/monitoring-events.service.ts`
- 修改：`apps/nest/src/monitoring-events/monitoring-issues.controller.spec.ts`
- 修改：`apps/nest/src/monitoring-events/monitoring-events.service.spec.ts`
- 修改：`apps/vue3/src/features/monitoring/model/types.ts`
- 修改：`apps/vue3/src/features/monitoring/api/monitoring.api.ts`
- 测试：`apps/vue3/src/features/monitoring/api/__tests__/monitoring.api.spec.ts`

- [ ] **步骤 1：编写失败的列表契约测试**

DTO 测试：缺省为 active，只接受 active/archived。Service 测试：

```ts
await service.listOwnedIssues(userId, group, project, {
  page: 1, pageSize: 20, view: 'archived', search: 'vue',
});
expect(queryBuilder.andWhere).toHaveBeenCalledWith(
  'issue.visibility IN (:...visibilities)',
  { visibilities: ['archived_permanent', 'archived_until_count'] },
);
expect(result.items[0]).toMatchObject({
  visibility: 'archived_until_count',
  archiveThreshold: 100,
  archivedAt: expect.any(Date),
});
```

API 测试断言 `{ page: 1, pageSize: 20, view: 'archived', search: 'vue' }` 原样进入 Axios params。

- [ ] **步骤 2：运行后端和 API 测试确认失败**

```bash
pnpm --filter @pms/nest test -- monitoring-events/monitoring-issues.controller.spec.ts monitoring-events/monitoring-events.service.spec.ts --runInBand
pnpm --filter @pms/vue3 test -- src/features/monitoring/api/__tests__/monitoring.api.spec.ts
```

预期：FAIL，view 未验证/过滤，响应类型无归档字段。

- [ ] **步骤 3：实现 view 过滤与共享前端类型**

DTO：

```ts
@Transform(({ value }) => value ?? 'active')
@IsIn(['active', 'archived'])
view: 'active' | 'archived' = 'active';
```

Service 在 project where 后增加 visibility 条件，并让 `toIssueSummary` 返回三个归档字段。前端增加：

```ts
export type MonitoringIssueVisibility =
  | 'active'
  | 'archived_permanent'
  | 'archived_until_count'

export interface ListProjectIssuesQuery extends PageQuery {
  search?: string
  view?: 'active' | 'archived'
}
```

- [ ] **步骤 4：运行测试并提交**

```bash
pnpm --filter @pms/nest test -- monitoring-events/monitoring-issues.controller.spec.ts monitoring-events/monitoring-events.service.spec.ts --runInBand
pnpm --filter @pms/vue3 test -- src/features/monitoring/api/__tests__/monitoring.api.spec.ts
git add apps/nest/src/monitoring-events/dto/list-issues-query.dto.ts apps/nest/src/monitoring-events/monitoring-events.service.ts apps/nest/src/monitoring-events/monitoring-issues.controller.spec.ts apps/nest/src/monitoring-events/monitoring-events.service.spec.ts apps/vue3/src/features/monitoring/model/types.ts apps/vue3/src/features/monitoring/api/monitoring.api.ts apps/vue3/src/features/monitoring/api/__tests__/monitoring.api.spec.ts
git commit -m "feat: 增加已归档错误查询"
```

---

### 任务 5：在错误列表展示已归档视图和状态样式

**文件：**
- 修改：`apps/vue3/src/components/data-table/DataTable.vue`
- 修改：`apps/vue3/src/features/monitoring/views/ProjectIssuesView.vue`
- 测试：`apps/vue3/src/components/data-table/__tests__/DataTable.spec.ts`
- 测试：`apps/vue3/src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts`

- [ ] **步骤 1：编写失败的 DataTable 行样式测试**

为 DataTable 增加业务无关的 `rowClass?: (row: TData) => string | undefined` prop。测试传入两行并断言回调结果落到对应 `TableRow`：

```ts
const wrapper = mount(DataTable, {
  props: {
    columns,
    data,
    rowClass: (row) => row.id === 'archived' ? 'bg-amber-50' : undefined,
  },
});
expect(wrapper.get('tbody tr.bg-amber-50').text()).toContain('archived');
```

- [ ] **步骤 2：运行 DataTable 测试确认失败，再实现最小 prop**

```bash
pnpm --filter @pms/vue3 test -- src/components/data-table/__tests__/DataTable.spec.ts
```

在数据行上绑定：

```vue
<TableRow
  :class="rowClass?.(row.original)"
  ...
>
```

重新运行同一测试，预期 PASS。

- [ ] **步骤 3：编写失败的归档列表页面测试**

```ts
expect(wrapper.get('[data-testid="show-archived"]').text()).toBe('查看已归档');
await wrapper.get('[data-testid="show-archived"]').trigger('click');
await flushPromises();
expect(listProjectIssues).toHaveBeenLastCalledWith('team', 'web', {
  page: 1, pageSize: 20, view: 'archived',
});
expect(wrapper.get('[data-testid="archive-label-issue-1"]').text())
  .toContain('达到 100 次后恢复');
expect(wrapper.get('[data-testid="issue-row-issue-1"]').classes())
  .toContain('bg-amber-50/60');
```

再为 `archived_permanent` fixture 断言另一颜色 class 和“永久归档”标识。搜索词存在时切换视图，断言 search 仍传递且 page 回到 1。

- [ ] **步骤 4：实现列表视图切换和归档标识**

- 增加 `view = ref<'active' | 'archived'>('active')`。
- `loadIssues` 始终传递 view。
- 切换时设 `page.value = 1` 后更新 view，依赖现有 watch 加载。
- 已归档视图新增“归档方式”列；当前视图不显示该列。
- 通过 `rowClass` 返回两种确定的 class；同时提供可测试的文字 Badge，不能只用颜色表达状态。

- [ ] **步骤 5：运行页面测试、类型检查并提交**

```bash
pnpm --filter @pms/vue3 test -- src/components/data-table/__tests__/DataTable.spec.ts src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts
pnpm --filter @pms/vue3 typecheck
git add apps/vue3/src/components/data-table/DataTable.vue apps/vue3/src/components/data-table/__tests__/DataTable.spec.ts apps/vue3/src/features/monitoring/views/ProjectIssuesView.vue apps/vue3/src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts
git commit -m "feat: 增加已归档错误列表视图"
```

---

### 任务 6：在错误详情页提供归档、恢复与双重删除确认

**文件：**
- 修改：`apps/vue3/src/features/monitoring/api/monitoring.api.ts`
- 修改：`apps/vue3/src/features/monitoring/views/ProjectIssueDetailView.vue`
- 测试：`apps/vue3/src/features/monitoring/api/__tests__/monitoring.api.spec.ts`
- 测试：`apps/vue3/src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts`

- [ ] **步骤 1：编写失败的 API 请求测试**

```ts
expect(patch).toHaveBeenCalledWith(
  '/groups/team/projects/web/issues/issue-1/archive',
  { mode: 'until_count', threshold: 100 },
);
expect(patch).toHaveBeenCalledWith(
  '/groups/team/projects/web/issues/issue-1/restore',
  undefined,
);
expect(remove).toHaveBeenCalledWith('/groups/team/projects/web/issues/issue-1');
expect(remove).toHaveBeenCalledWith('/groups/team/projects/web/issues/issue-1/permanent');
```

在 `vi.hoisted` 中增加名为 `remove` 的 spy，并把 HTTP mock 写成 `{ delete: remove }`；生产 API 调用现有 `http.delete<void>(url)`，不得给 DELETE 请求附加 body。

- [ ] **步骤 2：运行 API 测试确认失败，再添加四个 API 函数**

```bash
pnpm --filter @pms/vue3 test -- src/features/monitoring/api/__tests__/monitoring.api.spec.ts
```

实现并导出 `archiveProjectIssue`、`restoreProjectIssue`、`deleteProjectIssue`、`permanentlyDeleteProjectIssue`，然后重跑至 PASS。

- [ ] **步骤 3：编写失败的详情页归档与恢复测试**

覆盖：

```ts
expect(wrapper.get('[data-testid="archive-threshold-10"]').attributes('disabled'))
  .toBeDefined(); // fixture eventCount >= 10
await wrapper.get('[data-testid="archive-threshold-100"]').trigger('click');
await wrapper.get('[data-testid="confirm-archive"]').trigger('click');
expect(archiveProjectIssue).toHaveBeenCalledWith('team', 'web', issue.id, {
  mode: 'until_count', threshold: 100,
});
```

用永久归档 fixture 重新挂载，断言归档摘要和 `restoreProjectIssue` 调用。API mock 返回完整 `MonitoringIssueDetail`，不要返回部分对象。

- [ ] **步骤 4：编写失败的普通/永久删除确认测试**

```ts
await wrapper.get('[data-testid="delete-issue"]').trigger('click');
await wrapper.get('[data-testid="confirm-delete-once"]').trigger('click');
expect(deleteProjectIssue).toHaveBeenCalledTimes(1);

await wrapper.get('[data-testid="permanent-delete-issue"]').trigger('click');
await wrapper.get('[data-testid="continue-permanent-delete"]').trigger('click');
expect(permanentlyDeleteProjectIssue).not.toHaveBeenCalled();
await wrapper.get('[data-testid="confirm-permanent-delete"]').trigger('click');
expect(permanentlyDeleteProjectIssue).toHaveBeenCalledTimes(1);
```

另测任一弹框取消都不调用 API，以及 API reject 后保留详情并显示错误。

- [ ] **步骤 5：实现详情操作和 Dialog 状态机**

- 活动错误：显示归档、删除按钮。
- 已归档错误：显示归档摘要和恢复按钮。
- 用 `archiveDialogOpen`、`deleteDialogOpen`、`permanentConfirmOpen` 分开管理弹框。
- 永久删除第一层只能打开第二层，第二层确认才调用 API。
- 所有 mutation 共用 `actionPending` 防止重复提交，但使用具体中文错误信息。
- 归档/恢复成功用返回详情替换 `issue`；删除成功用 `router.push({ name: 'project-issues', query: ... })` 返回对应列表。

- [ ] **步骤 6：运行详情测试、类型检查并提交**

```bash
pnpm --filter @pms/vue3 test -- src/features/monitoring/api/__tests__/monitoring.api.spec.ts src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts
pnpm --filter @pms/vue3 typecheck
git add apps/vue3/src/features/monitoring/api/monitoring.api.ts apps/vue3/src/features/monitoring/api/__tests__/monitoring.api.spec.ts apps/vue3/src/features/monitoring/views/ProjectIssueDetailView.vue apps/vue3/src/features/monitoring/views/__tests__/ProjectIssueViews.spec.ts
git commit -m "feat: 增加错误详情归档与删除操作"
```

---

### 任务 7：补齐 HTTP 契约并执行全量验证

**文件：**
- 修改：`apps/nest/test/app.e2e-spec.ts`
- 修改：`apps/nest/README.md`
- 修改：`apps/vue3/README.md`

- [ ] **步骤 1：编写失败的 e2e 契约测试**

在现有内存 service mock 中加入新方法，覆盖：

```ts
await request(app.getHttpServer())
  .patch(`/groups/acme-team/projects/web/issues/${issueId}/archive`)
  .set('Authorization', `Bearer ${ownerToken}`)
  .send({ mode: 'until_count', threshold: 100 })
  .expect(200);

await request(app.getHttpServer())
  .delete(`/groups/acme-team/projects/web/issues/${issueId}/permanent`)
  .set('Authorization', `Bearer ${ownerToken}`)
  .expect(204);
```

对未认证请求断言 `401`，对其他用户项目断言现有 ownership 行为对应的 `404`。

- [ ] **步骤 2：运行 e2e 测试确认路由契约失败**

```bash
pnpm --filter @pms/nest test:e2e -- --runInBand
```

预期：FAIL，mock 或路由尚未完整匹配契约时给出明确状态码/调用错误。

- [ ] **步骤 3：完善 e2e mock 与 README 接口说明**

README 明确记录：列表 `view` 参数、四个详情操作端点、三种阈值、永久删除不可恢复且未来事件被丢弃。不得把 README 当作行为测试替代品。

- [ ] **步骤 4：运行全量验证**

```bash
pnpm --filter @pms/nest test -- --runInBand
pnpm --filter @pms/nest test:e2e -- --runInBand
pnpm --filter @pms/nest typecheck
pnpm --filter @pms/nest lint
pnpm --filter @pms/vue3 test
pnpm --filter @pms/vue3 typecheck
pnpm --filter @pms/vue3 lint
git diff --check
```

预期：所有命令退出码为 `0`，测试输出无失败，`git diff --check` 无输出。

- [ ] **步骤 5：对照规格进行人工验收核对**

- 当前错误列表只显示 active。
- 已归档入口可访问两种归档记录并用文字与不同颜色区分。
- 搜索和分页在两个视图分别工作。
- 永久归档继续累计但不自动恢复。
- 次数归档在 10/100/1000 阈值准确恢复。
- 普通删除后同类错误可重新创建。
- 永久删除必须双重确认，且之后事件不入库。
- 列表没有行级归档或删除按钮。

- [ ] **步骤 6：提交文档与 e2e 验证**

```bash
git add apps/nest/test/app.e2e-spec.ts apps/nest/README.md apps/vue3/README.md
git commit -m "test: 验证错误归档与删除流程"
```
