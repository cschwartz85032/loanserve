/**
 * Import Monitor Service
 * Provides comprehensive monitoring and progress tracking for import operations
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
  private db: ReturnType<typeof drizzle>;
  private importId: string;
  private tenantId: string;
  private userId?: string;
  private stageStartTimes: Map<ImportStage, Date> = new Map();

  constructor(
    client: postgres.Sql,
    importId: string,
    tenantId: string,
    userId?: string
  ) {
    this.db = drizzle(client);
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

    // Create or update progress record
    const existing = await this.db
      .select()
      .from(importProgress)
      .where(and(
        eq(importProgress.importId, this.importId),
        eq(importProgress.stage, stage)
      ))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(importProgress)
        .set({
          status: 'in_progress',
          startedAt: startTime,
          recordsTotal: totalRecords,
          recordsProcessed: 0,
          recordsSuccess: 0,
          recordsFailed: 0,
          recordsSkipped: 0,
          metadata: metadata || {},
          updatedAt: startTime
        })
        .where(eq(importProgress.id, existing[0].id));
    } else {
      await this.db.insert(importProgress).values({
        importId: this.importId,
        tenantId: this.tenantId,
        stage,
        status: 'in_progress',
        startedAt: startTime,
        recordsTotal: totalRecords,
        recordsProcessed: 0,
        recordsSuccess: 0,
        recordsFailed: 0,
        recordsSkipped: 0,
        metadata: metadata || {}
      });
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
    const progress = await this.db
      .select()
      .from(importProgress)
      .where(and(
        eq(importProgress.importId, this.importId),
        eq(importProgress.stage, stage)
      ))
      .limit(1);

    if (progress.length === 0) {
      throw new Error(`No progress record found for stage ${stage}`);
    }

    await this.db
      .update(importProgress)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(importProgress.id, progress[0].id));
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

    const progress = await this.db
      .select()
      .from(importProgress)
      .where(and(
        eq(importProgress.importId, this.importId),
        eq(importProgress.stage, stage)
      ))
      .limit(1);

    if (progress.length > 0) {
      await this.db
        .update(importProgress)
        .set({
          status,
          completedAt,
          durationMs,
          errorDetails: errorDetails || null,
          updatedAt: completedAt
        })
        .where(eq(importProgress.id, progress[0].id));
    }

    // Log audit event
    await this.logEvent({
      eventType: 'stage_complete',
      stage,
      message: `Completed ${stage} stage with status: ${status}`,
      details: { 
        durationMs, 
        status,
        recordsProcessed: progress[0]?.recordsProcessed || 0,
        recordsSuccess: progress[0]?.recordsSuccess || 0,
        recordsFailed: progress[0]?.recordsFailed || 0
      },
      severity: status === 'failed' ? 'error' : 'info'
    });

    // Update import status if stage failed
    if (status === 'failed') {
      await this.db
        .update(imports)
        .set({
          status: 'failed',
          errorCount: sql`${imports.errorCount} + 1`,
          updatedAt: completedAt
        })
        .where(eq(imports.id, this.importId));
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
    // Update progress counters
    const progress = await this.db
      .select()
      .from(importProgress)
      .where(and(
        eq(importProgress.importId, this.importId),
        eq(importProgress.stage, stage)
      ))
      .limit(1);

    if (progress.length > 0) {
      const updates: any = {
        recordsProcessed: (progress[0].recordsProcessed || 0) + 1,
        currentRecord: { identifier: recordIdentifier, ...details },
        updatedAt: new Date()
      };

      if (success) {
        updates.recordsSuccess = (progress[0].recordsSuccess || 0) + 1;
      } else {
        updates.recordsFailed = (progress[0].recordsFailed || 0) + 1;
      }

      await this.db
        .update(importProgress)
        .set(updates)
        .where(eq(importProgress.id, progress[0].id));
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
    await this.db.insert(importAuditLog).values({
      importId: this.importId,
      eventType: event.eventType,
      stage: event.stage || null,
      recordIdentifier: event.recordIdentifier || null,
      message: event.message,
      details: event.details || {},
      severity: event.severity,
      stackTrace: event.stackTrace || null,
      userId: this.userId || null,
      correlationId: event.correlationId || null
    });
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
    const importResult = await this.db.query(
      'SELECT * FROM imports WHERE id = $1 LIMIT 1',
      [this.importId]
    );
    const importData = importResult.rows[0];

    const stagesResult = await this.db.query(
      'SELECT * FROM import_progress WHERE import_id = $1 ORDER BY created_at',
      [this.importId]
    );
    const stages = stagesResult.rows;

    const currentStage = stages.find(s => s.status === 'in_progress')?.stage as ImportStage;
    
    // Calculate overall progress
    const totalRecords = stages.reduce((sum, s) => sum + (s.total_records || 0), 0);
    const processedRecords = stages.reduce((sum, s) => sum + (s.processed_records || 0), 0);
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
    const result = await this.db.query(
      'SELECT * FROM import_audit_log WHERE import_id = $1 ORDER BY created_at DESC LIMIT $2',
      [this.importId, limit]
    );
    return result.rows;
  }

  /**
   * Update aggregated metrics (called after import completion)
   */
  async updateMetrics(): Promise<void> {
    const stagesResult = await this.db.query(
      'SELECT * FROM import_progress WHERE import_id = $1',
      [this.importId]
    );
    const stages = stagesResult.rows;

    const importResult = await this.db.query(
      'SELECT * FROM imports WHERE id = $1 LIMIT 1',
      [this.importId]
    );
    const importData = importResult.rows[0];

    if (!importData) return;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 59, 59);

    // Calculate total processing time
    const totalDurationMs = stages.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
    const totalRecords = stages.reduce((sum, s) => sum + (s.processed_records || 0), 0);
    const successRecords = stages.reduce((sum, s) => sum + (s.success_records || 0), 0);
    const failedRecords = stages.reduce((sum, s) => sum + (s.failed_records || 0), 0);

    // Update or create hourly metrics
    const existingResult = await this.db.query(
      `SELECT * FROM import_metrics_hourly 
       WHERE tenant_id = $1 AND period = $2 AND period_start = $3 LIMIT 1`,
      [this.tenantId, 'hour', periodStart]
    );
    const existing = existingResult.rows;

    if (existing.length > 0) {
      await this.db.query(
        `UPDATE import_metrics_hourly 
         SET total_imports = total_imports + 1,
             successful_imports = successful_imports + $1,
             failed_imports = failed_imports + $2,
             total_records = total_records + $3,
             successful_records = successful_records + $4,
             failed_records = failed_records + $5,
             avg_processing_time_ms = (avg_processing_time_ms * total_imports + $6) / (total_imports + 1)
         WHERE id = $7`,
        [
          importData.status === 'completed' ? 1 : 0,
          importData.status === 'failed' ? 1 : 0,
          totalRecords,
          successRecords,
          failedRecords,
          totalDurationMs,
          existing[0].id
        ]
      );
    } else {
      await this.db.query(
        `INSERT INTO import_metrics_hourly 
         (tenant_id, period, period_start, period_end, total_imports, successful_imports, 
          failed_imports, total_records, successful_records, failed_records, avg_processing_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          this.tenantId,
          'hour',
          periodStart,
          periodEnd,
          1,
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
    SELECT 
      i.*,
      p.stage,
      p.current_record,
      p.total_records,
      p.processed_records,
      p.failed_records,
      p.percentage_complete,
      p.estimated_completion
    FROM imports i
    LEFT JOIN import_progress p ON i.id = p.import_id
    WHERE i.tenant_id = $1 
      AND i.status = 'processing'
    ORDER BY i.created_at DESC
  `, [tenantId]);
  const activeImports = activeImportsResult.rows;

  // Get recent imports
  const recentImportsResult = await client.query(`
    SELECT * FROM imports
    WHERE tenant_id = $1 
      AND created_at >= $2
    ORDER BY created_at DESC
    LIMIT 20
  `, [tenantId, since]);
  const recentImports = recentImportsResult.rows;

  // Get aggregated metrics
  const metricsResult = await client.query(`
    SELECT * FROM import_metrics
    WHERE tenant_id = $1 
      AND period_start >= $2
    ORDER BY period_start DESC
  `, [tenantId, since]);
  const metrics = metricsResult.rows;

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
  const alerts = alertsResult.rows;

  return {
    activeImports,
    recentImports,
    metrics,
    alerts
  };
}