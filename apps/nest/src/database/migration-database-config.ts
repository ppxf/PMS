import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationDatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
}

const requiredVariables = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_NAME',
] as const;

export function loadMigrationDatabaseConfig(
  appRoot: string,
): MigrationDatabaseConfig {
  for (const filename of ['.env.local', '.env']) {
    const envFile = join(appRoot, filename);
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile);
    }
  }

  const missing = requiredVariables.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing database environment variables: ${missing.join(', ')}`,
    );
  }

  return {
    host: process.env.DB_HOST as string,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME as string,
    password: process.env.DB_PASSWORD as string,
    name: process.env.DB_NAME as string,
  };
}
