/**
 * Import Monitor Service
 * Provides comprehensive monitoring and progress tracking for import operations
 * REFACTORED: Uses only raw SQL queries with PoolClient
 */

import { PoolClient } from 'pg';

export type ImportStage = 
  | 'upload'
  | 'validation' 
  | 'parsing'
  | 'entity_creation'
  | 'persistence'
  | 'complete';

export type StageStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped';

export type EventSeverity = 
  | 'debug'
  | 'info'
  | 'warning'
  | 'error'
  | 'critical';

export interface StageProgress {
  stage: ImportStage;
  status: StageStatus;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  recordsTotal: number;
  recordsProcessed: number;
  recordsSuccess: number;
  recordsFailed: number;
  recordsSkipped: number;
  currentRecord?: any;
  errorDetails?: any;
  metrics?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ImportEvent {
  eventType: 'stage_start' | 'stage_complete' | 'record_processed' | 'error' | 'warning';
  stage?: ImportStage;
  recordIdentifier?: string;
  message: string;
  details?: Record<string, any>;
  severity: EventSeverity;
  stackTrace?: string;
  correlationId?: string;
}

export class ImportMonitor {
  private client: PoolClient;
  private importId: string;
  private tenantId: string;
  private userId?: string;
  private stageStartTimes: Map<ImportStage, Date> = new Map();

  constructor(
    client: PoolClient,
    importId: string,
    tenantId: string,
    userId?: string
  ) {
    this.client = client;
    this.importId = importId;
    this.tenantId = tenantId;
    this.userId = userId;
  }

  /**
   * Start tracking a new import stage
   */
  async startStage(
    stage: ImportStage,
    totalRecords: number = 0,
    metadata?: Record<string, any>
  ): Promise<void> {
    const startTime = new Date();
    this.stageStartTimes.set(stage, startTime);

    // Check if progress record exists
    const existingResult = await this.client.query(
      `SELECT id FROM import_progress 
       WHERE import_id = $1 AND stage = $2 AND tenant_id = $3 
       LIMIT 1`,
      [this.importId, stage, this.tenantId]
    );

    if (existingResult.rows.length > 0) {
      // Update existing record
      await this.client.query(
        `UPDATE import_progress 
         SET status = 'in_progress',
             started_at = $1,
             records_total = $2,
             records_processed = 0,
             records_success = 0,
             records_failed = 0,
             records_skipped = 0,
             metadata = $3,
             updated_at = $1
         WHERE id = $4`,
        [startTime, totalRecords, metadata || {}, existingResult.rows[0].id]
      );
    } else {
      // Create new progress record
      await this.client.query(
        `INSERT INTO import_progress 
         (import_id, tenant_id, stage, status, started_at, records_total, 
          records_processed, records_success, records_failed, records_skipped, metadata)
         VALUES ($1, $2, $3, 'in_progress', $4, $5, 0, 0, 0, 0, $6)`,
        [this.importId, this.tenantId, stage, startTime, totalRecords, metadata || {}]
      );
    }

    // Log audit event
    await this.logEvent({
      eventType: 'stage_start',
      stage,
      message: `Started ${stage} stage with ${totalRecords} records`,
      details: { totalRecords, metadata },
      severity: 'info'
    });
  }

