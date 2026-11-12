import { DataSource } from 'typeorm';
interface AlertRuleRow {
  id: string;
  project_id: string;
  kind: string;
  name: string;
  threshold: number;
  window_minutes: number;
  created_at: Date;
}
export async function evaluateAlerts(db: DataSource) {
  await db.transaction(async (manager) => {
    // A database lock prevents duplicate evaluators across API replicas; unique keys also protect durable deduplication.
    const [lock] = await manager.query(
      'SELECT pg_try_advisory_xact_lock(1794441601) AS locked',
    );
    if (!lock.locked) return;
    await manager.query(
      `UPDATE workspace_alerts a SET status='recovered',recovered_at=now() FROM workspace_alert_rules r WHERE a.rule_id=r.id AND a.status='open' AND (r.enabled=false OR a.kind<>r.kind OR (a.kind<>'error_threshold' AND a.issue_id IS NULL))`,
    );
    const rules: AlertRuleRow[] = await manager.query(
      'SELECT * FROM workspace_alert_rules WHERE enabled=true FOR UPDATE',
    );
    const windows = [
      ...new Map(
        rules
          .filter((r) => r.kind === 'error_threshold')
          .map((r) => [
            `${r.project_id}:${r.window_minutes}`,
            { project_id: r.project_id, window_minutes: r.window_minutes },
          ]),
      ).values(),
    ];
    const counts = new Map<string, number>();
    if (windows.length) {
      const rows: {
        project_id: string;
        window_minutes: number;
        count: string;
      }[] = await manager.query(
        `SELECT w.project_id,w.window_minutes,count(e.id)::text AS count FROM jsonb_to_recordset($1::jsonb) AS w(project_id uuid,window_minutes integer) LEFT JOIN monitoring_events e ON e.project_id=w.project_id AND e.received_at>=now()-(w.window_minutes * interval '1 minute') AND e.received_at<=now() GROUP BY w.project_id,w.window_minutes`,
        [JSON.stringify(windows)],
      );
      for (const row of rows)
        counts.set(
          `${row.project_id}:${row.window_minutes}`,
          Number(row.count),
        );
    }
    for (const r of rules) {
      if (r.kind === 'error_threshold') {
        if (
          (counts.get(`${r.project_id}:${r.window_minutes}`) ?? 0) >=
          r.threshold
        )
          await manager.query(
            `INSERT INTO workspace_alerts(project_id,rule_id,kind,title,dedup_key) SELECT $1,$2,$3,$4,gen_random_uuid()::text WHERE NOT EXISTS(SELECT 1 FROM workspace_alerts WHERE rule_id=$2 AND status='open')`,
            [r.project_id, r.id, r.kind, r.name],
          );
        else
          await manager.query(
            `UPDATE workspace_alerts SET status='recovered',recovered_at=now() WHERE rule_id=$1 AND status='open'`,
            [r.id],
          );
      } else {
        const time = r.kind === 'new_issue' ? 'created_at' : 'reopened_at';
        await manager.query(
          `INSERT INTO workspace_alerts(project_id,rule_id,kind,title,issue_id,dedup_key) SELECT i.project_id,$1,$2::varchar,$3,i.id,$2::varchar||':'||i.id::text||':'||COALESCE(i.${time}::text,'') FROM monitoring_error_issues i WHERE i.project_id=$4 AND i.${time}>=$5 AND i.${time}<=now() AND i.status='unresolved' AND i.visibility='active' ON CONFLICT(rule_id,dedup_key) DO NOTHING`,
          [r.id, r.kind, r.name, r.project_id, r.created_at],
        );
        await manager.query(
          `UPDATE workspace_alerts a SET status='recovered',recovered_at=now() FROM monitoring_error_issues i WHERE a.rule_id=$1 AND a.issue_id=i.id AND a.status='open' AND (i.status='resolved' OR i.visibility<>'active')`,
          [r.id],
        );
      }
    }
  });
}
