import { ConfigService } from '@nestjs/config';
import configuration from '../config/configuration';
import dataSource from './data-source';
import { RetentionService } from '../retention/retention.service';
import { TracesRetentionService } from '../traces/traces-retention.service';

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.some((arg) => !['--execute', '--traces-only'].includes(arg))) {
    throw new Error(
      'Usage: retention:cleanup [--execute] [--traces-only]. Without --execute this command only counts records.',
    );
  }
  await dataSource.initialize();
  try {
    const execute = args.includes('--execute');
    const result = args.includes('--traces-only')
      ? await new TracesRetentionService(dataSource).cleanup(execute)
      : await new RetentionService(
          dataSource,
          new ConfigService(configuration()),
        ).cleanup(execute);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await dataSource.destroy();
  }
}
void main().catch(() => {
  // Drivers may embed a connection string in an error; avoid printing credentials.
  process.stderr.write(
    'Retention command failed. Check arguments, database connectivity and applied migrations.\n',
  );
  process.exitCode = 1;
});
