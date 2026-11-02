import 'reflect-metadata';
import { resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';
import { Baseline1793577600000 } from './migrations/1793577600000-baseline';

// Resolve env files relative to the API package, even when called from the repo root.
const packageRoot = resolve(__dirname, '../..');
void ConfigModule.forRoot({
  envFilePath: [
    resolve(packageRoot, '.env.local'),
    resolve(packageRoot, '.env'),
  ],
  expandVariables: true,
});
const { database } = configuration();

export default new DataSource({
  type: 'postgres',
  host: database.host,
  port: database.port,
  username: database.username,
  password: database.password,
  database: database.name,
  entities: [resolve(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [Baseline1793577600000],
  migrationsTableName: 'pms_migrations',
  migrationsTransactionMode: 'all',
  synchronize: false,
  installExtensions: false,
  migrationsRun: false,
  logging: database.logging,
});
