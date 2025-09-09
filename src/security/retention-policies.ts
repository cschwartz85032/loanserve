/**
 * Data Retention and Legal Hold Management
 * Implements automated data retention with legal hold support
 */

import { DbContext } from "./abac";

export interface RetentionPolicy {
  id?: string;
  tenantId: string;
  tableName: string;
  retentionDays: number;
  policyType: 'automatic' | 'manual' | 'legal_hold';
  legalHoldReason?: string;
  legalHoldUntil?: Date;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RetentionOperation {
  id?: string;
  tenantId: string;
  tableName: string;
  operationType: 'purge' | 'archive' | 'legal_hold_applied' | 'legal_hold_released';
  recordsAffected: number;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  executedBy: string;
  executionReason: string;
  createdAt?: Date;
}

/**
 * Data Retention Service
 */
export class RetentionService {
  private client: any;
  private context: DbContext;

  // Default retention periods by table (days)
  private static readonly DEFAULT_RETENTION: Record<string, number> = {
    'audit_logs': 2555,              // 7 years
    'audit_chain_events': 2555,      // 7 years (never purge by default)
    'wire_transfer_requests': 2555,  // 7 years
    'wire_transfer_approvals': 2555, // 7 years
    'pii_borrowers': 2555,           // 7 years
    'loan_acl': 1095,                // 3 years
    'secure_sessions': 90,           // 90 days
    'notifications': 365,            // 1 year
    'documents': 3650,               // 10 years
    'payments': 2555,                // 7 years
    'escrow_analysis': 2555,         // 7 years
    'general_ledger_events': 2555,   // 7 years
    'general_ledger_entries': 2555,  // 7 years
    'loan_balances': 1095,           // 3 years (snapshots)
  };

  constructor(client: any, context: DbContext) {
    this.client = client;
    this.context = context;
  }

  /**
   * Create or update retention policy
   */
  async setRetentionPolicy(policy: RetentionPolicy): Promise<string> {
    const result = await this.client.query(`
      INSERT INTO retention_policies (
        tenant_id, table_name, retention_days, policy_type,
        legal_hold_reason, legal_hold_until, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, table_name)
      DO UPDATE SET
        retention_days = $3,
        policy_type = $4,
        legal_hold_reason = $5,
        legal_hold_until = $6,
        updated_at = now()
      RETURNING id
    `, [
      policy.tenantId,
      policy.tableName,
      policy.retentionDays,
      policy.policyType,
      policy.legalHoldReason,
      policy.legalHoldUntil,
      policy.createdBy
    ]);

    await this.logRetentionOperation({
      tenantId: policy.tenantId,
      tableName: policy.tableName,
      operationType: policy.policyType === 'legal_hold' ? 'legal_hold_applied' : 'purge',
      recordsAffected: 0,
      dateRangeStart: new Date(),
      dateRangeEnd: new Date(),
      executedBy: policy.createdBy,
      executionReason: `Retention policy ${policy.policyType === 'legal_hold' ? 'legal hold applied' : 'updated'}`,
    });

    return result.rows[0].id;
  }

