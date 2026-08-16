import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
): void {
  const appName = config.get<string>('app.name', 'PMS API');
  const path = config.get<string>('swagger.path', 'docs');
  const documentConfig = new DocumentBuilder()
    .setTitle(appName)
    .setDescription(`${appName} HTTP API documentation`)
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, documentConfig);

  SwaggerModule.setup(path, app, document, {
    customSiteTitle: `${appName} API Docs`,
    useGlobalPrefix: true,
  });
}
