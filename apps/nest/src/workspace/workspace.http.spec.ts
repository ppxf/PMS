import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

describe('workspace HTTP routes', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WorkspaceController],
      providers: [
        {
          provide: WorkspaceService,
          useValue: { projects: () => Promise.resolve([]) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(
      (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
        req.user = { id: 'user' };
        next();
      },
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('no longer exposes the global search endpoint', async () => {
    const response = await request(app.getHttpServer()).get(
      '/workspace/search?type=logs',
    );
    expect(response.status).toBe(404);
  });
  it('keeps the workspace project list available', async () => {
    const response = await request(app.getHttpServer()).get(
      '/workspace/projects',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
