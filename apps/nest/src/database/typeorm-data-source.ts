import { DataSource } from 'typeorm';
import { AuthToken } from '../auth-tokens/entities/auth-token.entity';
import configuration from '../config/configuration';
import { Group } from '../groups/entities/group.entity';
import { MonitoringErrorIssue } from '../monitoring-events/entities/monitoring-error-issue.entity';
import { MonitoringEvent } from '../monitoring-events/entities/monitoring-event.entity';
import { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';
import { User } from '../users/entities/user.entity';
import { CreateMonitoringEvents1790125200000 } from './migrations/1790125200000-CreateMonitoringEvents';

const database = configuration().database;

export default new DataSource({
  type: 'postgres',
  host: database.host,
  port: database.port,
  username: database.username,
  password: database.password,
  database: database.name,
  synchronize: false,
  entities: [
    User,
    Group,
    AuthToken,
    MonitoringProject,
    MonitoringErrorIssue,
    MonitoringEvent,
  ],
  migrations: [CreateMonitoringEvents1790125200000],
});
