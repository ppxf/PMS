import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { validateEnvironment } from './env.validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      ignoreEnvFile: true,
      isGlobal: true,
      load: [configuration],
      validate: validateEnvironment,
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
