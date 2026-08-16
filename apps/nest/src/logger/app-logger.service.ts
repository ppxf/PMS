import { ConsoleLogger, Injectable } from '@nestjs/common';

@Injectable()
export class AppLoggerService extends ConsoleLogger {
  constructor() {
    super('Application', { timestamp: true });
  }
}