  /**
   * Get retention policy for table
   */
  async getRetentionPolicy(tableName: string): Promise<RetentionPolicy | null> {
    const result = await this.client.query(`
      SELECT * FROM retention_policies
      WHERE tenant_id = $1 AND table_name = $2
    `, [this.context.tenantId, tableName]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      tableName: row.table_name,
      retentionDays: row.retention_days,
      policyType: row.policy_type,
      legalHoldReason: row.legal_hold_reason,
      legalHoldUntil: row.legal_hold_until,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Apply legal hold to table
   */
  async applyLegalHold(
    tableName: string,
    reason: string,
    holdUntil: Date,
    appliedBy: string
  ): Promise<void> {
    await this.setRetentionPolicy({
      tenantId: this.context.tenantId,
      tableName,
      retentionDays: RetentionService.DEFAULT_RETENTION[tableName] || 3650,
      policyType: 'legal_hold',
      legalHoldReason: reason,
      legalHoldUntil: holdUntil,
      createdBy: appliedBy
    });

    console.log(`[Retention] Legal hold applied to ${tableName} until ${holdUntil.toISOString()}: ${reason}`);
  }

  /**
   * Release legal hold
   */
  async releaseLegalHold(tableName: string, releasedBy: string): Promise<void> {
    await this.client.query(`
      UPDATE retention_policies
      SET 
        policy_type = 'automatic',
        legal_hold_reason = NULL,
        legal_hold_until = NULL,
        updated_at = now()
      WHERE tenant_id = $1 AND table_name = $2
    `, [this.context.tenantId, tableName]);

    await this.logRetentionOperation({
      tenantId: this.context.tenantId,
      tableName,
      operationType: 'legal_hold_released',
      recordsAffected: 0,
      dateRangeStart: new Date(),
      dateRangeEnd: new Date(),
      executedBy: releasedBy,
      executionReason: 'Legal hold released'
    });

    console.log(`[Retention] Legal hold released for ${tableName}`);
  }

  /**
   * Execute retention policy for a table
   */
  async executeRetention(
    tableName: string,
    dryRun: boolean = false
  ): Promise<{ wouldDelete: number; actuallyDeleted: number }> {
    const policy = await this.getRetentionPolicy(tableName);
    
    if (!policy) {
      // Use default retention policy
      const defaultRetention = RetentionService.DEFAULT_RETENTION[tableName] || 3650;
      await this.setRetentionPolicy({
        tenantId: this.context.tenantId,
        tableName,
        retentionDays: defaultRetention,
        policyType: 'automatic',
        createdBy: 'system'
      });
      return this.executeRetention(tableName, dryRun);
    }

    // Never purge if under legal hold
    if (policy.policyType === 'legal_hold') {
      console.log(`[Retention] Skipping ${tableName} - under legal hold until ${policy.legalHoldUntil}`);
      return { wouldDelete: 0, actuallyDeleted: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    // Determine the date column to use for retention
    const dateColumn = this.getDateColumnForTable(tableName);
    if (!dateColumn) {
      console.warn(`[Retention] No date column configured for table ${tableName}`);
      return { wouldDelete: 0, actuallyDeleted: 0 };
    }

    // Count records that would be deleted
    const countResult = await this.client.query(`
      SELECT COUNT(*) as count
      FROM ${tableName}
      WHERE tenant_id = $1 AND ${dateColumn} < $2
    `, [this.context.tenantId, cutoffDate]);

    const wouldDelete = parseInt(countResult.rows[0].count);

    if (wouldDelete === 0) {
      return { wouldDelete: 0, actuallyDeleted: 0 };
    }

    if (dryRun) {
      console.log(`[Retention] DRY RUN: Would delete ${wouldDelete} records from ${tableName} older than ${cutoffDate.toISOString()}`);
      return { wouldDelete, actuallyDeleted: 0 };
    }

    // Execute the deletion
    const deleteResult = await this.client.query(`
      DELETE FROM ${tableName}
      WHERE tenant_id = $1 AND ${dateColumn} < $2
    `, [this.context.tenantId, cutoffDate]);

    const actuallyDeleted = deleteResult.rowCount || 0;

    // Log the retention operation
    await this.logRetentionOperation({
      tenantId: this.context.tenantId,
      tableName,
      operationType: 'purge',
      recordsAffected: actuallyDeleted,
      dateRangeStart: new Date(0), // Beginning of time
      dateRangeEnd: cutoffDate,
      executedBy: 'system',
      executionReason: `Automatic retention: ${policy.retentionDays} days`
    });

    console.log(`[Retention] Purged ${actuallyDeleted} records from ${tableName}`);
    return { wouldDelete, actuallyDeleted };
  }

  /**
   * Run retention for all tables
   */
  async executeAllRetentions(dryRun: boolean = false): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    const tables = Object.keys(RetentionService.DEFAULT_RETENTION);

    for (const tableName of tables) {
      try {
        results[tableName] = await this.executeRetention(tableName, dryRun);
      } catch (error) {
        console.error(`[Retention] Error processing ${tableName}:`, error);
        results[tableName] = { error: error.message, wouldDelete: 0, actuallyDeleted: 0 };
      }
    }

    return results;
  }

  /**
   * Get retention statistics
   */
  async getRetentionStats(): Promise<{
    totalPolicies: number;
    legalHolds: number;
    upcomingRetentions: Array<{tableName: string; recordCount: number; cutoffDate: Date}>;
  }> {
    const policyResult = await this.client.query(`
      SELECT COUNT(*) as total, COUNT(CASE WHEN policy_type = 'legal_hold' THEN 1 END) as legal_holds
      FROM retention_policies
      WHERE tenant_id = $1
    `, [this.context.tenantId]);

    const stats = {
      totalPolicies: parseInt(policyResult.rows[0].total),
      legalHolds: parseInt(policyResult.rows[0].legal_holds),
      upcomingRetentions: [] as Array<{tableName: string; recordCount: number; cutoffDate: Date}>
    };

    // Get upcoming retentions (next 30 days)
    const tables = Object.keys(RetentionService.DEFAULT_RETENTION);
    for (const tableName of tables) {
      const policy = await this.getRetentionPolicy(tableName);
      if (!policy || policy.policyType === 'legal_hold') continue;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays + 30); // 30 days from retention

      const dateColumn = this.getDateColumnForTable(tableName);
      if (!dateColumn) continue;

      try {
        const countResult = await this.client.query(`
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE tenant_id = $1 AND ${dateColumn} < $2
        `, [this.context.tenantId, cutoffDate]);

        const recordCount = parseInt(countResult.rows[0].count);
        if (recordCount > 0) {
          stats.upcomingRetentions.push({
            tableName,
            recordCount,
            cutoffDate
          });
        }
      } catch (error) {
        console.warn(`[Retention] Unable to check ${tableName}:`, error);
      }
    }

    return stats;
  }

  private async logRetentionOperation(operation: RetentionOperation): Promise<void> {
    await this.client.query(`
      INSERT INTO retention_log (
        tenant_id, table_name, operation_type, records_affected,
        date_range_start, date_range_end, executed_by, execution_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      operation.tenantId,
      operation.tableName,
      operation.operationType,
      operation.recordsAffected,
      operation.dateRangeStart,
      operation.dateRangeEnd,
      operation.executedBy,
      operation.executionReason
    ]);
  }

  private getDateColumnForTable(tableName: string): string | null {
    const dateColumns: Record<string, string> = {
      'audit_logs': 'created_at',
      'audit_chain_events': 'created_at',
      'wire_transfer_requests': 'created_at',
      'wire_transfer_approvals': 'created_at',
      'pii_borrowers': 'created_at',
      'loan_acl': 'created_at',
      'secure_sessions': 'created_at',
      'notifications': 'created_at',
      'documents': 'created_at',
      'payments': 'created_at',
      'escrow_analysis': 'created_at',
      'general_ledger_events': 'created_at',
      'general_ledger_entries': 'created_at',
      'loan_balances': 'created_at'
    };

    return dateColumns[tableName] || null;
  }
}

/**
 * Retention operations for queue-based execution
 * Replaces node-cron scheduled retention with ETL Scheduler integration
 */
export class RetentionOperations {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  /**
   * Run retention for all tenants (called by maintenance consumer)
   */
  async runRetentionForAllTenants(): Promise<{ processedTenants: number; errors: number }> {
    let processedTenants = 0;
    let errors = 0;
    
    try {
      console.log('[Retention] Starting retention job for all tenants');
      
      // Get all tenants
      const tenantResult = await this.client.query(`
        SELECT DISTINCT tenant_id FROM retention_policies
        UNION
        SELECT DISTINCT tenant_id FROM audit_logs
      `);

      for (const row of tenantResult.rows) {
        const tenantId = row.tenant_id;
        const context: DbContext = { tenantId, userSub: 'retention-scheduler' };
        
        try {
          // Set tenant context
          await this.client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
          
          const retentionService = new RetentionService(this.client, context);
          const results = await retentionService.executeAllRetentions(false);
          
          console.log(`[Retention] Completed retention for tenant ${tenantId}:`, results);
          processedTenants++;
        } catch (error) {
          console.error(`[Retention] Error processing tenant ${tenantId}:`, error);
          errors++;
        }
      }
    } catch (error) {
      console.error('[Retention] Retention job error:', error);
      errors++;
    }
    
    return { processedTenants, errors };
  }
}