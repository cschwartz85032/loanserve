import { pool } from '../../server/db'; // or your db client

export async function recordProcessedMessage(messageId: string, tenantId: string): Promise<boolean> {
  // Convert "default" tenant to a valid UUID for database compatibility
  const normalizedTenantId = tenantId === 'default' ? '00000000-0000-0000-0000-000000000000' : tenantId;
  
  try {
    // Simplified approach - check if exists first, then insert if not
    const checkResult = await pool.query(
      'SELECT 1 FROM processed_messages WHERE message_id = $1 AND tenant_id = $2',
      [messageId, normalizedTenantId]
    );
    
    if (checkResult.rowCount && checkResult.rowCount > 0) {
      return false; // Already processed
    }
    
    await pool.query(
      'INSERT INTO processed_messages (message_id, tenant_id, processed_at) VALUES ($1, $2, NOW())',
      [messageId, normalizedTenantId]
    );
    
    return true; // First time processing
  } catch (error) {
    // If there's a race condition and another process inserted, treat as already processed
    console.warn('[DB] Race condition in message processing, treating as duplicate:', error);
    return false;
  }
}