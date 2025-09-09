import { pool } from '../../server/db'; // or your db client

export async function recordProcessedMessage(messageId: string, tenantId: string): Promise<boolean> {
  // Convert "default" tenant to a valid UUID for database compatibility
  const normalizedTenantId = tenantId === 'default' ? '00000000-0000-0000-0000-000000000000' : tenantId;
  
  const result = await pool.query(
    `INSERT INTO processed_messages (message_id, tenant_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING 1`,
    [messageId, normalizedTenantId],
  );
  return result.rowCount! > 0; // true if this is first time processing
}