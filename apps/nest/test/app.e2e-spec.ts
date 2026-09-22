import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { UserStatus } from './../src/users/entities/user.entity';
import { UsersService } from './../src/users/users.service';
import { GroupsService } from './../src/groups/groups.service';
import { MonitoringProjectsService } from './../src/monitoring-projects/monitoring-projects.service';

const GROUP_ID = '10000000-0000-4000-8000-000000000001';
const PROJECT_ID = '20000000-0000-4000-8000-000000000001';

interface TestGroup {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  projectCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TestProject {
  id: string;
  groupId: string;
  name: string;
  slug: string;
  platform: 'vue';
  publicKey: string;
  errorMonitoringEnabled: boolean;
  loggingEnabled: boolean;
  tracingEnabled: boolean;
  metricsEnabled: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type TestProjectResponse = TestProject & { connected: boolean; dsn: string };

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let passwordHash: string;

  beforeEach(async () => {
    passwordHash = await bcrypt.hash('password123', 4);
    const users = [
      {
      id: 'user-1',
      email: 'admin@example.com',
      name: '用户一',
      passwordHash,
      status: UserStatus.Active,
      permissions: ['user:read'],
      },
      {
        id: 'user-2',
        email: 'second@example.com',
        name: '用户二',
        passwordHash,
        status: UserStatus.Active,
        permissions: [],
      },
    ];
    const groups: TestGroup[] = [];
    const projects: TestProject[] = [];
    const groupsService = {
      create: jest.fn((ownerId: string, input: { name: string }) => {
        const now = new Date();
        const group: TestGroup = {
          id: GROUP_ID,
          ownerId,
          name: input.name.trim(),
          slug: input.name.trim().toLowerCase().replace(/\s+/g, '-'),
          projectCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        groups.push(group);
        return Promise.resolve(group);
      }),
      listOwned: jest.fn((ownerId: string) =>
        Promise.resolve(groups.filter((group) => group.ownerId === ownerId)),
      ),
      findOwnedBySlug: jest.fn((ownerId: string, slug: string) => {
        const group = groups.find(
          (item) => item.ownerId === ownerId && item.slug === slug,
        );
        if (!group) throw new NotFoundException('组不存在');
        return Promise.resolve(group);
      }),
    };
    const toProjectResponse = (project: TestProject): TestProjectResponse => ({
      ...project,
      connected: Boolean(project.lastSeenAt),
      dsn: `http://${project.publicKey}@localhost:3001/api/sdk/${project.id}`,
    });
    const findOwnedProject = async (
      userId: string,
      groupSlug: string,
      projectSlug: string,
    ): Promise<TestProjectResponse> => {
      const group = await groupsService.findOwnedBySlug(userId, groupSlug);
      const project = projects.find(
        (item) => item.groupId === group.id && item.slug === projectSlug,
      );
      if (!project) throw new NotFoundException('监控项目不存在');
      return toProjectResponse(project);
    };
    const projectsService = {
      create: jest.fn(
        async (
          userId: string,
          groupSlug: string,
          input: Omit<TestProject, 'id' | 'groupId' | 'publicKey'>,
        ) => {
          const group = await groupsService.findOwnedBySlug(userId, groupSlug);
          const now = new Date();
          const project: TestProject = {
            id: PROJECT_ID,
            groupId: group.id,
            name: input.name.trim(),
            slug: input.name.trim().toLowerCase().replace(/\s+/g, '-'),
            platform: 'vue',
            publicKey: 'local-public-key',
            errorMonitoringEnabled: input.errorMonitoringEnabled ?? true,
            loggingEnabled: input.loggingEnabled ?? false,
            tracingEnabled: input.tracingEnabled ?? false,
            metricsEnabled: input.metricsEnabled ?? false,
            lastSeenAt: null,
            createdAt: now,
            updatedAt: now,
          };
          projects.push(project);
          return toProjectResponse(project);
        },
      ),
      listOwned: jest.fn(async (userId: string, groupSlug: string) => {
        const group = await groupsService.findOwnedBySlug(userId, groupSlug);
        return projects
          .filter((project) => project.groupId === group.id)
          .map(toProjectResponse);
      }),
      findOwnedBySlug: jest.fn(findOwnedProject),
      getConnection: jest.fn(
        async (
          userId: string,
          groupSlug: string,
          projectSlug: string,
        ): Promise<{ connected: boolean; lastSeenAt: Date | null }> => {
          const project = await findOwnedProject(userId, groupSlug, projectSlug);
          return { connected: project.connected, lastSeenAt: project.lastSeenAt };
        },
      ),
      checkConnection: jest.fn((projectId: string, publicKey: string) => {
        const project = projects.find(
          (item) => item.id === projectId && item.publicKey === publicKey,
        );
        if (!project) throw new NotFoundException('监控项目不存在');
        project.lastSeenAt = new Date();
        return Promise.resolve({
          projectId: project.id,
          platform: project.platform,
          checkedAt: project.lastSeenAt,
        });
      }),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UsersService)
      .useValue({
        findActiveById: jest.fn((id: string) =>
          Promise.resolve(users.find((user) => user.id === id) ?? null),
        ),
        findByEmail: jest.fn((email: string) =>
          Promise.resolve(
            users.find(
              (user) => user.email === email.trim().toLowerCase(),
            ) ?? null,
          ),
        ),
      })
      .overrideProvider(GroupsService)
      .useValue(groupsService)
      .overrideProvider(MonitoringProjectsService)
      .useValue(projectsService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
  });

  it('rejects a protected endpoint without a token', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('validates public registration input', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'invalid-email', password: 'short' })
      .expect(400);
  });

  it('logs in and returns the current user with the issued token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' })
      .expect(201);
    const body = login.body as { data: { accessToken: string } };

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .expect(200)
      .expect((response: Response) => {
        expect(response.body).toMatchObject({
          success: true,
          data: {
            user: { id: 'user-1', email: 'admin@example.com' },
            permissions: ['user:read'],
          },
        });
      });
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((response: Response) => {
        const body = response.body as {
          success: boolean;
          data: { status: string };
        };

        expect(body.success).toBe(true);
        expect(body.data.status).toBe('ok');
      });
  });

  it('creates an owned group and project, validates its DSN, and hides it from another user', async () => {
    const ownerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' })
      .expect(201);
    const ownerToken = (ownerLogin.body as { data: { accessToken: string } })
      .data.accessToken;
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'second@example.com', password: 'password123' })
      .expect(201);
    const otherToken = (otherLogin.body as { data: { accessToken: string } })
      .data.accessToken;

    await request(app.getHttpServer())
      .post('/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Acme Team' })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/groups/acme-team/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Vue Storefront',
        platform: 'vue',
        errorMonitoringEnabled: true,
        loggingEnabled: false,
        tracingEnabled: true,
        metricsEnabled: false,
      })
      .expect(201);
    const project = created.body.data as {
      id: string;
      slug: string;
      dsn: string;
    };
    const dsn = new URL(project.dsn);

    await request(app.getHttpServer())
      .post('/sdk/check')
      .send({ projectId: project.id, publicKey: dsn.username })
      .expect(200)
      .expect((response: Response) => {
        expect(response.body.data).toMatchObject({
          projectId: PROJECT_ID,
          platform: 'vue',
        });
      });

    await request(app.getHttpServer())
      .get(`/groups/acme-team/projects/${project.slug}/connection`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response: Response) => {
        expect(response.body.data.connected).toBe(true);
        expect(response.body.data.lastSeenAt).toBeTruthy();
      });

    await request(app.getHttpServer())
      .get('/groups/acme-team')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
