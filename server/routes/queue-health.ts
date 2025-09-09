/**
 * Queue Health API Routes - Phase 2: Observability
 * Provides REST endpoints for queue monitoring and health checks
 */

import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { globalQueueMonitor } from '../../src/queues/monitoring/queue-monitor';

const router = Router();

/**
 * GET /api/queue-health
 * Get overall queue system health
 */
router.get('/queue-health', requireAuth, async (req, res) => {
  try {
    const health = globalQueueMonitor.getHealth();
    
    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Queue Health API] Error getting health status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve queue health status',
      message: error.message
    });
  }
});

/**
 * GET /api/queue-health/detailed
 * Get detailed queue metrics and performance data
 */
router.get('/queue-health/detailed', requireAuth, async (req, res) => {
  try {
    const metrics = await globalQueueMonitor.getDetailedMetrics();
    
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Queue Health API] Error getting detailed metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve detailed queue metrics',
      message: error.message
    });
  }
});

/**
 * POST /api/queue-health/refresh
 * Force refresh of health metrics
 */
router.post('/queue-health/refresh', requireAuth, async (req, res) => {
  try {
    const health = await globalQueueMonitor.refreshHealth();
    
    res.json({
      success: true,
      data: health,
      message: 'Queue health metrics refreshed successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Queue Health API] Error refreshing health status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh queue health metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/queue-health/status
 * Simple health check endpoint for monitoring systems
 */
router.get('/queue-health/status', async (req, res) => {
  try {
    const health = globalQueueMonitor.getHealth();
    
    // Simple status response for monitoring
    res.status(health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 503)
       .json({
         status: health.status,
         message: health.status === 'healthy' 
           ? 'All queue systems operating normally' 
           : `Queue system issues detected: ${health.issues.length} issues`,
         queues_active: health.totalConsumers > 0,
         messages_pending: health.totalMessages,
         last_check: health.lastUpdated
       });
    
  } catch (error) {
    console.error('[Queue Health API] Error in status check:', error);
    res.status(503).json({
      status: 'critical',
      message: 'Queue monitoring system unavailable',
      error: error.message
    });
  }
});

export default router;