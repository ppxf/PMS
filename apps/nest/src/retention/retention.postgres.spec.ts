import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import appSource from '../database/data-source';
import { RetentionService } from './retention.service';

const url =
  process.env.RETENTION_TEST_DATABASE_URL ??
  process.env.MIGRATIONS_TEST_DATABASE_URL;
(url ? describe : describe.skip)('real PostgreSQL retention boundaries', () => {
  const schema = `retention_test_${randomUUID().replaceAll('-', '')}`;
  let admin: DataSource;
  let db: DataSource;
  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({
      type: 'postgres',
      url,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      migrations: appSource.options.migrations,
      synchronize: false,
      installExtensions: false,
    }).initialize();
    await db.runMigrations();
  }, 20000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.destroy();
      }
    }
  });
  it('counts without deleting, batches expired rows and preserves latest evidence and recently updated vitals', async () => {
    const user = randomUUID(),
      group = randomUUID(),
      project = randomUUID(),
      issue = randomUUID();
    const latest = randomUUID(),
      expired = randomUUID();
    const activePage = randomUUID(),
      expiredPage = randomUUID(),
      emptyPage = randomUUID();
    const old = '2026-09-01T00:00:00Z',
      recent = '2026-11-11T00:00:00Z';
    await db.query(
      `INSERT INTO users(id,email,password_hash,name) VALUES($1,'retention@example.test','hash','test')`,
      [user],
    );
    await db.query(
      `INSERT INTO groups(id,owner_id,name,slug) VALUES($1,$2,'test','test')`,
      [group, user],
    );
    await db.query(
      `INSERT INTO monitoring_projects(id,group_id,owner_id,name,slug,platform,public_key) VALUES($1,$2,$3,'test','test','vue','test')`,
      [project, group, user],
    );
    await db.query(
      `INSERT INTO monitoring_error_issues(id,project_id,fingerprint,title,exception_type,first_seen_at,last_seen_at) VALUES($1,$2,$3,'error','Error',$4,$4)`,
      [issue, project, 'a'.repeat(64), old],
    );
    for (const id of [latest, expired])
      await db.query(
        `INSERT INTO monitoring_events(id,project_id,issue_id,timestamp,received_at,source,level,message,exception_type,exception_value) VALUES($1,$2,$3,$4,$4,'vue','error','error','Error','error')`,
        [id, project, issue, old],
      );
    await db.query(
      'UPDATE monitoring_error_issues SET latest_event_id=$1 WHERE id=$2',
      [latest, issue],
    );
    for (const id of [activePage, expiredPage, emptyPage])
      await db.query(
        `INSERT INTO monitoring_page_views(project_id,id,started_at,dimensions,received_at) VALUES($1,$2,$3,'{}',$3)`,
        [project, id, old],
      );
    for (const [id, time] of [
      [activePage, recent],
      [expiredPage, old],
    ])
      await db.query(
        `INSERT INTO monitoring_web_vitals(project_id,page_view_id,name,metric_id,revision,value,observed_at,attribution,received_at) VALUES($1,$2,'LCP','metric',1,100,$3,'{}',$3)`,
        [project, id, time],
      );
    const service = new RetentionService(
      db,
      new ConfigService({ retention: { batchSize: 1 } }),
    );
    const dry = await service.cleanup(false, new Date('2026-11-12T00:00:00Z'));
    expect(dry.counts.monitoring_events).toBe(1);
    expect(dry.counts.monitoring_page_views).toBe(2);
    expect(await db.query('SELECT id FROM monitoring_events')).toHaveLength(2);
    const executed = await service.cleanup(
      true,
      new Date('2026-11-12T00:00:00Z'),
    );
    expect(executed.counts.monitoring_events).toBe(1);
    expect(await db.query('SELECT id FROM monitoring_events')).toEqual([
      { id: latest },
    ]);
    expect(await db.query('SELECT id FROM monitoring_page_views')).toEqual([
      { id: activePage },
    ]);
    expect(
      await db.query('SELECT page_view_id FROM monitoring_web_vitals'),
    ).toEqual([{ page_view_id: activePage }]);
  });
  it('does not cascade a vital whose revision is being refreshed by another transaction', async () => {
    const [{ id: project }]: { id: string }[] = await db.query(
      'SELECT id FROM monitoring_projects LIMIT 1',
    );
    const page = randomUUID();
    await db.query(
      `INSERT INTO monitoring_page_views(project_id,id,started_at,dimensions,received_at) VALUES($1,$2,'2026-09-01','{}','2026-09-01')`,
      [project, page],
    );
    await db.query(
      `INSERT INTO monitoring_web_vitals(project_id,page_view_id,name,metric_id,revision,value,observed_at,attribution,received_at) VALUES($1,$2,'LCP','metric',1,100,'2026-09-01','{}','2026-09-01')`,
      [project, page],
    );
    const writer = db.createQueryRunner();
    await writer.connect();
    await writer.startTransaction();
    try {
      await writer.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`vitals:${project}:${page}`],
      );
      await writer.query(
        `UPDATE monitoring_web_vitals SET received_at='2026-11-11',revision=2 WHERE project_id=$1 AND page_view_id=$2`,
        [project, page],
      );
      await new RetentionService(
        db,
        new ConfigService({ retention: { batchSize: 1 } }),
      ).cleanup(true, new Date('2026-11-12T00:00:00Z'));
      await writer.commitTransaction();
    } finally {
      if (writer.isTransactionActive) await writer.rollbackTransaction();
      await writer.release();
    }
    expect(
      await db.query('SELECT id FROM monitoring_page_views WHERE id=$1', [
        page,
      ]),
    ).toHaveLength(1);
    expect(
      await db.query(
        'SELECT revision FROM monitoring_web_vitals WHERE page_view_id=$1',
        [page],
      ),
    ).toEqual([{ revision: '2' }]);
  });
});
