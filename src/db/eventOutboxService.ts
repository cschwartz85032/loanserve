import { PoolClient } from 'pg';

export async function publishEvent(
  client: PoolClient,
  params: {
    tenantId: string;
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: any;
    version?: number;
  },
) {
  await client.query(
    `INSERT INTO event_outbox (tenant_id, aggregate_id, aggregate_type, event_type, payload, version, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())`,
    [
      params.tenantId,
      params.aggregateId,
      params.aggregateType,
      params.eventType,
      params.payload,
      params.version || 1,
    ],
  );
}