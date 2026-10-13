import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureBodyParsers } from './common/http/configure-body-parsers';
import { sdkCors } from './common/http/sdk-cors';
import { AppLoggerService } from './logger/app-logger.service';
import { setupSwagger } from './swagger/swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  const logger = app.get(AppLoggerService);

  app.useLogger(logger);
  app.use(helmet());
  const apiPrefix = config.get<string>('app.apiPrefix', 'api');
  app.enableCors(
    sdkCors(
      config.get<string[]>('app.corsOrigins', [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3002',
      ]),
      apiPrefix,
    ),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: true,
    }),
  );

  configureBodyParsers(app, apiPrefix);
  app.setGlobalPrefix(apiPrefix);
  app.enableShutdownHooks();

  if (config.get<boolean>('swagger.enabled', true)) {
    setupSwagger(app, config);
  }

  const port = config.get<number>('app.port', 3000);
  await app.listen(port);
  logger.log(`Application is running on ${await app.getUrl()}`, 'Bootstrap');
}

void bootstrap();
