import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { UserStatus } from './../src/users/entities/user.entity';
import { UsersService } from './../src/users/users.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let passwordHash: string;

  beforeEach(async () => {
    passwordHash = await bcrypt.hash('123456', 4);
    const user = {
      id: 'user-1',
      email: 'admin@example.com',
      name: '系统管理员',
      passwordHash,
      status: UserStatus.Active,
      permissions: ['user:read'],
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UsersService)
      .useValue({
        findActiveById: jest.fn((id: string) =>
          Promise.resolve(id === user.id ? user : null),
        ),
        findByEmail: jest.fn((email: string) =>
          Promise.resolve(
            email.trim().toLowerCase() === user.email ? user : null,
          ),
        ),
      })
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

  it('logs in and returns the current user with the issued token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: '123456' })
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

  afterEach(async () => {
    await app.close();
  });
});
