/**
 * Maintenance Consumer - Handles scheduled maintenance tasks
 * Replaces node-cron based retention and cleanup tasks
 */

import { startConsumer } from '../consumer-utils';
import type { Connection } from 'amqplib';
import { withTenantClient } from '../../db/withTenantClient';
import { RetentionOperations } from '../../security/retention-policies';

/**
 * Retention cleanup handler - uses existing RetentionOperations class
 */
async function handleRetentionCleanup(tenantId: string, client: any) {
  console.log(`[Maintenance] Starting retention cleanup for tenant ${tenantId}`);
  
  try {
    // Use existing retention operations (formerly node-cron based)
    const retentionOps = new RetentionOperations(client);
    const results = await retentionOps.runRetentionForAllTenants();
    
    // Also clean up expired sessions and old processed messages
    const sessionResult = await client.query(`
      DELETE FROM sessions 
      WHERE expires_at < CURRENT_TIMESTAMP
    `);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const messageResult = await client.query(`
      DELETE FROM processed_messages 
      WHERE processed_at < $1
    `, [thirtyDaysAgo]);
    
    console.log(`[Maintenance] Retention cleanup completed:`, {
      ...results,
      expiredSessions: sessionResult.rowCount || 0,
      oldMessages: messageResult.rowCount || 0
    });
    
  } catch (error) {
    console.error(`[Maintenance] Retention cleanup failed:`, error);
    throw error;
  }
}

/**
 * Audit maintenance handler - validates audit chain integrity
 */
async function handleAuditMaintenance(tenantId: string, client: any) {
  console.log(`[Maintenance] Starting audit maintenance for tenant ${tenantId}`);
  
  try {
    // Validate audit chain integrity
    const chainResult = await client.query(`
      SELECT COUNT(*) as broken_chains
      FROM audit_logs a1
      LEFT JOIN audit_logs a2 ON a2.id = a1.id + 1
      WHERE a1.next_hash != a2.previous_hash
        AND a2.id IS NOT NULL
    `);
    
    const brokenChains = chainResult.rows[0]?.broken_chains || 0;
    
    if (brokenChains > 0) {
      console.warn(`[Maintenance] Detected ${brokenChains} broken audit chain links`);
      // In production, this would trigger alerts
    }
    
    // Update audit statistics
    const statsResult = await client.query(`
      INSERT INTO audit_statistics (tenant_id, date, total_events, integrity_status)
      VALUES ($1, CURRENT_DATE, 
        (SELECT COUNT(*) FROM audit_logs WHERE DATE(created_at) = CURRENT_DATE),
        CASE WHEN $2 = 0 THEN 'valid' ELSE 'compromised' END
      )
      ON CONFLICT (tenant_id, date) DO UPDATE SET
        total_events = EXCLUDED.total_events,
        integrity_status = EXCLUDED.integrity_status
    `, [tenantId, brokenChains]);
    
    console.log(`[Maintenance] Audit maintenance completed - integrity status: ${brokenChains === 0 ? 'valid' : 'compromised'}`);
    
  } catch (error) {
    console.error(`[Maintenance] Audit maintenance failed:`, error);
    throw error;
  }
}

/**
 * Initialize maintenance consumer
 */
export async function initMaintenanceConsumer(conn: Connection, publishFn: any) {
  console.log('[Maintenance Consumer] Initializing maintenance consumer...');
  
  await startConsumer(conn, {
    queue: 'maintenance.schedule.v1',
    handler: async (payload: any, helpers: any) => {
      const { tenantId } = payload;
      const { jobTypes = [] } = payload.payload || {};
      
      console.log(`[Maintenance Consumer] Processing maintenance jobs:`, jobTypes);
      
      // Execute each maintenance job type
      for (const jobType of jobTypes) {
        try {
          await withTenantClient(tenantId, async (client) => {
            switch (jobType) {
              case 'retention_cleanup':
                await handleRetentionCleanup(tenantId, client);
                break;
                
              case 'audit_maintenance':
                await handleAuditMaintenance(tenantId, client);
                break;
                
              default:
                console.warn(`[Maintenance Consumer] Unknown job type: ${jobType}`);
            }
          });
          
        } catch (error) {
          console.error(`[Maintenance Consumer] Job ${jobType} failed:`, error);
          // Don't throw - allow other jobs to continue
        }
      }
      
      console.log(`[Maintenance Consumer] Completed maintenance jobs for tenant ${tenantId}`);
    }
  });
  
  console.log('[Maintenance Consumer] ✅ Maintenance consumer initialized');
}