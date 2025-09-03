/**
 * AI Pipeline Monitoring Routes
 * API endpoints for performance monitoring, analytics, and alerting
 */

import { Router } from "express";
import { aiPerformanceMonitor } from "../monitoring/ai-performance";
import { cacheOptimizer } from "../monitoring/cache-optimizer";
import { alertManager } from "../monitoring/alert-manager";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const monitoringRouter = Router();

// Middleware to get tenant ID
function getTenantId(req: any): string {
  return req.user?.tenantId || '00000000-0000-0000-0000-000000000001';
}

/**
 * AI Performance Monitoring
 */
monitoringRouter.get("/monitoring/ai/performance", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { hours = 24, model } = req.query;

    if (model) {
      const stats = await aiPerformanceMonitor.getModelPerformanceStats(
        tenantId, 
        model, 
        parseInt(hours)
      );
      res.json({ model, stats });
    } else {
      // Get all models performance
      const c = await pool.connect();
      try {
        const result = await c.query(
          `SELECT DISTINCT model_name FROM ai_model_metrics 
           WHERE tenant_id = $1 AND timestamp >= now() - interval '${parseInt(hours)} hours'`,
          [tenantId]
        );

        const models = result.rows.map(row => row.model_name);
        const allStats: Record<string, any> = {};

        for (const modelName of models) {
          allStats[modelName] = await aiPerformanceMonitor.getModelPerformanceStats(
            tenantId, 
            modelName, 
            parseInt(hours)
          );
        }

        res.json({ models: allStats });
      } finally {
        c.release();
      }
    }
  } catch (error: any) {
    console.error('AI performance monitoring error:', error);
    res.status(500).json({ error: 'Failed to retrieve AI performance data' });
  }
});

monitoringRouter.get("/monitoring/pipeline/throughput", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { hours = 24 } = req.query;

    const throughput = await aiPerformanceMonitor.getPipelineThroughput(
      tenantId, 
      parseInt(hours)
    );

    res.json({ throughput });
  } catch (error: any) {
    console.error('Pipeline throughput error:', error);
    res.status(500).json({ error: 'Failed to retrieve pipeline throughput' });
  }
});

/**
 * Cache Performance
 */
monitoringRouter.get("/monitoring/cache/analytics", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { hours = 24 } = req.query;

    const analytics = await cacheOptimizer.getCacheAnalytics(tenantId, parseInt(hours));
    res.json({ analytics });
  } catch (error: any) {
    console.error('Cache analytics error:', error);
    res.status(500).json({ error: 'Failed to retrieve cache analytics' });
  }
});

monitoringRouter.get("/monitoring/cache/hit-rates", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const cacheTypes = ['ai_response', 'vendor_data', 'document_analysis'];
    
    const hitRates: Record<string, number> = {};
    for (const cacheType of cacheTypes) {
      hitRates[cacheType] = cacheOptimizer.getHitRate(tenantId, cacheType);
    }

    res.json({ hitRates });
  } catch (error: any) {
    console.error('Cache hit rates error:', error);
    res.status(500).json({ error: 'Failed to retrieve cache hit rates' });
  }
});

/**
 * System Alerts
 */
monitoringRouter.get("/monitoring/alerts", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const alerts = await alertManager.getActiveAlerts(tenantId);
    res.json({ alerts });
  } catch (error: any) {
    console.error('Alerts retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve alerts' });
  }
});

monitoringRouter.post("/monitoring/alerts/:id/acknowledge", async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'system';
    
    await alertManager.acknowledgeAlert(id, userId);
    res.json({ message: 'Alert acknowledged successfully' });
  } catch (error: any) {
    console.error('Alert acknowledgment error:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

monitoringRouter.post("/monitoring/alerts/:id/resolve", async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'system';
    
    await alertManager.resolveAlert(id, userId);
    res.json({ message: 'Alert resolved successfully' });
  } catch (error: any) {
    console.error('Alert resolution error:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

monitoringRouter.get("/monitoring/alerts/stats", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { hours = 24 } = req.query;

    const stats = await alertManager.getAlertStats(tenantId, parseInt(hours));
    res.json({ stats });
  } catch (error: any) {
    console.error('Alert stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve alert statistics' });
  }
});

/**
 * Resource Metrics
 */
monitoringRouter.get("/monitoring/resources", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { hours = 1 } = req.query;

    const c = await pool.connect();
    try {
      const result = await c.query(
        `SELECT 
           resource_type,
           AVG(measurement_value) as avg_value,
           MAX(measurement_value) as max_value,
           measurement_unit
         FROM resource_metrics 
         WHERE tenant_id = $1 AND timestamp >= now() - interval '${parseInt(hours)} hours'
         GROUP BY resource_type, measurement_unit
         ORDER BY resource_type`,
        [tenantId]
      );

      const resources = result.rows.map(row => ({
        type: row.resource_type,
        avgValue: parseFloat(row.avg_value),
        maxValue: parseFloat(row.max_value),
        unit: row.measurement_unit
      }));

      res.json({ resources });
    } finally {
      c.release();
    }
  } catch (error: any) {
    console.error('Resource metrics error:', error);
    res.status(500).json({ error: 'Failed to retrieve resource metrics' });
  }
});

/**
 * Performance Dashboard Data
 */
monitoringRouter.get("/monitoring/dashboard", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { hours = 24 } = req.query;

    // Aggregate dashboard data
    const [
      aiPerformance,
      pipelineThroughput,
      cacheAnalytics,
      activeAlerts,
      alertStats
    ] = await Promise.all([
      aiPerformanceMonitor.getModelPerformanceStats(tenantId, 'grok-2-1212', parseInt(hours)),
      aiPerformanceMonitor.getPipelineThroughput(tenantId, parseInt(hours)),
      cacheOptimizer.getCacheAnalytics(tenantId, parseInt(hours)),
      alertManager.getActiveAlerts(tenantId),
      alertManager.getAlertStats(tenantId, parseInt(hours))
    ]);

    res.json({
      dashboard: {
        aiPerformance,
        pipelineThroughput,
        cacheAnalytics,
        activeAlerts: activeAlerts.length,
        alertStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Dashboard data error:', error);
    res.status(500).json({ error: 'Failed to retrieve dashboard data' });
  }
});

/**
 * Health Check with Monitoring Data
 */
monitoringRouter.get("/monitoring/health", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    
    // Quick health checks
    const aiLatency = await aiPerformanceMonitor.getModelPerformanceStats(tenantId, 'grok-2-1212', 1);
    const cacheHitRate = cacheOptimizer.getHitRate(tenantId, 'ai_response');
    const activeAlerts = await alertManager.getActiveAlerts(tenantId);

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        aiLatency: aiLatency.avgLatency,
        cacheHitRate,
        activeAlerts: activeAlerts.length,
        criticalAlerts: activeAlerts.filter(a => a.severity === 'critical').length
      }
    };

    // Determine overall health
    if (health.metrics.criticalAlerts > 0) {
      health.status = 'critical';
    } else if (health.metrics.aiLatency > 5000 || health.metrics.cacheHitRate < 0.5) {
      health.status = 'degraded';
    }

    res.json(health);
  } catch (error: any) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});