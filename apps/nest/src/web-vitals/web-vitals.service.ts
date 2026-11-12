import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MonitoringProjectsService } from '../monitoring-projects/monitoring-projects.service';
import {
  WebVitalsEnvelope,
  WebVitalsEnvelopePipe,
} from './web-vitals-contract';
@Injectable()
export class WebVitalsService {
  constructor(
    private readonly db: DataSource,
    private readonly projects: MonitoringProjectsService,
  ) {}
  async ingest(
    projectId: string,
    key: string | undefined,
    input: WebVitalsEnvelope,
  ): Promise<void> {
    const e = new WebVitalsEnvelopePipe().transform(input);
    await this.projects.findForIngestion(projectId, key);
    await this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `vitals:${projectId.toLowerCase()}:${e.page.id.toLowerCase()}`,
      ]);
      const dimensions = { ...e.page, id: e.page.id.toLowerCase() };
      const rows: { dimensions: typeof dimensions }[] = await m.query(
        'SELECT dimensions FROM monitoring_page_views WHERE project_id=$1 AND id=$2',
        [projectId, e.page.id],
      );
      if (
        rows.length &&
        Object.keys(dimensions).some(
          (k) =>
            JSON.stringify(dimensions[k as keyof typeof dimensions]) !==
            JSON.stringify(rows[0].dimensions[k as keyof typeof dimensions]),
        )
      )
        throw new ConflictException('Page dimensions are immutable');
      if (
        rows.length &&
        Object.keys(rows[0].dimensions).length !==
          Object.keys(dimensions).length
      )
        throw new ConflictException('Page dimensions are immutable');
      await m.query(
        'INSERT INTO monitoring_page_views(project_id,id,started_at,dimensions) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [projectId, e.page.id, e.page.startedAt, dimensions],
      );
      for (const v of e.measurements)
        await m.query(
          `INSERT INTO monitoring_web_vitals(project_id,page_view_id,name,metric_id,revision,value,observed_at,attribution) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(project_id,page_view_id,name) DO UPDATE SET revision=EXCLUDED.revision,value=EXCLUDED.value,observed_at=EXCLUDED.observed_at,attribution=EXCLUDED.attribution,received_at=now() WHERE monitoring_web_vitals.revision < EXCLUDED.revision AND monitoring_web_vitals.metric_id = EXCLUDED.metric_id`,
          [
            projectId,
            e.page.id,
            v.name,
            v.metricId,
            v.revision,
            v.value,
            v.observedAt,
            v.attribution,
          ],
        );
    });
  }
}
