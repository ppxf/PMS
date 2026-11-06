import { WebVitals1793923200000 } from './migrations/1793923200000-web-vitals';
import { DataSource, QueryRunner } from 'typeorm';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Baseline1793577600000 } from './migrations/1793577600000-baseline';

// Opt in with a disposable PostgreSQL database. All objects use a fresh schema.
const databaseUrl = process.env.MIGRATIONS_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('complete PostgreSQL baseline', () => {
  let admin: DataSource;
  let source: DataSource;
  const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    admin = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
    }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    source = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: [resolve(__dirname, '../**/*.entity.ts')],
      migrations: [Baseline1793577600000, WebVitals1793923200000],
      migrationsTableName: 'pms_migrations',
      synchronize: false,
      installExtensions: false,
    }).initialize();
    // TypeORM 1.1 strips ::jsonb from catalog defaults, but compares function
    // defaults as raw SQL. Compare JSON values instead, preserving semantics.
    for (const entity of source.entityMetadatas) {
      for (const column of entity.columns) {
        if (column.type === 'jsonb' && typeof column.default === 'function') {
          const expression = column.default();
          if (!/^'.*'::jsonb$/.test(expression)) {
            throw new Error(`Unexpected JSONB default: ${expression}`);
          }
          column.default = JSON.parse(expression.slice(1, -8)) as unknown;
        }
      }
    }
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    if (admin?.isInitialized) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.destroy();
      }
    }
  });

  it('creates every entity without schema drift, tracks execution and supports down/up', async () => {
    expect(await source.runMigrations()).toHaveLength(2);
    expect(source.entityMetadatas).toHaveLength(16);
    expect((await source.driver.createSchemaBuilder().log()).upQueries).toEqual(
      [],
    );
    expect(await source.runMigrations()).toHaveLength(0);
    await source.undoLastMigration();
    await source.undoLastMigration();
    const tables: { table_name: string }[] = await source.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
      [schema],
    );
    expect(tables.map((row) => row.table_name)).toEqual(['pms_migrations']);
    expect(await source.runMigrations()).toHaveLength(2);
    expect((await source.driver.createSchemaBuilder().log()).upQueries).toEqual(
      [],
    );
  });
});

describe('baseline safety', () => {
  it('propagates conflicting existing schema errors instead of marking partial migrations complete', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('already exists'));
    await expect(
      new Baseline1793577600000().up({ query } as unknown as QueryRunner),
    ).rejects.toThrow('already exists');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
