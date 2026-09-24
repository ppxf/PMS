import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Group } from '../groups/entities/group.entity';
import { GroupsService } from '../groups/groups.service';
import { CreateMonitoringEvents1790125200000 } from '../database/migrations/1790125200000-CreateMonitoringEvents';
import {
  MonitoringPlatform,
  MonitoringProject,
} from '../monitoring-projects/entities/monitoring-project.entity';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { IngestEnvelopeDto } from './dto/ingest-envelope.dto';
import { MonitoringErrorIssue } from './entities/monitoring-error-issue.entity';
import { MonitoringEvent } from './entities/monitoring-event.entity';
import { MonitoringEventsService } from './monitoring-events.service';

const databaseConfig = {
  host: process.env.TEST_DATABASE_HOST,
  port: Number(process.env.TEST_DATABASE_PORT),
  username: process.env.TEST_DATABASE_USERNAME,
  password: process.env.TEST_DATABASE_PASSWORD,
  database: process.env.TEST_DATABASE_NAME,
};
const databaseVariables = {
  host: 'TEST_DATABASE_HOST',
  port: 'TEST_DATABASE_PORT',
  username: 'TEST_DATABASE_USERNAME',
  password: 'TEST_DATABASE_PASSWORD',
  database: 'TEST_DATABASE_NAME',
} as const;

