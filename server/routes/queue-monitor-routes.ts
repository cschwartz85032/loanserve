/**
 * Queue Monitoring API Routes
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { queueMonitor } from '../services/queue-monitor.js';
import { queueMetricsHistory } from '../services/queue-metrics-history.js';
import { spawn, ChildProcess } from 'child_process';
import amqp from 'amqplib';
import { sendError, sendSuccess, asyncHandler } from '../utils/api-helpers.js';
import { loggers } from '../utils/logger.js';

const router = Router();
const logger = loggers.queue;

// Test runner state
let testProcess: ChildProcess | null = null;
let testStartTime: number | null = null;
const TEST_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// All queue monitoring routes require admin role
router.use(requireAuth);
router.use(requireRole('admin', 'servicer'));

/**
 * Get all queue metrics
 */
router.get('/queues', asyncHandler(async (req, res) => {
  const metrics = await queueMonitor.getAllQueueMetrics();
  sendSuccess(res, metrics);
}));

/**
 * Get specific queue metrics
 */
router.get('/queues/:queueName', asyncHandler(async (req, res) => {
  const { queueName } = req.params;
  const metrics = await queueMonitor.getQueueMetrics(queueName);
  
  if (!metrics) {
    return sendError(res, 404, 'Queue not found', 'QUEUE_NOT_FOUND');
  }
  
  sendSuccess(res, metrics);
}));

/**
 * Get all exchange metrics
 */
router.get('/exchanges', asyncHandler(async (req, res) => {
  const metrics = await queueMonitor.getAllExchangeMetrics();
  sendSuccess(res, metrics);
}));

/**
 * Get connection metrics
 */
router.get('/connections', asyncHandler(async (req, res) => {
  const metrics = queueMonitor.getConnectionMetrics();
  sendSuccess(res, metrics);
}));

/**
 * Get queue health status
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await queueMonitor.getQueueHealth();
  sendSuccess(res, health);
}));

/**
 * Get aggregated statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await queueMonitor.getAggregatedStats();
  sendSuccess(res, stats);
}));

/**
 * Get message flow rates
 */
router.get('/flow-rates', asyncHandler(async (req, res) => {
  const rates = await queueMonitor.getMessageFlowRates();
  sendSuccess(res, rates);
}));

/**
 * Purge a queue (dangerous operation - admin only)
 */
router.post('/queues/:queueName/purge', requireRole('admin'), asyncHandler(async (req, res) => {
  const { queueName } = req.params;
  
  // Prevent purging critical queues
  const protectedQueues = ['payments.validation', 'payments.processing', 'payments.distribution'];
  if (protectedQueues.includes(queueName)) {
    return sendError(res, 403, 'Cannot purge protected queue', 'PROTECTED_QUEUE');
  }
  
  const count = await queueMonitor.purgeQueue(queueName);
  logger.warn(`Queue purged: ${queueName}`, { purgedMessages: count });
  
  sendSuccess(res, { purgedMessages: count }, `Purged ${count} messages from ${queueName}`);
}));

/**
 * Get historical metrics for charting
 */
router.get('/history', asyncHandler(async (req, res) => {
  const minutes = parseInt(req.query.minutes as string) || 5;
  const history = queueMetricsHistory.getHistory(minutes);
  sendSuccess(res, history);
}));

/**
 * Get top queues by message count
 */
router.get('/top-queues', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const topQueues = queueMetricsHistory.getTopQueues(limit);
  sendSuccess(res, topQueues);
}));

/**
 * Get processing rate statistics
 */
router.get('/processing-rates', asyncHandler(async (req, res) => {
  const rates = queueMetricsHistory.getProcessingRates();
  sendSuccess(res, rates);
}));

/**
 * Purge DLQ (dead letter queue)
 */
router.post('/purge-dlq', requireRole('admin'), async (req, res) => {
  try {
    const { queueName } = req.body;
    
    // Only allow purging DLQ queues
    if (!queueName || !queueName.startsWith('dlq.')) {
      return res.status(400).json({ error: 'Can only purge dead letter queues' });
    }
    
    // Connect directly to RabbitMQ to purge
    const url = process.env.CLOUDAMQP_URL;
    if (!url) {
      return res.status(500).json({ error: 'RabbitMQ URL not configured' });
    }
    
    // Use unified client for admin operations
    const { rabbitmqClient } = await import('../services/rabbitmq-unified');
    const connection = await rabbitmqClient.getAdminConnection();
    const channel = await connection.createChannel();
    
    // Get queue stats before purging
    const stats = await channel.checkQueue(queueName);
    const messageCount = stats.messageCount;
    
    // Purge the queue
    await channel.purgeQueue(queueName);
    
    await channel.close();
    // Don't close unified client connection - it's pooled
    
    console.log(`[QueueMonitor] Purged ${messageCount} messages from ${queueName}`);
    
    res.json({
      success: true,
      queueName,
      purgedCount: messageCount,
      message: `Successfully purged ${messageCount} messages from ${queueName}`
    });
  } catch (error) {
    console.error('[QueueMonitor] Error purging DLQ:', error);
    res.status(500).json({ error: 'Failed to purge dead letter queue' });
  }
});

/**
 * Control test runner
 */
router.post('/test-runner', requireRole('admin'), async (req, res) => {
  try {
    const { action } = req.body;
    
    if (action === 'start') {
      // Stop existing test if running
      if (testProcess) {
        testProcess.kill();
        testProcess = null;
      }
      
      // Start new test process
      testProcess = spawn('tsx', ['scripts/test-queue-infrastructure.ts'], {
        stdio: 'inherit'
      });
      
      testStartTime = Date.now();
      
      // Set up auto-stop after 30 minutes
      setTimeout(() => {
        if (testProcess) {
          console.log('[QueueMonitor] Test runner reached 30 minute timeout, stopping...');
          testProcess.kill();
          testProcess = null;
          testStartTime = null;
        }
      }, TEST_TIMEOUT);
      
      testProcess.on('exit', (code, signal) => {
        console.log(`[QueueMonitor] Test runner exited with code ${code} and signal ${signal}`);
        testProcess = null;
        testStartTime = null;
      });
      
      res.json({
        success: true,
        running: true,
        message: 'Test runner started successfully'
      });
      
    } else if (action === 'stop') {
      if (testProcess) {
        testProcess.kill();
        testProcess = null;
        testStartTime = null;
        
        res.json({
          success: true,
          running: false,
          message: 'Test runner stopped successfully'
        });
      } else {
        res.json({
          success: false,
          running: false,
          message: 'No test runner is currently running'
        });
      }
      
    } else if (action === 'status') {
      const isRunning = testProcess !== null;
      const runtime = isRunning && testStartTime ? Date.now() - testStartTime : 0;
      
      res.json({
        running: isRunning,
        runtime,
        timeRemaining: isRunning ? Math.max(0, TEST_TIMEOUT - runtime) : 0
      });
      
    } else {
      res.status(400).json({ error: 'Invalid action. Use "start", "stop", or "status"' });
    }
    
  } catch (error) {
    console.error('[QueueMonitor] Error controlling test runner:', error);
    res.status(500).json({ error: 'Failed to control test runner' });
  }
});

export default router;