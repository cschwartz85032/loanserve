/**
 * Queue Monitoring API Routes
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { queueMonitor } from '../services/queue-monitor.js';
import { queueMetricsHistory } from '../services/queue-metrics-history.js';
import { spawn, ChildProcess } from 'child_process';
import amqp from 'amqplib';

const router = Router();

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
router.get('/queues', async (req, res) => {
  try {
    const metrics = await queueMonitor.getAllQueueMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching queue metrics:', error);
    res.status(500).json({ error: 'Failed to fetch queue metrics' });
  }
});

/**
 * Get specific queue metrics
 */
router.get('/queues/:queueName', async (req, res) => {
  try {
    const { queueName } = req.params;
    const metrics = await queueMonitor.getQueueMetrics(queueName);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Queue not found' });
    }
    
    res.json(metrics);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching queue metrics:', error);
    res.status(500).json({ error: 'Failed to fetch queue metrics' });
  }
});

/**
 * Get all exchange metrics
 */
router.get('/exchanges', async (req, res) => {
  try {
    const metrics = await queueMonitor.getAllExchangeMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching exchange metrics:', error);
    res.status(500).json({ error: 'Failed to fetch exchange metrics' });
  }
});

/**
 * Get connection metrics
 */
router.get('/connections', async (req, res) => {
  try {
    const metrics = queueMonitor.getConnectionMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching connection metrics:', error);
    res.status(500).json({ error: 'Failed to fetch connection metrics' });
  }
});

/**
 * Get queue health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await queueMonitor.getQueueHealth();
    res.json(health);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching queue health:', error);
    res.status(500).json({ error: 'Failed to fetch queue health' });
  }
});

/**
 * Get aggregated statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await queueMonitor.getAggregatedStats();
    res.json(stats);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * Get message flow rates
 */
router.get('/flow-rates', async (req, res) => {
  try {
    const rates = await queueMonitor.getMessageFlowRates();
    res.json(rates);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching flow rates:', error);
    res.status(500).json({ error: 'Failed to fetch flow rates' });
  }
});

/**
 * Purge a queue (dangerous operation - admin only)
 */
router.post('/queues/:queueName/purge', requireRole('admin'), async (req, res) => {
  try {
    const { queueName } = req.params;
    
    // Prevent purging critical queues
    const protectedQueues = ['payments.validation', 'payments.processing', 'payments.distribution'];
    if (protectedQueues.includes(queueName)) {
      return res.status(403).json({ error: 'Cannot purge protected queue' });
    }
    
    const count = await queueMonitor.purgeQueue(queueName);
    res.json({ 
      success: true, 
      purgedMessages: count,
      message: `Purged ${count} messages from ${queueName}` 
    });
  } catch (error) {
    console.error('[QueueMonitor] Error purging queue:', error);
    res.status(500).json({ error: 'Failed to purge queue' });
  }
});

/**
 * Get historical metrics for charting
 */
router.get('/history', async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 5;
    const history = queueMetricsHistory.getHistory(minutes);
    res.json(history);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch metrics history' });
  }
});

/**
 * Get top queues by message count
 */
router.get('/top-queues', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topQueues = queueMetricsHistory.getTopQueues(limit);
    res.json(topQueues);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching top queues:', error);
    res.status(500).json({ error: 'Failed to fetch top queues' });
  }
});

/**
 * Get processing rate statistics
 */
router.get('/processing-rates', async (req, res) => {
  try {
    const rates = queueMetricsHistory.getProcessingRates();
    res.json(rates);
  } catch (error) {
    console.error('[QueueMonitor] Error fetching processing rates:', error);
    res.status(500).json({ error: 'Failed to fetch processing rates' });
  }
});

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
    
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    
    // Get queue stats before purging
    const stats = await channel.checkQueue(queueName);
    const messageCount = stats.messageCount;
    
    // Purge the queue
    await channel.purgeQueue(queueName);
    
    await channel.close();
    await connection.close();
    
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