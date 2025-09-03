import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { healthMonitor } from '../utils/enhanced-health-monitor';

const router = Router();

interface QueueMetrics {
  name: string;
  depth: number;
}

interface QueueInfo {
  total: number;
  totalDepth: number;
  dlqCount: number;
  dlqDepth: number;
  topQueues: QueueMetrics[];
}

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  checks: {
    database: {
      status: 'ok' | 'error';
      responseTime?: number;
      error?: string;
    };
    rabbitmq: {
      status: 'ok' | 'warning' | 'error';
      connected?: boolean;
      error?: string;
      warning?: string;
      queues?: QueueInfo;
    };
    environment: {
      status: 'ok' | 'warning';
      nodeEnv: string;
      featuresEnabled: {
        payments: boolean;
        reconciliation: boolean;
        webhooks: boolean;
      };
    };
  };
}

/**
 * GET /healthz
 * Enhanced health check endpoint with comprehensive system monitoring
 * Returns 200 if all critical services are healthy
 * Returns 503 if any critical service is down
 */
router.get('/', async (req, res) => {
  try {
    const health = await healthMonitor.runAllChecks();
    
    // Convert to HTTP status codes
    const httpStatus = health.overall === 'healthy' ? 200 : 
                      health.overall === 'degraded' ? 206 : 503;
    
    res.status(httpStatus).json(health);
  } catch (error: any) {
    console.error('Health check failed:', error);
    res.status(503).json({
      overall: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check system failure',
      details: error.message
    });
  }
});

/**
 * GET /healthz/live
 * Liveness probe - simple check that the service is running
 * Used by Kubernetes/orchestrators to determine if container should be restarted
 */
router.get('/live', (req, res) => {
  const isAlive = healthMonitor.isAlive();
  res.status(200).json({ 
    status: 'live',
    alive: isAlive,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /healthz/metrics
 * Performance metrics for health checks
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = healthMonitor.getPerformanceMetrics();
    const history = healthMonitor.getCheckHistory();
    
    res.status(200).json({
      performance: metrics,
      historyCount: Object.fromEntries(
        Array.from(history.entries()).map(([name, checks]) => [name, checks.length])
      ),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get health metrics',
      details: error.message
    });
  }
});

/**
 * GET /healthz/history/:checkName?
 * Get health check history for trending analysis
 */
router.get('/history/:checkName?', (req, res) => {
  try {
    const { checkName } = req.params;
    const history = healthMonitor.getCheckHistory(checkName);
    
    const result = Object.fromEntries(history.entries());
    
    res.status(200).json({
      history: result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get health history',
      details: error.message
    });
  }
});

/**
 * GET /healthz/ready
 * Readiness probe - checks if service is ready to accept traffic
 * Used by load balancers to determine if instance should receive requests
 */
router.get('/ready', async (req, res) => {
  try {
    const readiness = await healthMonitor.isReady();
    
    if (readiness.ready) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        reason: readiness.reason,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    res.status(503).json({
      status: 'not_ready',
      reason: 'Readiness check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;