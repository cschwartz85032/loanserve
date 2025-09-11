/**
 * Import Monitoring API Routes
 * Provides real-time monitoring and progress tracking endpoints
 */

import { Router, Request, Response } from 'express';
import { ImportMonitor, getMonitoringDashboard } from '../services/import-monitor';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, and, desc, gte } from 'drizzle-orm';
import { 
  imports, 
  importProgress, 
  importAuditLog,
  importMetrics 
} from '../database/ai-pipeline-schema';
import { withTenantClient } from '../db/withTenantClient';

const router = Router();

/**
 * Get monitoring dashboard data
 * GET /api/imports/monitoring/dashboard
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId || '00000000-0000-0000-0000-000000000001';
    const { timeRange = 'day' } = req.query;

    const dashboard = await withTenantClient(tenantId, async (client) => {
      return await getMonitoringDashboard(
        client,
        tenantId,
        timeRange as 'hour' | 'day' | 'week'
      );
    });

    res.json(dashboard);
  } catch (error) {
    console.error('Error fetching monitoring dashboard:', error);
    res.status(500).json({ 
      error: 'Failed to fetch monitoring dashboard',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get detailed status for a specific import
 * GET /api/imports/monitoring/:importId/status
 */
router.get('/:importId/status', async (req: Request, res: Response) => {
  try {
    const { importId } = req.params;
    const tenantId = (req as any).user?.tenantId || '00000000-0000-0000-0000-000000000001';
    const userId = (req as any).user?.id;

    const status = await withTenantClient(tenantId, async (client) => {
      const monitor = new ImportMonitor(client, importId, tenantId, userId);
      return await monitor.getImportStatus();
    });

    res.json(status);
  } catch (error) {
    console.error(`Error fetching import status for ${req.params.importId}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch import status',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get progress for all stages of an import
 * GET /api/imports/monitoring/:importId/progress
 */
router.get('/:importId/progress', async (req: Request, res: Response) => {
  try {
    const { importId } = req.params;
    const tenantId = (req as any).user?.tenantId || '00000000-0000-0000-0000-000000000001';
    
    const progress = await withTenantClient(tenantId, async (client) => {
      const db = drizzle(client);
    
    // Verify import belongs to tenant
    const importRecord = await db
      .select()
      .from(imports)
      .where(and(
        eq(imports.id, importId),
        eq(imports.tenantId, tenantId)
      ))
      .limit(1);
    
    if (importRecord.length === 0) {
      return res.status(404).json({ error: 'Import not found' });
    }

    const progress = await db
      .select()
      .from(importProgress)
      .where(eq(importProgress.importId, importId))
      .orderBy(importProgress.createdAt);

      return { 
        importId,
        stages: progress,
        summary: {
          totalStages: progress.length,
          completedStages: progress.filter(p => p.status === 'completed').length,
          failedStages: progress.filter(p => p.status === 'failed').length,
          currentStage: progress.find(p => p.status === 'in_progress')?.stage
        }
      };
    });

    res.json(progress);
  } catch (error) {
    console.error(`Error fetching import progress for ${req.params.importId}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch import progress',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get audit log events for an import
 * GET /api/imports/monitoring/:importId/events
 */
router.get('/:importId/events', async (req: Request, res: Response) => {
  try {
    const { importId } = req.params;
    const tenantId = (req as any).user?.tenantId || '00000000-0000-0000-0000-000000000001';
    const { limit = 100, severity, eventType } = req.query;
    
    const result = await withTenantClient(tenantId, async (client) => {
      const db = drizzle(client);
    
    // Verify import belongs to tenant
    const importRecord = await db
      .select()
      .from(imports)
      .where(and(
        eq(imports.id, importId),
        eq(imports.tenantId, tenantId)
      ))
      .limit(1);
    
    if (importRecord.length === 0) {
      return res.status(404).json({ error: 'Import not found' });
    }

    let query = db
      .select()
      .from(importAuditLog)
      .where(eq(importAuditLog.importId, importId))
      .$dynamic();

    // Add filters if provided
    const conditions = [eq(importAuditLog.importId, importId)];
    
    if (severity) {
      conditions.push(eq(importAuditLog.severity, severity as string));
    }
    
    if (eventType) {
      conditions.push(eq(importAuditLog.eventType, eventType as string));
    }

    const events = await db
      .select()
      .from(importAuditLog)
      .where(and(...conditions))
      .orderBy(desc(importAuditLog.createdAt))
      .limit(Number(limit));

      return { importId, events };
    });

    if (!result) {
      return res.status(404).json({ error: 'Import not found' });
    }

    res.json({ 
      importId: result.importId,
      events: result.events,
      count: result.events.length
    });
  } catch (error) {
    console.error(`Error fetching import events for ${req.params.importId}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch import events',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get aggregated metrics for imports
 * GET /api/imports/monitoring/metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId || '00000000-0000-0000-0000-000000000001';
    const { period = 'hour', since } = req.query;

    const result = await withTenantClient(tenantId, async (client) => {
      const db = drizzle(client);
    const sinceDate = since ? new Date(since as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const metrics = await db
      .select()
      .from(importMetrics)
      .where(and(
        eq(importMetrics.tenantId, tenantId),
        eq(importMetrics.period, period as string),
        gte(importMetrics.periodStart, sinceDate)
      ))
      .orderBy(desc(importMetrics.periodStart));

    // Calculate summary statistics
    const summary = metrics.reduce((acc, m) => ({
      totalImports: acc.totalImports + (m.totalImports || 0),
      successfulImports: acc.successfulImports + (m.successfulImports || 0),
      failedImports: acc.failedImports + (m.failedImports || 0),
      totalRecords: acc.totalRecords + (m.totalRecords || 0),
      successfulRecords: acc.successfulRecords + (m.successfulRecords || 0),
      failedRecords: acc.failedRecords + (m.failedRecords || 0)
    }), {
      totalImports: 0,
      successfulImports: 0,
      failedImports: 0,
      totalRecords: 0,
      successfulRecords: 0,
      failedRecords: 0
    });

      return { 
        period,
        since: sinceDate,
        metrics,
        summary
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching import metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch import metrics',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get real-time status of all active imports
 * GET /api/imports/monitoring/active
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId || '00000000-0000-0000-0000-000000000001';

    const activeImports = await withTenantClient(tenantId, async (client) => {
      const db = drizzle(client);

    // Get all processing imports with their current progress
    const activeImports = await db
      .select({
        import: imports,
        currentStage: importProgress.stage,
        stageStatus: importProgress.status,
        recordsProcessed: importProgress.recordsProcessed,
        recordsTotal: importProgress.recordsTotal,
        startedAt: importProgress.startedAt
      })
      .from(imports)
      .leftJoin(
        importProgress,
        and(
          eq(imports.id, importProgress.importId),
          eq(importProgress.status, 'in_progress')
        )
      )
      .where(and(
        eq(imports.tenantId, tenantId),
        eq(imports.status, 'processing')
      ))
      .orderBy(desc(imports.createdAt));

      return activeImports;
    });

    res.json({ 
      activeImports,
      count: activeImports.length
    });
  } catch (error) {
    console.error('Error fetching active imports:', error);
    res.status(500).json({ 
      error: 'Failed to fetch active imports',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get import error summary
 * GET /api/imports/monitoring/errors
 */
router.get('/errors', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId || '00000000-0000-0000-0000-000000000001';
    const { since, limit = 50 } = req.query;

    const result = await withTenantClient(tenantId, async (client) => {
      const db = drizzle(client);
      const sinceDate = since ? new Date(since as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get recent errors from audit log
    const errors = await db
      .select({
        importId: importAuditLog.importId,
        filename: imports.filename,
        stage: importAuditLog.stage,
        message: importAuditLog.message,
        details: importAuditLog.details,
        createdAt: importAuditLog.createdAt
      })
      .from(importAuditLog)
      .innerJoin(imports, eq(importAuditLog.importId, imports.id))
      .where(and(
        eq(imports.tenantId, tenantId),
        gte(importAuditLog.createdAt, sinceDate),
        eq(importAuditLog.severity, 'error')
      ))
      .orderBy(desc(importAuditLog.createdAt))
      .limit(Number(limit));

    // Group errors by type
    const errorsByType: Record<string, number> = {};
    errors.forEach(error => {
      const errorType = (error.details as any)?.errorType || 'Unknown';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    });

      return { 
        errors,
        errorsByType,
        count: errors.length,
        since: sinceDate
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching import errors:', error);
    res.status(500).json({ 
      error: 'Failed to fetch import errors',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;