  /**
   * Update progress for the current stage
   */
  async updateProgress(
    stage: ImportStage,
    updates: Partial<StageProgress>
  ): Promise<void> {
    // Get current progress record
    const progressResult = await this.client.query(
      `SELECT id FROM import_progress 
       WHERE import_id = $1 AND stage = $2 AND tenant_id = $3 
       LIMIT 1`,
      [this.importId, stage, this.tenantId]
    );

    if (progressResult.rows.length === 0) {
      throw new Error(`No progress record found for stage ${stage}`);
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`);
      updateValues.push(updates.status);
    }
    if (updates.recordsProcessed !== undefined) {
      updateFields.push(`records_processed = $${paramIndex++}`);
      updateValues.push(updates.recordsProcessed);
    }
    if (updates.recordsSuccess !== undefined) {
      updateFields.push(`records_success = $${paramIndex++}`);
      updateValues.push(updates.recordsSuccess);
    }
    if (updates.recordsFailed !== undefined) {
      updateFields.push(`records_failed = $${paramIndex++}`);
      updateValues.push(updates.recordsFailed);
    }
    if (updates.recordsSkipped !== undefined) {
      updateFields.push(`records_skipped = $${paramIndex++}`);
      updateValues.push(updates.recordsSkipped);
    }
    if (updates.currentRecord !== undefined) {
      updateFields.push(`current_record = $${paramIndex++}`);
      updateValues.push(updates.currentRecord);
    }
    if (updates.errorDetails !== undefined) {
      updateFields.push(`error_details = $${paramIndex++}`);
      updateValues.push(updates.errorDetails);
    }
    if (updates.metadata !== undefined) {
      updateFields.push(`metadata = $${paramIndex++}`);
      updateValues.push(updates.metadata);
    }

    // Always update timestamp
    updateFields.push(`updated_at = $${paramIndex++}`);
    updateValues.push(new Date());

    // Add id to values
    updateValues.push(progressResult.rows[0].id);

    await this.client.query(
      `UPDATE import_progress 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex}`,
      updateValues
    );
  }

  /**
   * Mark a stage as complete
   */
  async completeStage(
    stage: ImportStage,
    status: 'completed' | 'failed' | 'skipped' = 'completed',
    errorDetails?: any
  ): Promise<void> {
    const completedAt = new Date();
    const startedAt = this.stageStartTimes.get(stage);
    const durationMs = startedAt ? completedAt.getTime() - startedAt.getTime() : 0;

    // Get progress record
    const progressResult = await this.client.query(
      `SELECT * FROM import_progress 
       WHERE import_id = $1 AND stage = $2 AND tenant_id = $3 
       LIMIT 1`,
      [this.importId, stage, this.tenantId]
    );

    if (progressResult.rows.length > 0) {
      const progress = progressResult.rows[0];
      
      await this.client.query(
        `UPDATE import_progress 
         SET status = $1,
             completed_at = $2,
             duration_ms = $3,
             error_details = $4,
             updated_at = $2
         WHERE id = $5`,
        [status, completedAt, durationMs, errorDetails || null, progress.id]
      );

      // Log audit event
      await this.logEvent({
        eventType: 'stage_complete',
        stage,
        message: `Completed ${stage} stage with status: ${status}`,
        details: { 
          durationMs, 
          status,
          recordsProcessed: progress.records_processed || 0,
          recordsSuccess: progress.records_success || 0,
          recordsFailed: progress.records_failed || 0
        },
        severity: status === 'failed' ? 'error' : 'info'
      });
    }

    // Update import status if stage failed
    if (status === 'failed') {
      await this.client.query(
        `UPDATE imports 
         SET status = 'failed',
             error_count = COALESCE(error_count, 0) + 1,
             updated_at = $1
         WHERE id = $2 AND tenant_id = $3`,
        [completedAt, this.importId, this.tenantId]
      );
    }
  }

  /**
   * Record processing of an individual record
   */
  async recordProcessed(
    stage: ImportStage,
    recordIdentifier: string,
    success: boolean,
    details?: Record<string, any>
  ): Promise<void> {
    // Get current progress
    const progressResult = await this.client.query(
      `SELECT * FROM import_progress 
       WHERE import_id = $1 AND stage = $2 AND tenant_id = $3 
       LIMIT 1`,
      [this.importId, stage, this.tenantId]
    );

    if (progressResult.rows.length > 0) {
      const progress = progressResult.rows[0];
      
      const recordsProcessed = (progress.records_processed || 0) + 1;
      const recordsSuccess = success ? (progress.records_success || 0) + 1 : (progress.records_success || 0);
      const recordsFailed = !success ? (progress.records_failed || 0) + 1 : (progress.records_failed || 0);
      
      await this.client.query(
        `UPDATE import_progress 
         SET records_processed = $1,
             records_success = $2,
             records_failed = $3,
             current_record = $4,
             updated_at = $5
         WHERE id = $6`,
        [
          recordsProcessed,
          recordsSuccess,
          recordsFailed,
          { identifier: recordIdentifier, ...details },
          new Date(),
          progress.id
        ]
      );
    }

    // Log detailed event for debugging
    await this.logEvent({
      eventType: 'record_processed',
      stage,
      recordIdentifier,
      message: `Processed record ${recordIdentifier}: ${success ? 'success' : 'failed'}`,
      details,
      severity: success ? 'debug' : 'warning'
    });
  }

  /**
   * Log an import event
   */
  async logEvent(event: ImportEvent): Promise<void> {
    await this.client.query(
      `INSERT INTO import_audit_log 
       (import_id, event_type, stage, record_identifier, message, 
        details, severity, stack_trace, user_id, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        this.importId,
        event.eventType,
        event.stage || null,
        event.recordIdentifier || null,
        event.message,
        event.details || {},
        event.severity,
        event.stackTrace || null,
        this.userId || null,
        event.correlationId || null
      ]
    );
  }