function requireDisposableDatabase(): {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
} {
  const missing = Object.entries(databaseConfig)
    .filter(
      ([, value]) => value === undefined || value === '' || Number.isNaN(value),
    )
    .map(([name]) => databaseVariables[name as keyof typeof databaseVariables]);
  if (missing.length > 0) {
    throw new Error(
      `Missing PostgreSQL integration variables: ${missing.join(', ')}`,
    );
  }
  const databaseName = databaseConfig.database as string;
  if (!/^pms_integration_test(?:_|$)/u.test(databaseName)) {
    throw new Error(
      'TEST_DATABASE_NAME must name a disposable database matching pms_integration_test*',
    );
  }
  return databaseConfig as {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
}

function eventEnvelope(
  eventId: string,
  environment: string,
): IngestEnvelopeDto {
  return {
    version: 1,
    type: 'event',
    sentAt: '2026-09-24T01:00:00.000Z',
    event: {
      eventId,
      timestamp: '2026-09-24T01:00:00.000Z',
      type: 'error',
      level: 'error',
      source: 'vue',
      message: 'Checkout failed',
      exception: {
        type: 'Error',
        value: 'Checkout failed',
        stacktrace:
          'Error: Checkout failed\n    at submitOrder (checkout.ts:10:2)',
      },
      url: 'https://app.example.test/checkout',
      environment,
      release: `web@${environment}`,
      tags: { component: 'CheckoutView' },
    },
  };
}

describe('MonitoringEventsService PostgreSQL integration', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;
  let migration: CreateMonitoringEvents1790125200000;
  let service: MonitoringEventsService;
  let ownerId: string;
  let otherOwnerId: string;
  let project: MonitoringProject;
  let firstEventId: string;
  let secondEventId: string;

  beforeAll(async () => {
    const safeDatabaseConfig = requireDisposableDatabase();
    dataSource = new DataSource({
      type: 'postgres',
      ...safeDatabaseConfig,
      synchronize: false,
      dropSchema: false,
      entities: [
        User,
        Group,
        MonitoringProject,
        MonitoringErrorIssue,
        MonitoringEvent,
      ],
    });
    await dataSource.initialize();

    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await dataSource.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        email varchar NOT NULL UNIQUE,
        password_hash varchar NOT NULL,
        name varchar NOT NULL,
        status varchar NOT NULL,
        permissions text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query(`
      CREATE TABLE groups (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name varchar NOT NULL,
        slug varchar NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (owner_id, slug)
      )
    `);
    await dataSource.query(`
      CREATE TABLE monitoring_projects (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        name varchar NOT NULL,
        slug varchar NOT NULL,
        platform varchar NOT NULL,
        error_monitoring_enabled boolean NOT NULL DEFAULT true,
        logging_enabled boolean NOT NULL DEFAULT false,
        tracing_enabled boolean NOT NULL DEFAULT false,
        metrics_enabled boolean NOT NULL DEFAULT false,
        public_key varchar(64) NOT NULL UNIQUE,
        last_seen_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (group_id, slug)
      )
    `);

    migration = new CreateMonitoringEvents1790125200000();
    const queryRunner = dataSource.createQueryRunner();
    try {
      await migration.up(queryRunner);
    } finally {
      await queryRunner.release();
    }

    ownerId = randomUUID();
    otherOwnerId = randomUUID();
    const userRepository = dataSource.getRepository(User);
    await userRepository.insert([
      {
        id: ownerId,
        email: 'owner@integration.test',
        passwordHash: 'unused',
        name: 'Owner',
        status: UserStatus.Active,
        permissions: [],
      },
      {
        id: otherOwnerId,
        email: 'other@integration.test',
        passwordHash: 'unused',
        name: 'Other',
        status: UserStatus.Active,
        permissions: [],
      },
    ]);
    const group = await dataSource.getRepository(Group).save({
      id: randomUUID(),
      ownerId,
      name: 'Integration Team',
      slug: 'integration-team',
    });
    project = await dataSource.getRepository(MonitoringProject).save({
      id: randomUUID(),
      groupId: group.id,
      name: 'Integration Web',
      slug: 'integration-web',
      platform: MonitoringPlatform.Vue,
      errorMonitoringEnabled: true,
      loggingEnabled: false,
      tracingEnabled: false,
      metricsEnabled: false,
      publicKey: 'postgres-integration-public-key',
      lastSeenAt: null,
    });

    const groups = new GroupsService(dataSource.getRepository(Group));
    const projects = new MonitoringProjectsService(
      dataSource.getRepository(MonitoringProject),
      groups,
      new ConfigService({
        monitoring: { publicUrl: 'https://monitoring.integration.test' },
      }),
    );
    service = new MonitoringEventsService(dataSource, projects);
    firstEventId = randomUUID();
    secondEventId = randomUUID();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    const queryRunner = dataSource.createQueryRunner();
    try {
      await migration.down(queryRunner);
      const [tables] = (await queryRunner.query(
        `SELECT to_regclass('monitoring_error_issues')::text AS issues,
                to_regclass('monitoring_events')::text AS events`,
      )) as [{ issues: string | null; events: string | null }];
      expect(tables).toEqual({ issues: null, events: null });
    } finally {
      await queryRunner.release();
      await dataSource.query('DROP TABLE monitoring_projects');
      await dataSource.query('DROP TABLE groups');
      await dataSource.query('DROP TABLE users');
      await dataSource.destroy();
    }
  });

  it('executes migration up and groups two real events into one issue', async () => {
    await service.ingest(
      project.id,
      project.publicKey,
      eventEnvelope(firstEventId, 'production'),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.ingest(
      project.id,
      project.publicKey,
      eventEnvelope(secondEventId, 'staging'),
    );

    expect(await dataSource.getRepository(MonitoringEvent).count()).toBe(2);
    const issues = await dataSource.getRepository(MonitoringErrorIssue).find();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      projectId: project.id,
      eventCount: 2,
      latestEventId: secondEventId,
      title: 'Checkout failed',
    });
  });

  it('keeps a repeated event id idempotent in PostgreSQL', async () => {
    await service.ingest(
      project.id,
      project.publicKey,
      eventEnvelope(firstEventId, 'duplicate'),
    );

    expect(await dataSource.getRepository(MonitoringEvent).count()).toBe(2);
    const issue = await dataSource
      .getRepository(MonitoringErrorIssue)
      .findOneByOrFail({
        projectId: project.id,
      });
    expect(issue.eventCount).toBe(2);
    expect(issue.latestEventId).toBe(secondEventId);
  });

  it('loads real list and detail relations including latestEvent', async () => {
    const list = await service.listOwnedIssues(
      ownerId,
      'integration-team',
      'integration-web',
      { page: 1, pageSize: 20 },
    );
    expect(list).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(list.items).toEqual([
      expect.objectContaining({
        eventCount: 2,
        environment: 'staging',
        release: 'web@staging',
      }),
    ]);

    const detail = await service.getOwnedIssue(
      ownerId,
      'integration-team',
      'integration-web',
      list.items[0].id,
    );
    expect(detail.latestEvent).toMatchObject({
      id: secondEventId,
      environment: 'staging',
      tags: { component: 'CheckoutView' },
    });
    expect(detail.recentEvents).toHaveLength(2);
    expect(detail.recentEvents.map((event) => event.id)).toEqual([
      secondEventId,
      firstEventId,
    ]);
  });

  it('resolves projects through the real owner relation', async () => {
    await expect(
      service.listOwnedIssues(
        otherOwnerId,
        'integration-team',
        'integration-web',
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
