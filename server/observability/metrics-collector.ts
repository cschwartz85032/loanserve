/**
 * Metrics Collection Service
 * Collects stats from various sources for Prometheus metrics
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { instrumentedRabbitMQ } from './instrumented-rabbitmq';
import { 
  initializeMetricCollectors,
  reconcileVarianceGauge,
  outboxLagGauge,
  outboxSizeGauge,
  recordMetric,
  reconcileExceptionsCounter,
  notificationSentCounter,
  notificationFailedCounter,
  paymentsProcessedCounter,
  paymentAmountHistogram
} from './metrics';
import { queueMetricsHistory } from '../services/queue-metrics-history.js';

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  try {
    return await instrumentedRabbitMQ.getQueueStatsForMetrics();
  } catch (error) {
    console.error('[MetricsCollector] Failed to get queue stats:', error);
    return { queues: {}, dlqs: {} };
  }
}

/**
 * Get outbox statistics
 */
export async function getOutboxStats() {
  try {
    // Get pending outbox messages
    const pendingResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM outbox_messages
      WHERE status = 'pending'
    `);
    const pending = parseInt(pendingResult.rows[0].count as string) || 0;

    // Get max lag in seconds
    const lagResult = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) as max_lag
      FROM outbox_messages
      WHERE status = 'pending'
    `);
    const maxLag = parseFloat(lagResult.rows[0]?.max_lag as string) || 0;

    return { pending, maxLag };
  } catch (error) {
    console.error('[MetricsCollector] Failed to get outbox stats:', error);
    return { pending: 0, maxLag: 0 };
  }
}

/**
 * Get reconciliation statistics
 */
export async function getReconcileStats() {
  try {
    // Get total variance from recent reconciliations
    const varianceResult = await db.execute(sql`
      SELECT SUM(ABS(variance_amount)) as total_variance
      FROM reconciliation_exceptions
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const totalVariance = parseFloat(varianceResult.rows[0]?.total_variance as string) || 0;

    // Get exception count
    const exceptionResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM reconciliation_exceptions
      WHERE status = 'pending'
    `);
    const exceptionCount = parseInt(exceptionResult.rows[0].count as string) || 0;

    return { totalVariance, exceptionCount };
  } catch (error) {
    console.error('[MetricsCollector] Failed to get reconciliation stats:', error);
    return { totalVariance: 0, exceptionCount: 0 };
  }
}

/**
 * Get payment statistics
 */
export async function getPaymentStats() {
  try {
    // Get recent payment counts by status
    const result = await db.execute(sql`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(CAST(total_received AS NUMERIC)) as avg_amount
      FROM payments
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY status
    `);

    const stats = {
      total: 0,
      byStatus: {} as Record<string, number>,
      avgAmount: 0,
    };

    for (const row of result.rows) {
      const count = parseInt(row.count as string) || 0;
      stats.total += count;
      stats.byStatus[row.status as string] = count;
      
      if (row.avg_amount) {
        const avgAmount = parseFloat(row.avg_amount as string);
        recordMetric(paymentAmountHistogram, avgAmount, { status: row.status as string });
      }
    }

    return stats;
  } catch (error) {
    console.error('[MetricsCollector] Failed to get payment stats:', error);
    return { total: 0, byStatus: {}, avgAmount: 0 };
  }
}

/**
 * Get notification statistics
 */
export async function getNotificationStats() {
  try {
    // Query notifications using columns that actually exist in the current database
    // Note: email_sent, sms_sent columns don't exist, using status and channel instead
    const result = await db.execute(sql`
      SELECT 
        COUNT(CASE WHEN status = 'sent' AND channel = 'email' THEN 1 END) as emails_sent,
        COUNT(CASE WHEN status = 'sent' AND channel = 'sms' THEN 1 END) as sms_sent,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as total_sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as total_failed,
        COUNT(*) as total_notifications
      FROM notifications
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);

    const emailsSent = parseInt(result.rows[0]?.emails_sent as string) || 0;
    const smsSent = parseInt(result.rows[0]?.sms_sent as string) || 0;
    const totalSent = parseInt(result.rows[0]?.total_sent as string) || 0;
    const totalFailed = parseInt(result.rows[0]?.total_failed as string) || 0;
    const totalNotifications = parseInt(result.rows[0]?.total_notifications as string) || 0;

    // Record to counters
    if (emailsSent > 0) {
      recordMetric(notificationSentCounter, emailsSent, { type: 'email' });
    }
    if (smsSent > 0) {
      recordMetric(notificationSentCounter, smsSent, { type: 'sms' });
    }
    if (totalFailed > 0) {
      recordMetric(notificationFailedCounter, totalFailed, { type: 'any' });
    }

    return { 
      sent: totalSent, 
      failed: totalFailed,
      emailsSent,
      smsSent,
      readNotifications: 0, // Column doesn't exist, return 0
      totalNotifications
    };
  } catch (error) {
    console.error('[MetricsCollector] Failed to get notification stats:', error);
    return { sent: 0, failed: 0, emailsSent: 0, smsSent: 0, readNotifications: 0, totalNotifications: 0 };
  }
}

/**
 * Start periodic metrics collection
 */
export function startMetricsCollection() {
  // Initialize metric collectors with stat functions
  initializeMetricCollectors(
    getQueueStats,
    getOutboxStats,
    getReconcileStats
  );

  // Collect queue metrics history every minute
  setInterval(async () => {
    try {
      // Queue metrics are already collected by the history service
    } catch (error) {
      console.error('[MetricsCollector] Failed to collect queue metrics:', error);
    }
  }, 60000); // 1 minute

  // Collect payment stats every 30 seconds
  setInterval(async () => {
    try {
      const stats = await getPaymentStats();
      if (stats.total > 0) {
        recordMetric(paymentsProcessedCounter, stats.total, {});
      }
    } catch (error) {
      console.error('[MetricsCollector] Failed to collect payment metrics:', error);
    }
  }, 30000); // 30 seconds

  // Collect notification stats every minute
  setInterval(async () => {
    try {
      await getNotificationStats();
    } catch (error) {
      console.error('[MetricsCollector] Failed to collect notification metrics:', error);
    }
  }, 60000); // 1 minute

  console.log('[MetricsCollector] Started periodic metrics collection');
}

/**
 * Stop metrics collection
 */
export function stopMetricsCollection() {
  // Clear all intervals
  const highestIntervalId = setInterval(() => {}, 0) as unknown as number;
  for (let i = 0; i < highestIntervalId; i++) {
    clearInterval(i);
  }
  console.log('[MetricsCollector] Stopped metrics collection');
}