  /**
   * Log an error with full context
   */
  async logError(
    stage: ImportStage,
    error: Error | string,
    recordIdentifier?: string,
    context?: Record<string, any>
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const stackTrace = error instanceof Error ? error.stack : undefined;

    await this.logEvent({
      eventType: 'error',
      stage,
      recordIdentifier,
      message: errorMessage,
      details: {
        ...context,
        errorType: error instanceof Error ? error.name : 'Error'
      },
      severity: 'error',
      stackTrace
    });

    // Update stage error details
    await this.updateProgress(stage, {
      errorDetails: {
        message: errorMessage,
        stack: stackTrace,
        context,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Get current import status with all stages
   */
  async getImportStatus(): Promise<{
    import: any;
    stages: StageProgress[];
    currentStage?: ImportStage;
    overallProgress: number;
  }> {
    // Get import record
    const importResult = await this.client.query(
      'SELECT * FROM imports WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [this.importId, this.tenantId]
    );
    const importData = importResult.rows[0];

    // Get all stages for this import
    const stagesResult = await this.client.query(
      `SELECT * FROM import_progress 
       WHERE import_id = $1 AND tenant_id = $2 
       ORDER BY created_at`,
      [this.importId, this.tenantId]
    );
    const stages = stagesResult.rows;

    // Find current stage
    const currentStage = stages.find(s => s.status === 'in_progress')?.stage as ImportStage;
    
    // Calculate overall progress
    const totalRecords = stages.reduce((sum, s) => sum + (s.records_total || 0), 0);
    const processedRecords = stages.reduce((sum, s) => sum + (s.records_processed || 0), 0);
    const overallProgress = totalRecords > 0 ? (processedRecords / totalRecords) * 100 : 0;

    return {
      import: importData,
      stages: stages as StageProgress[],
      currentStage,
      overallProgress
    };
  }

  /**
   * Get recent events for this import
   */
  async getRecentEvents(limit: number = 100): Promise<any[]> {
    const result = await this.client.query(
      `SELECT * FROM import_audit_log 
       WHERE import_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [this.importId, limit]
    );
    return result.rows;
  }

  /**
   * Update aggregated metrics (called after import completion)
   */
  async updateMetrics(): Promise<void> {
    // Get all stages for this import
    const stagesResult = await this.client.query(
      `SELECT * FROM import_progress 
       WHERE import_id = $1 AND tenant_id = $2`,
      [this.importId, this.tenantId]
    );
    const stages = stagesResult.rows;

    // Get import record
    const importResult = await this.client.query(
      `SELECT * FROM imports 
       WHERE id = $1 AND tenant_id = $2 
       LIMIT 1`,
      [this.importId, this.tenantId]
    );
    const importData = importResult.rows[0];

    if (!importData) return;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 59, 59);

    // Calculate totals
    const totalDurationMs = stages.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
    const totalRecords = stages.reduce((sum, s) => sum + (s.records_processed || 0), 0);
    const successRecords = stages.reduce((sum, s) => sum + (s.records_success || 0), 0);
    const failedRecords = stages.reduce((sum, s) => sum + (s.records_failed || 0), 0);

    // Check for existing metrics record
    const existingResult = await this.client.query(
      `SELECT * FROM import_metrics_hourly 
       WHERE tenant_id = $1 AND period = 'hour' AND period_start = $2 
       LIMIT 1`,
      [this.tenantId, periodStart]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      // Update existing metrics
      await this.client.query(
        `UPDATE import_metrics_hourly 
         SET total_imports = total_imports + 1,
             successful_imports = successful_imports + $1,
             failed_imports = failed_imports + $2,
             total_records = total_records + $3,
             successful_records = successful_records + $4,
             failed_records = failed_records + $5,
             avg_processing_time_ms = (avg_processing_time_ms * total_imports + $6) / (total_imports + 1),
             updated_at = NOW()
         WHERE id = $7`,
        [
          importData.status === 'completed' ? 1 : 0,
          importData.status === 'failed' ? 1 : 0,
          totalRecords,
          successRecords,
          failedRecords,
          totalDurationMs,
          existing.id
        ]
      );
    } else {
      // Create new metrics record
      await this.client.query(
        `INSERT INTO import_metrics_hourly 
         (tenant_id, period, period_start, period_end, total_imports, successful_imports, 
          failed_imports, total_records, successful_records, failed_records, avg_processing_time_ms)
         VALUES ($1, 'hour', $2, $3, 1, $4, $5, $6, $7, $8, $9)`,
        [
          this.tenantId,
          periodStart,
          periodEnd,
          importData.status === 'completed' ? 1 : 0,
          importData.status === 'failed' ? 1 : 0,
          totalRecords,
          successRecords,
          failedRecords,
          totalDurationMs
        ]
      );
    }
  }
}

/**
 * Get monitoring dashboard data
 */
export async function getMonitoringDashboard(
  client: PoolClient,
  tenantId: string,
  timeRange: 'hour' | 'day' | 'week' = 'day'
): Promise<{
  activeImports: any[];
  recentImports: any[];
  metrics: any;
  alerts: any[];
}> {
  const now = new Date();
  let since: Date;

  switch (timeRange) {
    case 'hour':
      since = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  // Get active imports (in progress)
  const activeImportsResult = await client.query(`
    WITH progress_agg AS (
      SELECT 
        import_id,
        tenant_id,
        MAX(CASE WHEN status = 'in_progress' THEN stage ELSE NULL END) AS stage,
        MAX(CASE WHEN status = 'in_progress' THEN current_record::text ELSE NULL END)::jsonb AS current_record,
        SUM(COALESCE(records_total, 0)) AS records_total,
        SUM(COALESCE(records_processed, 0)) AS records_processed,
        SUM(COALESCE(records_success, 0)) AS records_success,
        SUM(COALESCE(records_failed, 0)) AS records_failed,
        SUM(COALESCE(records_skipped, 0)) AS records_skipped,
        BOOL_OR(status = 'in_progress') AS has_in_progress
      FROM import_progress
      WHERE tenant_id = $1
      GROUP BY import_id, tenant_id
    )
    SELECT 
      i.*,
      p.stage,
      p.current_record,
      p.records_total,
      p.records_processed,
      p.records_failed,
      CASE 
        WHEN p.records_total > 0 
        THEN (p.records_processed::float / p.records_total::float) * 100 
        ELSE 0 
      END as percentage_complete
    FROM imports i
    INNER JOIN progress_agg p ON i.id = p.import_id AND p.tenant_id = i.tenant_id
    WHERE i.tenant_id = $1 
      AND i.status = 'processing'
      AND p.has_in_progress = true
    ORDER BY i.created_at DESC
  `, [tenantId]);

  // Get recent imports
  const recentImportsResult = await client.query(`
    SELECT * FROM imports
    WHERE tenant_id = $1 
      AND created_at >= $2
    ORDER BY created_at DESC
    LIMIT 20
  `, [tenantId, since]);

  // Get aggregated metrics
  const metricsResult = await client.query(`
    SELECT * FROM import_metrics_hourly
    WHERE tenant_id = $1 
      AND period_start >= $2
    ORDER BY period_start DESC
  `, [tenantId, since]);

  // Get recent critical events/alerts
  const alertsResult = await client.query(`
    SELECT 
      a.import_id,
      a.message,
      a.details,
      a.created_at
    FROM import_audit_log a
    INNER JOIN imports i ON a.import_id = i.id
    WHERE i.tenant_id = $1 
      AND a.created_at >= $2
      AND a.severity IN ('error', 'critical')
    ORDER BY a.created_at DESC
    LIMIT 10
  `, [tenantId, since]);

  return {
    activeImports: activeImportsResult.rows,
    recentImports: recentImportsResult.rows,
    metrics: metricsResult.rows,
    alerts: alertsResult.rows
  };
}