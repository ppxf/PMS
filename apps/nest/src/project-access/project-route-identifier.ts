import type { FindOptionsWhere, Repository } from 'typeorm';
import { Group } from '../groups/entities/group.entity';
import type { MonitoringProject } from '../monitoring-projects/entities/monitoring-project.entity';

/** UUID paths address IDs; legacy human readable paths continue to address slugs. */
export function projectRouteIdentifier(
  value: string,
): { id: string } | { slug: string } {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? { id: value.toLowerCase() }
    : { slug: value };
}

/** Resolve each coordinate independently: an existing UUID never changes into a slug. */
export async function legacyProjectRouteWhere(
  projects: Repository<MonitoringProject>,
  groupValue: string,
  projectValue: string,
): Promise<FindOptionsWhere<MonitoringProject> | null> {
  let group = projectRouteIdentifier(groupValue);
  let project = projectRouteIdentifier(projectValue);
  let legacy = false;
  if (
    'id' in group &&
    !(await projects.manager.getRepository(Group).existsBy({ id: group.id }))
  ) {
    group = { slug: groupValue };
    legacy = true;
  }
  if ('id' in project && !(await projects.existsBy({ id: project.id }))) {
    project = { slug: projectValue };
    legacy = true;
  }
  return legacy ? { ...project, group } : null;
}
