import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { getEnhancedRabbitMQService } from '../services/rabbitmq-enhanced';

const router = Router();

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
      status: 'ok' | 'error';
      connected?: boolean;
      error?: string;
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
 * Health check endpoint for monitoring and deployment validation
 * Returns 200 if all critical services are healthy
 * Returns 503 if any critical service is down
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const health: HealthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'ok' },
      rabbitmq: { status: 'ok' },
      environment: {
        status: 'ok',
        nodeEnv: process.env.NODE_ENV || 'development',
        featuresEnabled: {
          payments: process.env.PAYMENTS_FEATURE_FLAG === 'true',
          reconciliation: process.env.PAYMENT_RECONCILE_ENABLED === 'true',
          webhooks: process.env.PAYMENT_WEBHOOK_ENABLED === 'true'
        }
      }
    }
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    health.checks.database.responseTime = Date.now() - dbStart;
  } catch (error: any) {
    health.checks.database.status = 'error';
    health.checks.database.error = error.message || 'Database connection failed';
    health.status = 'error';
  }

  // Check RabbitMQ connectivity
  try {
    const rabbitmq = getEnhancedRabbitMQService();
    const connectionInfo = rabbitmq.getConnectionInfo();
    health.checks.rabbitmq.connected = connectionInfo.connected;
    
    if (!connectionInfo.connected) {
      health.checks.rabbitmq.status = 'error';
      health.checks.rabbitmq.error = 'RabbitMQ not connected';
      health.status = 'error';
    }
  } catch (error: any) {
    health.checks.rabbitmq.status = 'error';
    health.checks.rabbitmq.error = error.message || 'RabbitMQ check failed';
    health.status = 'error';
  }

  // Check environment configuration
  if (!process.env.CLOUDAMQP_URL) {
    health.checks.environment.status = 'warning';
    if (health.status === 'ok') {
      health.status = 'degraded';
    }
  }

  // Set appropriate HTTP status code
  const httpStatus = health.status === 'ok' ? 200 : 503;

  res.status(httpStatus).json(health);
});

/**
 * GET /healthz/live
 * Liveness probe - simple check that the service is running
 * Used by Kubernetes/orchestrators to determine if container should be restarted
 */
router.get('/live', (req, res) => {
  res.status(200).json({ 
    status: 'live'
  });
});

/**
 * GET /healthz/ready
 * Readiness probe - checks if service is ready to accept traffic
 * Used by load balancers to determine if instance should receive requests
 */
router.get('/ready', async (req, res) => {
  const checks: { db?: { ok: boolean }, rabbit?: { ok: boolean } } = {};

  // Database check: execute a simple SELECT 1 using the pool provided
  try {
    await db.execute(sql`SELECT 1`);
    checks.db = { ok: true };
  } catch (error) {
    checks.db = { ok: false };
  }

  // RabbitMQ check: ensure there is an active connection
  try {
    const rabbitmq = getEnhancedRabbitMQService();
    const connectionInfo = rabbitmq.getConnectionInfo();
    if (connectionInfo.connected) {
      checks.rabbit = { ok: true };
    } else {
      checks.rabbit = { ok: false };
    }
  } catch (error) {
    checks.rabbit = { ok: false };
  }

  // If either check fails, respond with HTTP 503 
  const allOk = checks.db?.ok && checks.rabbit?.ok;
  
  if (allOk) {
    res.status(200).json({
      status: 'ready',
      checks
    });
  } else {
    res.status(503).json({
      status: 'degraded', 
      checks
    });
  }
});

export default router;