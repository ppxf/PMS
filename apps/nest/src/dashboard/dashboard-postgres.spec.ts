import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Dashboard PostgreSQL aggregation', () => {
  const schema = `dashboard_test_${randomUUID().replaceAll('-', '')}`;
  const owner = randomUUID(),
    member = randomUUID(),
    outsider = randomUUID();
  const group = randomUUID(),
    otherGroup = randomUUID();
  const p1 = randomUUID(),
    p2 = randomUUID(),
    p3 = randomUUID();
  const i1 = randomUUID(),
    i2 = randomUUID(),
    i3 = randomUUID();
  const now = new Date('2026-11-11T12:00:00Z');
  let admin: DataSource, db: DataSource, service: DashboardService;
  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({
      type: 'postgres',
      url,
      schema,
      extra: { options: `-c search_path=${schema},public` },
    }).initialize();
    await db.query(
      'CREATE TABLE groups (id uuid PRIMARY KEY, name text, slug text)',
    );
    await db.query(
      'CREATE TABLE monitoring_projects (id uuid PRIMARY KEY, owner_id uuid, group_id uuid, name text, slug text, platform text, last_seen_at timestamptz)',
    );
    await db.query(
      'CREATE TABLE project_members (id uuid PRIMARY KEY, project_id uuid, user_id uuid, permissions jsonb)',
    );
    await db.query(
      'CREATE TABLE monitoring_error_issues (id uuid PRIMARY KEY, project_id uuid, title text, status text, visibility text, event_count integer, first_seen_at timestamptz, last_seen_at timestamptz, reopened_at timestamptz)',
    );
    await db.query(
      'CREATE TABLE monitoring_events (project_id uuid, timestamp timestamptz)',
    );
    await db.query('INSERT INTO groups VALUES ($1, $3, $3), ($2, $4, $4)', [
      group,
      otherGroup,
      'Team',
      'Other',
    ]);
    await db.query(
      `INSERT INTO monitoring_projects VALUES
      ($1,$4,$5,'Web','web','vue',$7), ($2,$4,$5,'Admin','admin','vue',NULL), ($3,$6,$8,'Private','private','vue',NULL)`,
      [p1, p2, p3, owner, group, outsider, now, otherGroup],
    );
    await db.query(
      `INSERT INTO project_members VALUES ($1,$3,$5,'["project:issues:read"]'), ($2,$4,$5,'["project:traces:read"]')`,
      [randomUUID(), randomUUID(), p1, p2, member],
    );
    await db.query(
      `INSERT INTO monitoring_error_issues VALUES
      ($1,$4,'New error','unresolved','active',3,'2026-11-11T10:00:00Z','2026-11-11T11:00:00Z',NULL),
      ($2,$4,'Archived','unresolved','archived_permanent',1,'2026-11-09T10:00:00Z','2026-11-11T11:00:00Z',NULL),
      ($3,$5,'Restricted','unresolved','active',1,'2026-11-11T10:00:00Z','2026-11-11T11:00:00Z',NULL)`,
      [i1, i2, i3, p1, p2],
    );
    // Start is inclusive; end is exclusive. Include an inaccessible project's event.
    await db.query(
      `INSERT INTO monitoring_events VALUES
      ($1,'2026-11-10T12:00:00Z'), ($1,'2026-11-11T11:59:59Z'),
      ($1,'2026-11-11T12:00:00Z'), ($1,'2026-11-10T11:59:59Z'),
      ($2,'2026-11-11T10:00:00Z'), ($3,'2026-11-11T10:00:00Z')`,
      [p1, p2, p3],
    );
    service = new DashboardService(db);
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) {
      try {
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.destroy();
      }
    }
  });
  it('uses event time boundaries, excludes archived backlog, and isolates permissions', async () => {
    const result = await service.overview(member, '24h', undefined, now);
    expect(result.totals).toEqual({
      projects: 2,
      connected: 1,
      unresolved: 1,
      events: 2,
      newIssues: 1,
    });
    expect(result.issues.map((i) => i.title)).toEqual(['New error']);
    expect(result.projects.find((p) => p.id === p2)?.events).toBeNull();
    expect(result.series[0]?.count).toBe(1);
    expect(result.series[23]?.count).toBe(1);
    expect(result.groups.map((g) => g.name)).toEqual(['Team']);
  });
  it('includes all owner projects but no unrelated data and filters groups', async () => {
    expect(
      (await service.overview(owner, '24h', undefined, now)).totals.events,
    ).toBe(3);
    const denied = await service.overview(member, '7d', otherGroup, now);
    expect(denied.projects).toEqual([]);
    expect(denied.issues).toEqual([]);
    expect(denied.series.every((p) => p.count === 0)).toBe(true);
  });
});
