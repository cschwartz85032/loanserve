import { pool } from '../../server/db'; // or your db client

export async function recordProcessedMessage(messageId: string, tenantId: string): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO processed_messages (message_id, tenant_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING 1`,
    [messageId, tenantId],
  );
  return result.rowCount! > 0; // true if this is first time processing
}