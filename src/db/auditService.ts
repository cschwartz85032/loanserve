import { PoolClient } from 'pg';

export async function auditAction(
  client: PoolClient,
  params: { tenantId: string; targetType: string; targetId: string; action: string; changes: any },
) {
  await client.query(
    `INSERT INTO audits (tenant_id, target_type, target_id, action, changes, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
    [params.tenantId, params.targetType, params.targetId, params.action, params.changes],
  );
}