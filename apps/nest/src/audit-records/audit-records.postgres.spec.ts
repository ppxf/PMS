import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Baseline1793577600000 } from '../database/migrations/1793577600000-baseline';
import { ProjectAccess1794355200000 } from '../database/migrations/1794355200000-project-access';
import { AuditRecords1794441600000 } from '../database/migrations/1794441600000-audit-records';
import { AuditRecord } from './audit-record.entity';
import { AuditRecordsService } from './audit-records.service';

const integration =
  process.env.WORKSPACE_TEST_DATABASE_URL || process.env.AUDIT_TEST_DATABASE
    ? describe
    : describe.skip;
integration('audit PostgreSQL authorization and durability', () => {
  let db: DataSource;
  let service: AuditRecordsService;
  const schema = `audit_test_${randomUUID().replaceAll('-', '')}`;
  const owner = randomUUID(),
    member = randomUUID(),
    outsider = randomUUID(),
    group = randomUUID(),
    project = randomUUID(),
    issue = randomUUID();
  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      ...(process.env.WORKSPACE_TEST_DATABASE_URL
        ? { url: process.env.WORKSPACE_TEST_DATABASE_URL }
        : {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT),
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
          }),
      entities: [AuditRecord],
      schema,
      extra: { options: `-c search_path=${schema},public` },
    });
    await db.initialize();
    await db.query(`CREATE SCHEMA ${schema}`);
    const runner = db.createQueryRunner();
    await new Baseline1793577600000().up(runner);
    await new ProjectAccess1794355200000().up(runner);
    await new AuditRecords1794441600000().up(runner);
    await runner.release();
    await db.query(
      `INSERT INTO users(id,email,password_hash,name) VALUES ($1,'owner@audit.test','hash','Owner'),($2,'member@audit.test','hash','Member'),($3,'outsider@audit.test','hash','Outsider')`,
      [owner, member, outsider],
    );
    await db.query(
      `INSERT INTO groups(id,owner_id,name,slug) VALUES($1,$2,'Audit group','audit')`,
      [group, owner],
    );
    await db.query(
      `INSERT INTO monitoring_projects(id,owner_id,group_id,name,slug,platform,public_key) VALUES($1,$2,$3,'Audit project','audit','vue','private-public-key')`,
      [project, owner, group],
    );
    await db.query(
      `INSERT INTO project_members(project_id,user_id,permissions) VALUES($1,$2,'["project:logs:read"]')`,
      [project, member],
    );
    service = new AuditRecordsService(db.getRepository(AuditRecord), db);
    await service.record({
      actorId: owner,
      actorName: 'Owner',
      projectId: project,
      projectName: 'Audit project',
      projectOwnerId: owner,
      groupId: group,
      groupName: 'Audit group',
      objectType: 'project',
      action: 'project.update',
      result: 'success',
      statusCode: 200,
      requestId: randomUUID(),
      summary: {},
    });
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.destroy();
    }
  });
  it('requires audit permission and applies it before user filters', async () => {
    expect((await service.list(member, {})).total).toBe(0);
    expect((await service.list(outsider, { projectId: project })).total).toBe(
      0,
    );
    await db.query(
      `UPDATE project_members SET permissions='["project:audit:read"]' WHERE user_id=$1`,
      [member],
    );
    expect((await service.list(member, { pageSize: '1' })).total).toBe(1);
    expect(
      (await service.list(owner, { action: 'project.update', actor: 'Owner' }))
        .total,
    ).toBe(1);
    expect((await service.capabilities(member)).canRead).toBe(true);
  });
  it('atomically records only actual auto-resolutions once', async () => {
    await db.query(
      `INSERT INTO monitoring_error_issues(id,project_id,title,fingerprint,exception_type,environment,first_seen_at,last_seen_at) VALUES($1,$2,'Do not capture issue payload',repeat('a',64),'Error','production',now()-interval '10 days',now()-interval '9 days')`,
      [issue, project],
    );
    const now = new Date();
    const cutoff = new Date(now.getTime() - 7 * 86400000);
    expect(await service.resolveInactiveProductionIssues(now, cutoff)).toBe(1);
    expect(await service.resolveInactiveProductionIssues(now, cutoff)).toBe(0);
    const result = await service.list(owner, { action: 'issue.auto_resolve' });
    expect(result.total).toBe(1);
    expect(result.items[0].objectId).toBe(issue);
    expect(JSON.stringify(result)).not.toContain(
      'Do not capture issue payload',
    );
  });
  it('keeps snapshots available to the owner after cascading object deletion', async () => {
    await db.query('DELETE FROM groups WHERE id=$1', [group]);
    const result = await service.list(owner, { projectId: project });
    expect(result.total).toBe(2);
    expect(result.items[0].projectName).toBe('Audit project');
    expect((await service.list(member, {})).total).toBe(0);
    expect((await service.capabilities(owner)).canRead).toBe(true);
  });
});
