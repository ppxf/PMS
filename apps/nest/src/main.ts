import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppLoggerService } from './logger/app-logger.service';
import { setupSwagger } from './swagger/swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(AppLoggerService);

  app.useLogger(logger);
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: true,
    }),
  );

  const apiPrefix = config.get<string>('app.apiPrefix', 'api');
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
