/**
 * Import Monitoring API Routes
 * Provides real-time monitoring and progress tracking endpoints
 * REFACTORED: Uses only raw SQL queries with PoolClient
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ImportMonitor, getMonitoringDashboard } from '../services/import-monitor';
import { withTenantClient } from '../db/withTenantClient';

const router = Router();

// Default tenant ID for single-tenant deployments
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// Authentication middleware - all monitoring routes require authentication
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Set tenant ID - use from user session or default for single-tenant deployments
  if (!(req as any).user) {
    return res.status(403).json({ error: 'Invalid user session' });
  }
  
  // Ensure tenant context is available (use default if not set)
  if (!(req as any).user.tenantId) {
    (req as any).user.tenantId = DEFAULT_TENANT_ID;
    console.log(`[Auth] Using default tenant ID for user ${(req as any).user.id}`);
  }
  
  next();
}

/**
 * Get monitoring dashboard data
 * GET /api/imports/monitoring/dashboard
 */
router.get('/dashboard', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId; // No fallback - auth required
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
router.get('/:importId/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { importId } = req.params;
    const tenantId = (req as any).user.tenantId; // No fallback - auth required
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
router.get('/:importId/progress', requireAuth, async (req: Request, res: Response) => {
  try {
    const { importId } = req.params;
    const tenantId = (req as any).user.tenantId; // No fallback - auth required
    
    const progress = await withTenantClient(tenantId, async (client) => {
      // Verify import belongs to tenant
      const importResult = await client.query(
        'SELECT * FROM imports WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [importId, tenantId]
      );
      
      if (importResult.rows.length === 0) {
        return null; // Will handle 404 outside callback
      }

      // Get all progress stages
      const progressResult = await client.query(
        `SELECT * FROM import_progress 
         WHERE import_id = $1 AND tenant_id = $2 
         ORDER BY created_at`,
        [importId, tenantId]
      );

      const progressStages = progressResult.rows;
      
      return { 
        importId,
        stages: progressStages,
        summary: {
          totalStages: progressStages.length,
          completedStages: progressStages.filter(p => p.status === 'completed').length,
          failedStages: progressStages.filter(p => p.status === 'failed').length,
          currentStage: progressStages.find(p => p.status === 'in_progress')?.stage
        }
      };
    });

    if (!progress) {
      return res.status(404).json({ error: 'Import not found' });
    }

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
router.get('/:importId/events', requireAuth, async (req: Request, res: Response) => {
  try {
    const { importId } = req.params;
    const tenantId = (req as any).user.tenantId; // No fallback - auth required
    const { limit = 100, severity, eventType } = req.query;
    
    const result = await withTenantClient(tenantId, async (client) => {
      // Verify import belongs to tenant
      const importResult = await client.query(
        'SELECT * FROM imports WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [importId, tenantId]
      );
      
      if (importResult.rows.length === 0) {
        return null; // Will handle 404 outside callback
      }

      // Build query with optional filters
      let query = `
        SELECT * FROM import_audit_log 
        WHERE import_id = $1
      `;
      const params: any[] = [importId];
      let paramIndex = 2;
      
      if (severity) {
        query += ` AND severity = $${paramIndex}`;
        params.push(severity);
        paramIndex++;
      }
      
      if (eventType) {
        query += ` AND event_type = $${paramIndex}`;
        params.push(eventType);
        paramIndex++;
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
      params.push(Number(limit));

      const eventsResult = await client.query(query, params);
      
      return { 
        importId, 
        events: eventsResult.rows 
      };
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
router.get('/metrics', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId; // No fallback - auth required
    const { period = 'hour', since } = req.query;

    const result = await withTenantClient(tenantId, async (client) => {
      const sinceDate = since ? new Date(since as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);

      const metricsResult = await client.query(
        `SELECT * FROM import_metrics_hourly 
         WHERE tenant_id = $1 AND period = $2 AND period_start >= $3
         ORDER BY period_start DESC`,
        [tenantId, period, sinceDate]
      );

      const metrics = metricsResult.rows;

      // Calculate summary statistics
      const summary = metrics.reduce((acc, m) => ({
        totalImports: acc.totalImports + (m.total_imports || 0),
        successfulImports: acc.successfulImports + (m.successful_imports || 0),
        failedImports: acc.failedImports + (m.failed_imports || 0),
        totalRecords: acc.totalRecords + (m.total_records || 0),
        successfulRecords: acc.successfulRecords + (m.successful_records || 0),
        failedRecords: acc.failedRecords + (m.failed_records || 0)
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
router.get('/active', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId; // No fallback - auth required

    const activeImports = await withTenantClient(tenantId, async (client) => {
      // Get all processing imports with their current progress
      const result = await client.query(
        `SELECT 
          i.*,
          p.stage as current_stage,
          p.status as stage_status,
          p.records_processed,
          p.records_total,
          p.started_at as stage_started_at
        FROM imports i
        LEFT JOIN import_progress p ON i.id = p.import_id 
          AND p.tenant_id = i.tenant_id
          AND p.status = 'in_progress'
        WHERE i.tenant_id = $1 
          AND i.status = 'processing'
        ORDER BY i.created_at DESC`,
        [tenantId]
      );

      return result.rows;
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
router.get('/errors', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId; // No fallback - auth required
    const { since, limit = 50 } = req.query;

    const result = await withTenantClient(tenantId, async (client) => {
      const sinceDate = since ? new Date(since as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Get recent errors from audit log
      const errorsResult = await client.query(
        `SELECT 
          a.import_id,
          i.filename,
          a.stage,
          a.message,
          a.details,
          a.created_at
        FROM import_audit_log a
        INNER JOIN imports i ON a.import_id = i.id
        WHERE i.tenant_id = $1 
          AND a.created_at >= $2
          AND a.severity = 'error'
        ORDER BY a.created_at DESC
        LIMIT $3`,
        [tenantId, sinceDate, Number(limit)]
      );

      const errors = errorsResult.rows;

      // Group errors by type
      const errorsByType: Record<string, number> = {};
      errors.forEach(error => {
        const errorType = error.details?.errorType || 'Unknown';
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