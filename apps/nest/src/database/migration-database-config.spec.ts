import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const databaseVariables = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_NAME',
] as const;

describe('loadMigrationDatabaseConfig', () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'pms-migration-env-'));
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  function runLoader(shellVariables: Record<string, string> = {}) {
    const environment = { ...process.env };
    for (const name of databaseVariables) {
      delete environment[name];
    }

    return spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-e',
        'const { loadMigrationDatabaseConfig } = require(process.argv[1]); console.log(JSON.stringify(loadMigrationDatabaseConfig(process.argv[2])));',
        join(__dirname, 'migration-database-config'),
        fixtureRoot,
      ],
      {
        cwd: join(__dirname, '../..'),
        env: { ...environment, ...shellVariables },
        encoding: 'utf8',
      },
    );
  }

  it('loads .env.local first, fills gaps from .env, and preserves shell values', () => {
    writeFileSync(
      join(fixtureRoot, '.env.local'),
      'DB_HOST=local-db\nDB_NAME=local-pms\n',
    );
    writeFileSync(
      join(fixtureRoot, '.env'),
      'DB_HOST=base-db\nDB_PORT=5433\nDB_USERNAME=base-user\nDB_PASSWORD=base-password\nDB_NAME=base-pms\n',
    );
    const result = runLoader({ DB_PASSWORD: 'shell-password' });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      host: 'local-db',
      port: 5433,
      username: 'base-user',
      password: 'shell-password',
      name: 'local-pms',
    });
  });

  it('throws synchronously with every missing database variable name', () => {
    const result = runLoader();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing database environment variables: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME',
    );
  });
});
