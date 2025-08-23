/**
 * Queue Monitoring API Routes
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { queueMonitor } from '../services/queue-monitor.js';
import { queueMetricsHistory } from '../services/queue-metrics-history.js';

const router = Router();

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
router.post('/queues/:queueName/purge', requireRole(['admin']), async (req, res) => {
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

export default router;