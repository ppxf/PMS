import { Baseline1793577600000 } from '../database/migrations/1793577600000-baseline';
import { WebVitals1793923200000 } from '../database/migrations/1793923200000-web-vitals';
import { ProjectAccess1794355200000 } from '../database/migrations/1794355200000-project-access';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { WorkspaceAlerts1794441600001 } from '../database/migrations/1794441600001-workspace-alerts';
import { WorkspaceService } from './workspace.service';

// Opt in with WORKSPACE_TEST_DATABASE_URL pointing at a disposable PostgreSQL database.
const integration = process.env.WORKSPACE_TEST_DATABASE_URL
  ? describe
  : describe.skip;
integration('workspace PostgreSQL contracts', () => {
  let db: DataSource;
  let service: WorkspaceService;
  const schema = `workspace_test_${randomUUID().replaceAll('-', '')}`;
  const owner = randomUUID(),
    member = randomUUID(),
    outsider = randomUUID(),
    project = randomUUID(),
    other = randomUUID(),
    group = randomUUID(),
    issue = randomUUID();
  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      url: process.env.WORKSPACE_TEST_DATABASE_URL,
      extra: { options: `-c search_path=${schema},public` },
    });
    await db.initialize();
    await db.query(`CREATE SCHEMA ${schema}`);
    const runner = db.createQueryRunner();
    await new Baseline1793577600000().up(runner);
    await new WebVitals1793923200000().up(runner);
    await new ProjectAccess1794355200000().up(runner);
    await new WorkspaceAlerts1794441600001().up(runner);
    await runner.release();
    await db.query(
      `INSERT INTO users(id,email,password_hash,name) VALUES($1,'owner@example.com','hash','Owner'),($2,'member@example.com','hash','Member'),($3,'outsider@example.com','hash','Outsider')`,
      [owner, member, outsider],
    );
    await db.query(
      `INSERT INTO groups(id,owner_id,name,slug) VALUES($1,$2,'Group','group')`,
      [group, owner],
    );
    await db.query(
      `INSERT INTO monitoring_projects(id,owner_id,group_id,name,slug,platform,public_key) VALUES($1,$3,$4,'Visible','visible','vue','visible-key'),($2,$5,$4,'Hidden','hidden','vue','hidden-key')`,
      [project, other, owner, group, outsider],
    );
    await db.query(
      `INSERT INTO project_members(id,project_id,user_id,permissions) VALUES($1,$2,$3,'["project:logs:read"]')`,
      [randomUUID(), project, member],
    );
    await db.query(
      `INSERT INTO monitoring_error_issues(id,project_id,title,fingerprint,exception_type,first_seen_at,last_seen_at) VALUES($1,$2,'Visible error',repeat('a',64),'Error',now(),now()),($3,$4,'Hidden error',repeat('b',64),'Error',now(),now())`,
      [issue, project, randomUUID(), other],
    );
    service = new WorkspaceService(db);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.destroy();
    }
  });
  it('filters actual issue rows by matching read permission and paginates', async () => {
    expect((await service.issues(member, {})).total).toBe(0);
    const result = await service.issues(owner, { pageSize: '1' });
    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('Visible error');
    expect(result.items[0]).not.toHaveProperty('publicKey');
  });
  it('queries all actual ingestion table layouts', async () => {
    const ingestion = await service.ingestion(owner, {});
    expect(ingestion.total).toBe(1);
    expect(ingestion.items[0].signals).toHaveLength(6);
  });
  it('requires ownership and persists idempotent new-issue alerts', async () => {
    await expect(
      service.createRule(member, {
        projectId: project,
        name: 'Denied',
        kind: 'new_issue',
      }),
    ).rejects.toThrow('Project owner');
    const rule = await service.createRule(owner, {
      projectId: project,
      name: 'New issue',
      kind: 'new_issue',
    });
    // Rule creation establishes the lower bound; simulate an issue arriving afterwards.
    await db.query(
      `UPDATE monitoring_error_issues SET created_at=now() WHERE id=$1`,
      [issue],
    );
    await service.evaluateAlerts();
    await service.evaluateAlerts();
    const result = await service.alerts(owner, {});
    expect(result.total).toBe(1);
    expect(result.items[0].ruleId).toBe(rule.id);
    await expect(
      service.acknowledge(member, result.items[0].id),
    ).rejects.toThrow('Alert not found');
    await service.acknowledge(owner, result.items[0].id);
    await db.query(
      `UPDATE monitoring_error_issues SET status='resolved' WHERE id=$1`,
      [issue],
    );
    await service.evaluateAlerts();
    expect((await service.alerts(owner, {})).items[0].status).toBe('recovered');
  });
  it('deduplicates threshold episodes and permits a new episode after recovery', async () => {
    await service.createRule(owner, {
      projectId: project,
      name: 'Threshold',
      kind: 'error_threshold',
      threshold: 1,
      windowMinutes: 1,
    });
    await db.query(
      `INSERT INTO monitoring_events(id,project_id,issue_id,timestamp,received_at,source,level,message,exception_type,exception_value) VALUES($1,$2,$3,now(),now(),'sdk','error','error','Error','error')`,
      [randomUUID(), project, issue],
    );
    await service.evaluateAlerts();
    await service.evaluateAlerts();
    const count = async () =>
      Number(
        (
          await db.query(
            `SELECT count(*) AS n FROM workspace_alerts WHERE kind='error_threshold'`,
          )
        )[0].n,
      );
    expect(await count()).toBe(1);
    await db.query(
      `UPDATE monitoring_events SET received_at=now()-interval '2 minutes'`,
    );
    await service.evaluateAlerts();
    await db.query(
      `INSERT INTO monitoring_events(id,project_id,issue_id,timestamp,received_at,source,level,message,exception_type,exception_value) VALUES($1,$2,$3,now(),now(),'sdk','error','error','Error','error')`,
      [randomUUID(), project, issue],
    );
    await service.evaluateAlerts();
    expect(await count()).toBe(2);
  });
  it('persists separate reopened episodes and recovers disabled rules', async () => {
    const rule = await service.createRule(owner, {
      projectId: project,
      name: 'Reopened',
      kind: 'reopened_issue',
    });
    await db.query(
      `UPDATE monitoring_error_issues SET reopened_at=now(),status='unresolved' WHERE id=$1`,
      [issue],
    );
    await service.evaluateAlerts();
    await service.evaluateAlerts();
    let rows = await db.query(
      `SELECT id FROM workspace_alerts WHERE rule_id=$1`,
      [rule.id],
    );
    expect(rows).toHaveLength(1);
    await db.query(
      `UPDATE monitoring_error_issues SET reopened_at=now() WHERE id=$1`,
      [issue],
    );
    await service.evaluateAlerts();
    rows = await db.query(`SELECT id FROM workspace_alerts WHERE rule_id=$1`, [
      rule.id,
    ]);
    expect(rows).toHaveLength(2);
    await service.updateRule(owner, rule.id, { enabled: false });
    await service.evaluateAlerts();
    expect(
      await db.query(
        `SELECT id FROM workspace_alerts WHERE rule_id=$1 AND status='open'`,
        [rule.id],
      ),
    ).toHaveLength(0);
  });
});
